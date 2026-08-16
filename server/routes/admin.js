const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { sendOTPEmail } = require('../services/emailService');
const { getDatabase } = require('../database/init');
const { JWT_SECRET } = require('../middleware/auth');
const { generateOTP } = require('../utils/otp');

// In-memory rate limiting (use Redis in production)
const otpRateLimits = new Map();
const MAX_OTP_REQUESTS = 5; // Max 5 requests per email
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const OTP_EXPIRY = 5 * 60 * 1000; // 5 minutes

// Clean up old rate limit entries every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [email, data] of otpRateLimits.entries()) {
    if (now - data.firstAttempt > RATE_LIMIT_WINDOW) {
      otpRateLimits.delete(email);
    }
  }
}, RATE_LIMIT_WINDOW);

/**
 * Check rate limit for OTP requests
 */
function checkRateLimit(email) {
  const now = Date.now();
  const emailData = otpRateLimits.get(email);

  if (!emailData) {
    otpRateLimits.set(email, { count: 1, firstAttempt: now });
    return true;
  }

  // Reset if window has passed
  if (now - emailData.firstAttempt > RATE_LIMIT_WINDOW) {
    otpRateLimits.set(email, { count: 1, firstAttempt: now });
    return true;
  }

  // Check if limit exceeded
  if (emailData.count >= MAX_OTP_REQUESTS) {
    return false;
  }

  // Increment counter
  emailData.count++;
  return true;
}

/**
 * POST /admin/send-otp
 * Send OTP to admin email
 */
router.post('/send-otp', async (req, res) => {
  const { email } = req.body;

  // Validate email
  if (!email || !email.trim()) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Get database connection
  const db = getDatabase();

  try {
    // Check if email is in admin whitelist
    const admin = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM admin_whitelist WHERE email = ? AND is_active = 1',
        [normalizedEmail],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!admin) {
      // Don't reveal whether email exists - security best practice
      return res.status(403).json({ error: 'Unauthorized: Invalid admin credentials' });
    }

    // Check rate limit
    if (!checkRateLimit(normalizedEmail)) {
      return res.status(429).json({ 
        error: 'Too many OTP requests. Please try again later.',
        retryAfter: Math.ceil(RATE_LIMIT_WINDOW / 60000) // minutes
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY);
    const ipAddress = req.ip || req.connection.remoteAddress;

    // Store OTP in database
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO admin_otps (email, otp, expires_at, ip_address) VALUES (?, ?, ?, ?)',
        [normalizedEmail, otp, expiresAt.toISOString(), ipAddress],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Send OTP via email
    const emailSent = await sendOTPEmail(normalizedEmail, otp);

    if (!emailSent) {
      return res.status(500).json({ 
        error: 'Failed to send OTP. Please contact system administrator.',
        hint: 'Email service may not be configured'
      });
    }

    res.json({
      success: true,
      message: 'Verification code sent to your email',
      expiresIn: 300 // seconds
    });

  } catch (error) {
    console.error('Error sending OTP:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /admin/verify-otp
 * Verify OTP and issue JWT token
 */
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  // Validate input
  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedOTP = otp.trim();

  // Validate OTP format (6 digits)
  if (!/^\d{6}$/.test(normalizedOTP)) {
    return res.status(400).json({ error: 'Invalid OTP format. Must be 6 digits' });
  }

  const db = getDatabase();

  try {
    // Check if email is in admin whitelist
    const admin = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM admin_whitelist WHERE email = ? AND is_active = 1',
        [normalizedEmail],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!admin) {
      return res.status(403).json({ error: 'Unauthorized: Invalid admin credentials' });
    }

    // Find the OTP
    const otpRecord = await new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM admin_otps 
         WHERE email = ? AND otp = ? AND is_used = 0 
         ORDER BY created_at DESC LIMIT 1`,
        [normalizedEmail, normalizedOTP],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!otpRecord) {
      return res.status(401).json({ error: 'Invalid OTP code' });
    }

    // Check if OTP has expired
    const expiresAt = new Date(otpRecord.expires_at);
    if (Date.now() > expiresAt.getTime()) {
      // Mark as used to prevent reuse
      await new Promise((resolve, reject) => {
        db.run(
          'UPDATE admin_otps SET is_used = 1 WHERE id = ?',
          [otpRecord.id],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      return res.status(401).json({ error: 'OTP has expired. Please request a new code' });
    }

    // Mark OTP as used
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE admin_otps SET is_used = 1 WHERE id = ?',
        [otpRecord.id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Delete old OTPs for this email
    db.run('DELETE FROM admin_otps WHERE email = ? AND id != ?', [normalizedEmail, otpRecord.id]);

    // Generate JWT token with admin role
    const token = jwt.sign(
      {
        email: normalizedEmail,
        name: admin.name,
        role: 'ADMIN',
        adminId: admin.id
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Clear rate limit on successful login
    otpRateLimits.delete(normalizedEmail);

    console.log(`✅ Admin logged in: ${normalizedEmail}`);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      admin: {
        email: admin.email,
        name: admin.name,
        role: 'ADMIN'
      }
    });

  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/profile
 * Get admin profile (requires authentication)
 */
router.get('/profile', async (req, res) => {
  // Extract token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Check if user has admin role
    if (decoded.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    res.json({
      success: true,
      admin: {
        email: decoded.email,
        name: decoded.name,
        role: decoded.role
      }
    });

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired. Please login again' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    console.error('Error verifying token:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

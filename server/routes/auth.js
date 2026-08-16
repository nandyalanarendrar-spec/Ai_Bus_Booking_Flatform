const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDatabase } = require('../database/init');
const { JWT_SECRET } = require('../middleware/auth');
const { sendOTPEmail, sendPasswordResetEmail } = require('../services/emailService');
const { authenticateToken } = require('../middleware/auth');
const { generateOTP } = require('../utils/otp');

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    const db = getDatabase();
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user as unverified
    db.run(
      'INSERT INTO users (username, email, password, verified) VALUES (?, ?, ?, 0)',
      [username, email, hashedPassword],
      async function(err) {
        if (err) {
          console.error('[Register Error] DB error creating user:', err);
          const msg = (err.message || '').toLowerCase();
          if (msg.includes('unique') || msg.includes('duplicate')) {
            return res.status(400).json({ error: 'Username or email already exists' });
          }
          return res.status(500).json({ error: `Registration failed: ${err.message || 'Database error'}` });
        }
        
        // Generate and store OTP
        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes
        
        // Delete any existing OTPs for this email
        db.run('DELETE FROM user_otps WHERE email = ?', [email], async (deleteErr) => {
          if (deleteErr) {
            console.error('Error deleting old OTPs:', deleteErr);
          }
          
          // Store new OTP
          db.run(
            'INSERT INTO user_otps (email, otp, expires_at) VALUES (?, ?, ?)',
            [email, otp, expiresAt],
            async (otpErr) => {
              if (otpErr) {
                console.error('Error storing OTP:', otpErr);
                return res.status(500).json({ error: 'Failed to send verification email' });
              }
              
              // Send OTP email with 12s timeout to prevent hanging on SMTP network blocks
              try {
                const sendPromise = sendOTPEmail(email, otp);
                const timeoutPromise = new Promise((_, reject) => 
                  setTimeout(() => reject(new Error('Email dispatch timed out')), 12000)
                );
                
                const sent = await Promise.race([sendPromise, timeoutPromise]);
                if (sent) {
                  return res.status(201).json({ 
                    message: 'Registration successful. Please check your email for verification code.',
                    email: email,
                    requiresVerification: true,
                    emailSent: true
                  });
                } else {
                  console.warn(`[Register Warning] Email dispatch returned false for ${email}. Directing to verification screen.`);
                  return res.status(201).json({ 
                    message: 'Account created! Verification code generated. Check spam folder or click Resend OTP.',
                    email: email,
                    requiresVerification: true,
                    emailSent: false
                  });
                }
              } catch (emailErr) {
                console.error('Error or timeout sending email:', emailErr.message);
                // Return verification screen so user can enter OTP or click Resend
                return res.status(201).json({ 
                  message: 'Registration created! Verification code generated. Please check email or click Resend OTP.',
                  email: email,
                  requiresVerification: true,
                  emailSent: false
                });
              }
            }
          );
        });
      }
    );
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req, res) => {
  // Hard 15-second timeout — browser never hangs forever
  const loginTimeout = setTimeout(() => {
    if (!res.headersSent) {
      console.error('Customer login TIMED OUT after 15s');
      res.status(503).json({ error: 'Login timed out. Please try again.' });
    }
  }, 15000);

  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      clearTimeout(loginTimeout);
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const db = getDatabase();
    const normalizedUsername = username.trim().toLowerCase();
    const t0 = Date.now();
    console.log(`[Customer Login] Attempting login for: ${normalizedUsername}`);
    
    db.get(
      'SELECT * FROM users WHERE LOWER(username) = ? OR LOWER(email) = ?',
      [normalizedUsername, normalizedUsername],
      async (err, user) => {
        console.log(`[Customer Login] DB query took ${Date.now() - t0}ms`);

        if (err) {
          clearTimeout(loginTimeout);
          console.error('Customer login DB error:', err);
          return res.status(500).json({ error: 'Login failed' });
        }
        
        if (!user) {
          clearTimeout(loginTimeout);
          return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        try {
          const t1 = Date.now();
          const validPassword = await bcrypt.compare(password, user.password);
          console.log(`[Customer Login] bcrypt.compare took ${Date.now() - t1}ms`);

          if (!validPassword) {
            clearTimeout(loginTimeout);
            return res.status(401).json({ error: 'Invalid credentials' });
          }
          
          if (!user.verified) {
            clearTimeout(loginTimeout);
            // Generate and send a fresh OTP so user receives it in their Gmail inbox immediately
            const otp = generateOTP();
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
            
            db.run('DELETE FROM user_otps WHERE email = ?', [user.email], () => {
              db.run('INSERT INTO user_otps (email, otp, expires_at) VALUES (?, ?, ?)', [user.email, otp, expiresAt], () => {
                sendOTPEmail(user.email, otp).catch(e => console.error('Login OTP email dispatch error:', e.message));
              });
            });

            return res.status(403).json({ 
              error: 'Email not verified. A fresh verification code has been sent to your Gmail inbox.',
              requiresVerification: true,
              email: user.email
            });
          }
          
          const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
          clearTimeout(loginTimeout);
          console.log(`[Customer Login] SUCCESS for ${normalizedUsername} in ${Date.now() - t0}ms`);
          return res.json({ 
            message: 'Login successful',
            token,
            user: { id: user.id, username: user.username, email: user.email }
          });
        } catch (bcryptErr) {
          clearTimeout(loginTimeout);
          console.error('Customer login bcrypt error:', bcryptErr);
          return res.status(500).json({ error: 'Login failed during password check' });
        }
      }
    );
  } catch (error) {
    clearTimeout(loginTimeout);
    console.error('Customer login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});


// Verify Email with OTP
router.post('/verify-email', async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required' });
    }

    const db = getDatabase();
    
    // Check if OTP exists and is valid
    db.get(
      'SELECT * FROM user_otps WHERE email = ? AND otp = ? ORDER BY created_at DESC LIMIT 1',
      [email, otp],
      (err, otpRecord) => {
        if (err) {
          return res.status(500).json({ error: 'Verification failed' });
        }
        
        if (!otpRecord) {
          return res.status(400).json({ error: 'Invalid OTP code' });
        }
        
        // Check if OTP has expired
        const expiresAt = new Date(otpRecord.expires_at);
        if (expiresAt < new Date()) {
          return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
        }
        
        // Update user as verified
        db.run(
          'UPDATE users SET verified = 1 WHERE email = ?',
          [email],
          function(updateErr) {
            if (updateErr) {
              return res.status(500).json({ error: 'Verification failed' });
            }
            
            // Delete used OTP
            db.run('DELETE FROM user_otps WHERE email = ?', [email]);
            
            // Get user details to generate token
            db.get('SELECT * FROM users WHERE email = ?', [email], (getUserErr, user) => {
              if (getUserErr || !user) {
                return res.status(500).json({ error: 'Verification successful but login failed' });
              }
              
              const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
              
              res.json({ 
                message: 'Email verified successfully',
                token,
                user: { id: user.id, username: user.username, email: user.email }
              });
            });
          }
        );
      }
    );
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Resend OTP
router.post('/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const db = getDatabase();
    
    // Check if user exists and is not verified
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to resend OTP' });
      }
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      if (user.verified) {
        return res.status(400).json({ error: 'Email is already verified' });
      }
      
      // Generate new OTP
      const otp = generateOTP();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes
      
      // Delete old OTPs
      db.run('DELETE FROM user_otps WHERE email = ?', [email], (deleteErr) => {
        if (deleteErr) {
          console.error('Error deleting old OTPs:', deleteErr);
        }
        
        // Store new OTP
        db.run(
          'INSERT INTO user_otps (email, otp, expires_at) VALUES (?, ?, ?)',
          [email, otp, expiresAt],
          async (otpErr) => {
            if (otpErr) {
              return res.status(500).json({ error: 'Failed to generate OTP' });
            }
            
            // Send OTP email
            try {
              const sent = await sendOTPEmail(email, otp);
              if (sent) {
                res.json({ message: 'OTP sent successfully. Please check your email inbox or spam folder.' });
              } else {
                res.status(500).json({ error: 'Failed to dispatch email. Please check EMAIL_USER & EMAIL_APP_PASSWORD in Render settings.' });
              }
            } catch (emailErr) {
              console.error('Error sending email:', emailErr);
              res.status(500).json({ error: 'Failed to send verification email' });
            }
          }
        );
      });
    });
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ error: 'Failed to resend OTP' });
  }
});

// Forgot Password - generates temp password and emails it
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const db = getDatabase();
    
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Server error' });
      }
      
      if (!user) {
        // Don't reveal if email exists or not for security
        return res.json({ message: 'If an account with this email exists, a new password has been sent.' });
      }
      
      // Generate a random temporary password (8 chars, alphanumeric + special)
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$!';
      let tempPassword = '';
      for (let i = 0; i < 10; i++) {
        tempPassword += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      
      // Hash and update password
      const hashedPassword = await bcrypt.hash(tempPassword, 10);
      
      db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, user.id], async (updateErr) => {
        if (updateErr) {
          return res.status(500).json({ error: 'Failed to reset password' });
        }
        
        // Send email with username and temporary password
        const emailSent = await sendPasswordResetEmail(email, user.username, tempPassword);
        
        if (emailSent) {
          res.json({ message: 'A new temporary password has been sent to your email.' });
        } else {
          res.status(500).json({ error: 'Failed to send email. Please try again.' });
        }
      });
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Change Password - requires authentication
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    const db = getDatabase();
    
    db.get('SELECT * FROM users WHERE id = ?', [userId], async (err, user) => {
      if (err || !user) {
        return res.status(500).json({ error: 'User not found' });
      }
      
      // Verify current password
      const validPassword = await bcrypt.compare(currentPassword, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
      
      // Hash and update new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      
      db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, user.id], (updateErr) => {
        if (updateErr) {
          return res.status(500).json({ error: 'Failed to update password' });
        }
        
        res.json({ message: 'Password changed successfully' });
      });
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Verify current token
router.get('/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// Diagnostic endpoint to test email dispatch live
router.get('/test-email', async (req, res) => {
  const targetEmail = req.query.email || process.env.EMAIL_USER || 'nnrreddy.123456789@gmail.com';
  console.log(`🧪 Diagnostics: Testing email dispatch to ${targetEmail}...`);
  const success = await sendOTPEmail(targetEmail, '123456');
  res.json({
    timestamp: new Date().toISOString(),
    targetEmail,
    envEmailUser: process.env.EMAIL_USER || 'nnrreddy.123456789@gmail.com',
    hasAppPasswordEnv: !!process.env.EMAIL_APP_PASSWORD,
    dispatchSuccess: success,
    status: success ? 'EMAIL_DISPATCHED_OK' : 'DISPATCH_FAILED_CHECK_RENDER_LOGS'
  });
});

module.exports = router;

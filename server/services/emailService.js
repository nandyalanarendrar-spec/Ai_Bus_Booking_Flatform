const nodemailer = require('nodemailer');

// Email configuration - Use environment variables in production (sanitize whitespace/spaces)
const EMAIL_USER = (process.env.EMAIL_USER || 'nnrreddy.123456789@gmail.com').trim();
const EMAIL_APP_PASSWORD = (process.env.EMAIL_APP_PASSWORD || 'kuvxnjnublmcnpik').replace(/\s+/g, '').trim();

// Create transporter using Gmail service for maximum cloud host compatibility (Render, Heroku, AWS, etc.)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_APP_PASSWORD
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Verify transporter configuration asynchronously without blocking startup
transporter.verify((error, success) => {
  if (error) {
    console.error('⚠️  Email SMTP verification error:', error.message);
    console.error('   Ensure EMAIL_USER and EMAIL_APP_PASSWORD (16-char App Password without spaces) are set correctly in Render Settings.');
  } else {
    console.log(`✅ Email service ready & authenticated for ${EMAIL_USER}`);
  }
});

/**
 * Send OTP email to admin
 * @param {string} email - Admin email address
 * @param {string} otp - 6-digit OTP code
 * @returns {Promise<boolean>} - Success status
 */
async function sendOTPEmail(email, otp) {
  const mailOptions = {
    from: `"Public Bus Booking" <${EMAIL_USER}>`,
    to: email,
    subject: 'Email Verification - Public Bus Booking',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .otp-box { background: white; border: 2px dashed #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
          .otp-code { font-size: 36px; font-weight: bold; color: #667eea; letter-spacing: 8px; margin: 10px 0; }
          .info { background: #e3f2fd; border-left: 4px solid #2196f3; padding: 15px; margin: 20px 0; }
          .warning { color: #d32f2f; font-weight: bold; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Email Verification</h1>
          </div>
          <div class="content">
            <h2>Welcome to Public Bus Booking!</h2>
            <p>Thank you for registering. Please verify your email address to complete your registration.</p>
            
            <div class="otp-box">
              <p style="margin: 0; color: #666;">Enter this code to verify your email:</p>
              <div class="otp-code">${otp}</div>
            </div>
            
            <div class="info">
              <strong>⏰ Validity:</strong> This code will expire in <strong>5 minutes</strong><br>
              <strong>🎯 Purpose:</strong> Email verification for account activation<br>
              <strong>🔒 Security:</strong> This is a one-time use code
            </div>
            
            <p class="warning">⚠️ If you didn't create an account, please ignore this email.</p>
            
            <p style="margin-top: 20px; color: #666;">
              For security reasons, do not share this code with anyone. Our team will never ask for your verification code.
            </p>
          </div>
          <div class="footer">
            <p>Public Bus Booking - Your Travel Partner</p>
            <p>This is an automated email. Please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 OTP sent to ${email}`);
    return true;
  } catch (error) {
    console.error('❌ Error sending email:', error.message);
    return false;
  }
}

/**
 * Send booking confirmation email
 * @param {string} email - User email address
 * @param {object} bookingDetails - Booking information
 * @returns {Promise<boolean>} - Success status
 */
async function sendBookingConfirmationEmail(email, bookingDetails) {
  const {
    pnr,
    busName,
    busNumber,
    fromCity,
    toCity,
    travelDate,
    departureTime,
    arrivalTime,
    seatNumbers,
    passengerName,
    totalPrice,
    bookings
  } = bookingDetails || {};

  const displayPnr = pnr || (bookings && bookings.length > 0 ? bookings.map(b => b.pnr).join(', ') : 'N/A');
  const displayPassengers = passengerName || (bookings && bookings.length > 0 ? bookings.map(b => b.passengerName).join(', ') : 'Passenger');
  const displaySeats = seatNumbers || (bookings && bookings.length > 0 ? bookings.map(b => b.seatNumber).join(', ') : 'N/A');

  let formattedDate = travelDate || '';
  try {
    if (travelDate) {
      formattedDate = new Date(travelDate + 'T00:00:00').toLocaleDateString('en-IN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }
  } catch (e) {
    formattedDate = travelDate;
  }

  const mailOptions = {
    from: `"Public Bus Booking" <${EMAIL_USER}>`,
    to: email,
    subject: `🎉 Booking Confirmed - PNR: ${displayPnr}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .ticket-box { background: white; border: 3px solid #10b981; border-radius: 12px; padding: 25px; margin: 20px 0; }
          .pnr-code { font-size: 24px; font-weight: bold; color: #10b981; letter-spacing: 2px; text-align: center; margin: 15px 0; background: #f0fdf4; padding: 15px; border-radius: 8px; word-break: break-all; }
          .detail-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb; }
          .detail-label { font-weight: bold; color: #6b7280; }
          .detail-value { color: #111827; font-weight: 600; text-align: right; }
          .important-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          .success-icon { font-size: 48px; text-align: center; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="success-icon">✅</div>
            <h1>Booking Confirmed!</h1>
            <p style="margin: 0; font-size: 18px;">Your ticket has been successfully booked</p>
          </div>
          <div class="content">
            <h2 style="color: #10b981; margin-top: 0;">🎫 Ticket Details</h2>
            
            <div class="ticket-box">
              <div style="text-align: center; color: #6b7280; font-size: 14px; margin-bottom: 5px;">PNR NUMBER(S)</div>
              <div class="pnr-code">${displayPnr}</div>
              
              <div style="margin-top: 25px;">
                <div class="detail-row">
                  <span class="detail-label">🚌 Bus</span>
                  <span class="detail-value">${busName || ''} (${busNumber || ''})</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">👤 Passenger(s)</span>
                  <span class="detail-value">${displayPassengers}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">📍 From</span>
                  <span class="detail-value">${fromCity || ''}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">📍 To</span>
                  <span class="detail-value">${toCity || ''}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">📅 Travel Date</span>
                  <span class="detail-value">${formattedDate}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">🕐 Departure</span>
                  <span class="detail-value">${departureTime || ''}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">🕐 Arrival</span>
                  <span class="detail-value">${arrivalTime || ''}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">💺 Seat Number(s)</span>
                  <span class="detail-value">${displaySeats}</span>
                </div>
                <div class="detail-row" style="border-bottom: none; margin-top: 10px; background: #f0fdf4; padding: 15px; border-radius: 8px;">
                  <span class="detail-label" style="font-size: 18px;">💰 Total Amount</span>
                  <span class="detail-value" style="font-size: 24px; color: #10b981;">₹${totalPrice}</span>
                </div>
              </div>
            </div>
            
            <div class="important-box">
              <strong>⚠️ Important Instructions:</strong><br>
              • Please carry a valid ID proof while traveling<br>
              • Report at the boarding point 15 minutes before departure<br>
              • Keep your PNR number safe for reference<br>
              • You can view/cancel your booking from "My Bookings" page
            </div>
            
            <div style="text-align: center; margin-top: 25px;">
              <p style="color: #6b7280; margin: 5px 0;">Have a safe journey! 🚌</p>
              <p style="color: #10b981; font-weight: bold; margin: 5px 0;">Thank you for choosing Public Bus Booking</p>
            </div>
          </div>
          <div class="footer">
            <p>Public Bus Booking - Your Travel Partner</p>
            <p>This is an automated email. Please do not reply.</p>
            <p style="margin-top: 10px;">Need help? Contact our support team</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Booking confirmation sent to ${email} (PNR: ${displayPnr})`);
    return true;
  } catch (error) {
    console.error('❌ Error sending booking confirmation:', error.message);
    return false;
  }
}

/**
 * Send cancellation confirmation email
 * @param {string} email - User email address
 * @param {object} cancellationDetails - Cancellation information
 * @returns {Promise<boolean>} - Success status
 */
async function sendCancellationEmail(email, cancellationDetails) {
  const {
    pnr,
    busName,
    busNumber,
    fromCity,
    toCity,
    travelDate,
    seatNumbers,
    totalPrice,
    refundAmount,
    refundPercentage
  } = cancellationDetails;

  const formattedDate = new Date(travelDate + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const mailOptions = {
    from: `"Public Bus Booking" <${EMAIL_USER}>`,
    to: email,
    subject: `🔄 Booking Cancelled - PNR: ${pnr}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .ticket-box { background: white; border: 3px solid #ef4444; border-radius: 12px; padding: 25px; margin: 20px 0; }
          .pnr-code { font-size: 28px; font-weight: bold; color: #ef4444; letter-spacing: 4px; text-align: center; margin: 15px 0; background: #fef2f2; padding: 15px; border-radius: 8px; }
          .detail-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb; }
          .detail-label { font-weight: bold; color: #6b7280; }
          .detail-value { color: #111827; font-weight: 600; text-align: right; }
          .refund-box { background: #d1fae5; border: 2px solid #10b981; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
          .refund-amount { font-size: 32px; font-weight: bold; color: #10b981; margin: 10px 0; }
          .info-box { background: #e0f2fe; border-left: 4px solid #0284c7; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div style="font-size: 48px;">🔄</div>
            <h1>Booking Cancelled</h1>
            <p style="margin: 0; font-size: 18px;">Your cancellation has been processed</p>
          </div>
          <div class="content">
            <h2 style="color: #ef4444; margin-top: 0;">📋 Cancellation Details</h2>
            
            <div class="ticket-box">
              <div style="text-align: center; color: #6b7280; font-size: 14px; margin-bottom: 5px;">CANCELLED PNR</div>
              <div class="pnr-code">${pnr}</div>
              
              <div style="margin-top: 25px;">
                <div class="detail-row">
                  <span class="detail-label">🚌 Bus</span>
                  <span class="detail-value">${busName} (${busNumber})</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">📍 Route</span>
                  <span class="detail-value">${fromCity} → ${toCity}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">📅 Travel Date</span>
                  <span class="detail-value">${formattedDate}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">💺 Seats Cancelled</span>
                  <span class="detail-value">${seatNumbers}</span>
                </div>
                <div class="detail-row" style="border-bottom: none;">
                  <span class="detail-label">💰 Original Amount</span>
                  <span class="detail-value">₹${totalPrice}</span>
                </div>
              </div>
            </div>
            
            <div class="refund-box">
              <div style="color: #059669; font-size: 16px; font-weight: bold; margin-bottom: 10px;">💵 REFUND AMOUNT</div>
              <div class="refund-amount">₹${refundAmount}</div>
              <div style="color: #059669; font-size: 14px; margin-top: 5px;">
                (${refundPercentage}% of booking amount)
              </div>
            </div>
            
            <div class="info-box">
              <strong>ℹ️ Refund Information:</strong><br>
              • Refund will be processed within 5-7 business days<br>
              • Amount will be credited to your original payment method<br>
              • You will receive a separate email once refund is processed<br>
              • For queries, contact support with your PNR number
            </div>
            
            <div style="text-align: center; margin-top: 25px; padding: 20px; background: white; border-radius: 8px;">
              <p style="color: #6b7280; margin: 5px 0;">We're sorry to see you cancel your booking.</p>
              <p style="color: #6b7280; margin: 5px 0;">We hope to serve you again soon! 🙏</p>
            </div>
          </div>
          <div class="footer">
            <p>Public Bus Booking - Your Travel Partner</p>
            <p>This is an automated email. Please do not reply.</p>
            <p style="margin-top: 10px;">Need help? Contact our support team</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Cancellation confirmation sent to ${email} (PNR: ${pnr})`);
    return true;
  } catch (error) {
    console.error('❌ Error sending cancellation email:', error.message);
    return false;
  }
}

/**
 * Send account deletion notification (by admin/owner)
 * @param {string} email
 * @param {string} username
 * @returns {Promise<boolean>}
 */
async function sendAccountDeletionEmail(email, username) {
  const mailOptions = {
    from: `"Public Bus Booking" <${EMAIL_USER}>`,
    to: email,
    subject: `Account Removed - Public Bus Booking`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #333;">
        <h2 style="color:#ef4444;">Account Removed</h2>
        <p>Hi ${username || 'User'},</p>
        <p>This is to inform you that your account on <strong>Public Bus Booking</strong> has been removed by an administrator.</p>
        <p>If you believe this was done in error, please contact our support team.</p>
        <p style="margin-top:16px;">Regards,<br/>Public Bus Booking Team</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Account deletion email sent to ${email}`);
    return true;
  } catch (error) {
    console.error('❌ Error sending account deletion email:', error.message);
    return false;
  }
}

/**
 * Send admin-initiated cancellation email
 * @param {string} email
 * @param {object} details - { pnr, busName, busNumber, travelDate }
 */
async function sendAdminCancellationEmail(email, details) {
  const { pnr, busName, busNumber, travelDate } = details || {};
  const formattedDate = travelDate ? new Date(travelDate + 'T00:00:00').toLocaleDateString('en-IN') : '';

  const mailOptions = {
    from: `"Public Bus Booking" <${EMAIL_USER}>`,
    to: email,
    subject: `Booking Cancelled by Admin - PNR: ${pnr || ''}`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #333;">
        <h2 style="color:#ef4444;">Booking Cancelled by Administrator</h2>
        <p>Your booking has been cancelled by an administrator.</p>
        <ul>
          <li><strong>PNR:</strong> ${pnr || 'N/A'}</li>
          <li><strong>Bus:</strong> ${busName || ''} (${busNumber || ''})</li>
          <li><strong>Travel Date:</strong> ${formattedDate}</li>
        </ul>
        <p>If applicable, any refunds will be processed to your original payment method. For questions, contact support.</p>
        <p style="margin-top:16px;">Regards,<br/>Public Bus Booking Team</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Admin cancellation email sent to ${email} (PNR: ${pnr})`);
    return true;
  } catch (error) {
    console.error('❌ Error sending admin cancellation email:', error.message);
    return false;
  }
}

module.exports = { sendOTPEmail, sendBookingConfirmationEmail, sendCancellationEmail, sendAccountDeletionEmail, sendAdminCancellationEmail, sendPasswordResetEmail };

/**
 * Send temporary password email
 * @param {string} email - User email
 * @param {string} username - User's username
 * @param {string} tempPassword - New temporary password
 * @returns {Promise<boolean>}
 */
async function sendPasswordResetEmail(email, username, tempPassword) {
  const mailOptions = {
    from: `"Public Bus Booking" <${EMAIL_USER}>`,
    to: email,
    subject: 'Password Reset - Public Bus Booking',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #e53e3e 0%, #c53030 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .creds-box { background: white; border: 2px dashed #e53e3e; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
          .cred-label { font-size: 14px; color: #666; margin: 0; }
          .cred-value { font-size: 24px; font-weight: bold; color: #e53e3e; letter-spacing: 2px; margin: 5px 0 15px 0; font-family: monospace; }
          .info { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
          .warning { color: #d32f2f; font-weight: bold; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔑 Password Reset</h1>
          </div>
          <div class="content">
            <h2>Your Account Credentials</h2>
            <p>You requested a password reset for your Public Bus Booking account. Here are your login credentials:</p>
            
            <div class="creds-box">
              <p class="cred-label">Your Username:</p>
              <div class="cred-value">${username}</div>
              <hr style="border: 1px solid #eee; margin: 10px 0;">
              <p class="cred-label">Your New Password:</p>
              <div class="cred-value">${tempPassword}</div>
            </div>
            
            <div class="info">
              <strong>⚠️ Important:</strong><br>
              • Use the above username and password to log in<br>
              • We strongly recommend changing your password after logging in<br>
              • This password was auto-generated for security
            </div>
            
            <p class="warning">⚠️ If you didn't request this reset, please contact support immediately.</p>
          </div>
          <div class="footer">
            <p>Public Bus Booking - Your Travel Partner</p>
            <p>This is an automated email. Please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Password reset email sent to ${email}`);
    return true;
  } catch (error) {
    console.error('❌ Error sending password reset email:', error.message);
    return false;
  }
}

/**
 * Send cancellation & refund email notification when an operator cancels a schedule/route
 * @param {Object} details - Booking & schedule details
 * @returns {Promise<boolean>}
 */
async function sendServiceCancellationEmail(details) {
  const { email, passenger_name, pnr, seat_numbers, total_price, travel_date, departure_time, from_city, to_city, bus_name } = details;

  if (!email) return false;

  const mailOptions = {
    from: `"BusGo Reservations" <${EMAIL_USER}>`,
    to: email,
    subject: `⚠️ Service Cancellation & Full Refund Notice - PNR: ${pnr}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; }
          .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 32px 24px; text-align: center; }
          .header h1 { margin: 0; font-size: 22px; font-weight: 700; }
          .header p { margin: 8px 0 0 0; opacity: 0.9; font-size: 14px; }
          .content { padding: 32px 24px; }
          .alert-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 18px; margin-bottom: 24px; color: #991b1b; font-size: 14px; }
          .details-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px; }
          .details-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #cbd5e1; font-size: 14px; }
          .details-row:last-child { border-bottom: none; }
          .label { color: #64748b; font-weight: 500; }
          .value { color: #0f172a; font-weight: 600; }
          .refund-banner { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; text-align: center; color: #166534; margin-bottom: 24px; }
          .refund-amount { font-size: 28px; font-weight: 800; color: #15803d; margin: 6px 0; }
          .footer { text-align: center; padding: 24px; background: #f1f5f9; color: #64748b; font-size: 12px; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⚠️ Bus Service Cancellation Notice</h1>
            <p>Important update regarding your upcoming journey</p>
          </div>
          <div class="content">
            <p>Dear <strong>${passenger_name || 'Valued Passenger'}</strong>,</p>
            <div class="alert-box">
              Due to unavoidable technical and operational issues, the bus operator has stopped/cancelled the scheduled service for <strong>${bus_name || 'your bus'}</strong> on <strong>${travel_date}</strong>. We sincerely apologize for this disruption to your travel plans.
            </div>

            <div class="details-card">
              <div class="details-row"><span class="label">PNR Number:</span><span class="value">${pnr}</span></div>
              <div class="details-row"><span class="label">Route:</span><span class="value">${from_city} → ${to_city}</span></div>
              <div class="details-row"><span class="label">Bus Name:</span><span class="value">${bus_name}</span></div>
              <div class="details-row"><span class="label">Travel Date:</span><span class="value">${travel_date} at ${departure_time}</span></div>
              <div class="details-row"><span class="label">Seats:</span><span class="value">${seat_numbers}</span></div>
            </div>

            <div class="refund-banner">
              <div style="font-weight: 700; font-size: 12px; letter-spacing: 1px;">FULL REFUND INITIATED</div>
              <div class="refund-amount">₹${total_price}</div>
              <div style="font-size: 13px;">The complete booking amount has been refunded back to your original payment method. Please allow 1-3 business days for it to reflect in your bank account.</div>
            </div>

            <p style="font-size: 13px; color: #64748b;">If you have any questions or need alternative travel assistance, please contact our support team.</p>
          </div>
          <div class="footer">
            &copy; BusGo AI Bus Booking Systems. All rights reserved.
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Cancellation email sent to ${email} for PNR ${pnr}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send cancellation email to ${email}:`, error.message);
    return false;
  }
}

module.exports = {
  sendOTPEmail,
  sendBookingConfirmationEmail,
  sendCancellationEmail,
  sendPasswordResetEmail,
  sendAccountDeletionEmail,
  sendAdminCancellationEmail,
  sendServiceCancellationEmail
};

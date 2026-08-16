# Admin OTP Login System - Documentation

## 📋 Overview

The Bus Booking System now includes a secure admin panel with OTP (One-Time Password) based authentication via email. Only whitelisted admin emails can access the admin portal.

---

## 🔐 Security Features

✅ **Email-only authentication** - No passwords to remember  
✅ **OTP via email** - 6-digit code sent to verified admin emails  
✅ **Time-limited codes** - OTPs expire after 5 minutes  
✅ **One-time use** - Each OTP can only be used once  
✅ **Rate limiting** - Max 5 OTP requests per 15 minutes per email  
✅ **Admin whitelist** - Only pre-approved emails can access  
✅ **JWT tokens** - Secure session management with role-based access  
✅ **IP tracking** - OTP requests logged with IP addresses  

---

## 🚀 Quick Start

### 1. Email Configuration (Gmail SMTP)

**Step 1:** Create or use a Gmail account for sending OTPs

**Step 2:** Enable 2-Step Verification on your Google Account
- Go to [Google Account Security](https://myaccount.google.com/security)
- Enable 2-Step Verification if not already enabled

**Step 3:** Generate App Password
1. Go to [Google Account Settings](https://myaccount.google.com/)
2. Navigate to **Security** → **2-Step Verification**
3. Scroll down to **App passwords**
4. Select app: **Mail**
5. Select device: **Other (Custom name)** → Enter "Bus Booking System"
6. Click **Generate**
7. Copy the 16-character password (e.g., `abcd efgh ijkl mnop`)

**Step 4:** Create `.env` file in the `server` directory

```bash
cd server
cp .env.example .env
```

**Step 5:** Edit `.env` file with your credentials

```env
EMAIL_USER=your-email@gmail.com
EMAIL_APP_PASSWORD=abcdefghijklmnop
JWT_SECRET=your-random-secret-key-here
```

> ⚠️ **Important:** Never commit the `.env` file to version control!

---

### 2. Add Admin Email to Whitelist

Admin emails are stored in the `admin_whitelist` table. A default admin is created on first run:

**Default Admin:** `admin@busapp.com`

#### To add more admins:

**Option A:** Using SQLite CLI
```bash
sqlite3 server/database/app.db

INSERT INTO admin_whitelist (email, name, is_active) 
VALUES ('neweadmin@example.com', 'Admin Name', 1);

.exit
```

**Option B:** Modify the seed data in `server/database/init.js`

Find this section (around line 343):
```javascript
const adminData = [
  ['admin@busapp.com', 'System Administrator']
];
```

Add more admins:
```javascript
const adminData = [
  ['admin@busapp.com', 'System Administrator'],
  ['youremail@gmail.com', 'Your Name'],
  ['another@example.com', 'Another Admin']
];
```

Then delete the database and restart:
```bash
rm server/database/app.db
npm start
```

---

### 3. Access Admin Portal

1. Start the application:
   ```bash
   npm start
   ```

2. Navigate to: **http://localhost:5173/#/admin/login**

3. Enter your whitelisted admin email

4. Click **"Send Verification Code"**

5. Check your email for the 6-digit OTP

6. Enter the OTP within 5 minutes

7. You'll be redirected to the Admin Dashboard!

---

## 🎯 API Endpoints

### POST `/api/admin/send-otp`

Send OTP verification code to admin email.

**Request:**
```json
{
  "email": "admin@busapp.com"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Verification code sent to your email",
  "expiresIn": 300
}
```

**Response (Error - Not Whitelisted):**
```json
{
  "error": "Unauthorized: Invalid admin credentials"
}
```

**Response (Error - Rate Limited):**
```json
{
  "error": "Too many OTP requests. Please try again later.",
  "retryAfter": 15
}
```

---

### POST `/api/admin/verify-otp`

Verify OTP and issue JWT token.

**Request:**
```json
{
  "email": "admin@busapp.com",
  "otp": "123456"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "admin": {
    "email": "admin@busapp.com",
    "name": "System Administrator",
    "role": "ADMIN"
  }
}
```

**Response (Error - Invalid OTP):**
```json
{
  "error": "Invalid OTP code"
}
```

**Response (Error - Expired):**
```json
{
  "error": "OTP has expired. Please request a new code"
}
```

---

### GET `/api/admin/profile`

Get admin profile (requires authentication).

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Response:**
```json
{
  "success": true,
  "admin": {
    "email": "admin@busapp.com",
    "name": "System Administrator",
    "role": "ADMIN"
  }
}
```

---

## 📊 Database Schema

### admin_whitelist
```sql
CREATE TABLE admin_whitelist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### admin_otps
```sql
CREATE TABLE admin_otps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  otp TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  is_used INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ip_address TEXT
);
```

---

## 🛡️ Security Best Practices

1. **Environment Variables:** Never hardcode credentials in source code
2. **Rate Limiting:** Prevents brute-force attacks on OTP
3. **OTP Expiry:** Codes expire after 5 minutes
4. **One-time Use:** OTPs are marked as used after verification
5. **Whitelist Only:** Only pre-approved emails can request OTPs
6. **JWT Tokens:** Tokens expire after 24 hours
7. **HTTPS:** Use HTTPS in production (enable in nginx/apache)
8. **Email Security:** Use App Passwords, not actual Gmail password

---

## 🔧 Troubleshooting

### Email not sending?

1. **Check console logs:**
   ```
   ⚠️  Email service not configured. Set EMAIL_USER and EMAIL_APP_PASSWORD environment variables.
   ```
   → Solution: Configure `.env` file correctly

2. **Gmail App Password not working:**
   - Ensure 2-Step Verification is enabled
   - Generate a fresh App Password
   - Remove spaces from the 16-character password in `.env`
   - Try using the password in quotes: `EMAIL_APP_PASSWORD="abcd efgh ijkl mnop"`

3. **"Invalid credentials" error:**
   - Verify the email matches exactly (case-insensitive)
   - Check that email exists in `admin_whitelist` table
   - Ensure `is_active` is set to 1

### OTP not working?

1. **"Invalid OTP":**
   - Check you entered all 6 digits correctly
   - OTP is case-sensitive (digits only)

2. **"OTP expired":**
   - OTPs expire after 5 minutes
   - Request a new code

3. **Rate limit error:**
   - Wait 15 minutes before requesting again
   - Or restart the server to reset in-memory rate limits

---

## 📱 Frontend Pages

### Admin Login Page
- **Route:** `/admin/login`
- **Features:**
  - Email input
  - OTP request button
  - 6-digit OTP input boxes
  - Auto-focus next box on input
  - Paste support for OTPs
  - Countdown timer
  - Error handling

### Admin Dashboard
- **Route:** `/admin/dashboard`
- **Features:**
  - Admin profile display
  - System statistics
  - Quick action buttons
  - System status indicators
  - Logout functionality

---

## 🎨 UI/UX Features

✅ Beautiful gradient design (purple/indigo theme)  
✅ Responsive layout  
✅ Auto-focus OTP inputs  
✅ Paste support for OTP codes  
✅ Real-time countdown timer  
✅ Clear error messages  
✅ Loading states  
✅ Professional email template with HTML styling  

---

## 🚦 Testing

### Manual Testing Steps:

1. **Test with whitelisted email:**
   ```
   Email: admin@busapp.com
   Expected: Should receive OTP email
   ```

2. **Test with non-whitelisted email:**
   ```
   Email: random@example.com
   Expected: Error - "Unauthorized: Invalid admin credentials"
   ```

3. **Test rate limiting:**
   - Send 6 OTP requests in quick succession
   - Expected: 6th request should be rate-limited

4. **Test OTP expiry:**
   - Request OTP
   - Wait 6 minutes
   - Try to verify
   - Expected: "OTP has expired"

5. **Test invalid OTP:**
   - Enter wrong 6-digit code
   - Expected: "Invalid OTP code"

---

## 📝 Notes

- **Production Deployment:** Use environment variables from your hosting provider (Heroku, AWS, etc.)
- **Alternative Email Services:** You can modify `emailService.js` to use SendGrid, AWS SES, or any SMTP service
- **Database:** SQLite is used for development. Consider PostgreSQL/MySQL for production.
- **Rate Limiting:** In-memory rate limiting resets on server restart. Use Redis in production for persistent rate limiting.

---

## 📞 Support

For issues or questions:
1. Check the troubleshooting section above
2. Review console logs for detailed error messages
3. Verify all environment variables are set correctly
4. Ensure admin email is in the whitelist

---

## ✅ Checklist

- [ ] Gmail account created/selected
- [ ] 2-Step Verification enabled
- [ ] App Password generated
- [ ] `.env` file created with correct credentials
- [ ] Admin email added to whitelist
- [ ] Server started successfully
- [ ] Email service shows "✅ Email service ready" in console
- [ ] Can access `/admin/login` route
- [ ] OTP email received successfully
- [ ] Can log in to admin dashboard

---

**Congratulations! 🎉 Your admin OTP login system is now ready to use!**

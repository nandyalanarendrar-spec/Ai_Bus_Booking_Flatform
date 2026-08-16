# Email Verification Setup Guide

## ✅ What's Implemented

Email verification has been successfully implemented for user registration. Here's what was added:

### Backend Changes

1. **OTP Storage Table** (`server/database/init.js`)
   - Created `user_otps` table to store verification codes
   - OTPs expire after 5 minutes
   - Automatic cleanup of old OTPs

2. **Registration Flow** (`server/routes/auth.js`)
   - Users are created with `verified=0` (unverified)
   - 6-digit OTP generated and stored
   - Verification email sent using existing email service
   - Users must verify before logging in

3. **New API Endpoints**
   - `POST /auth/verify-email` - Verify OTP code
   - `POST /auth/resend-otp` - Resend verification code
   - Updated `POST /auth/login` - Blocks unverified users

### Frontend Changes

1. **New Pages**
   - `VerifyEmailPage.tsx` - OTP verification interface
   - Professional design with 6-digit code input
   - Resend OTP functionality
   - 5-minute expiry countdown

2. **Updated Login Flow** (`LoginPage.tsx`)
   - Registration redirects to email verification
   - Login checks verification status
   - Clear error messages for unverified accounts

3. **Routing** (`App.tsx`)
   - Added `/verify-email` route

## 📧 Email Service Configuration

### Current Status
⚠️ **Email service is configured but requires Gmail credentials**

The email service (`server/services/emailService.js`) uses:
- **Service**: Gmail SMTP
- **Library**: nodemailer
- **Port**: 465 (SSL)

### Required Environment Variables

You need to set these environment variables:

```bash
EMAIL_USER=your-email@gmail.com
EMAIL_APP_PASSWORD=your-app-password
```

### How to Get Gmail App Password

1. **Enable 2-Factor Authentication**
   - Go to [Google Account Security](https://myaccount.google.com/security)
   - Enable 2-Step Verification

2. **Generate App Password**
   - Visit [App Passwords](https://myaccount.google.com/apppasswords)
   - Select "Mail" and "Windows Computer"
   - Copy the 16-character password

3. **Set Environment Variables**

   **Option A: Windows PowerShell (Session-based)**
   ```powershell
   $env:EMAIL_USER="your-email@gmail.com"
   $env:EMAIL_APP_PASSWORD="xxxx xxxx xxxx xxxx"
   npm start
   ```

   **Option B: Create .env file** (Recommended)
   
   Create `server/.env`:
   ```
   EMAIL_USER=your-email@gmail.com
   EMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx
   ```
   
   Install dotenv:
   ```bash
   cd server
   npm install dotenv
   ```
   
   Add to `server/index.js` (top of file):
   ```javascript
   require('dotenv').config();
   ```

## 🔄 User Flow

### Registration Flow
1. User fills registration form (username, email, password)
2. Backend creates user with `verified=0`
3. 6-digit OTP generated and stored (5-minute expiry)
4. Email sent to user's address
5. User redirected to `/verify-email?email=...`
6. User enters OTP code
7. Backend verifies OTP and sets `verified=1`
8. User automatically logged in
9. Redirect to home page

### Login Flow
1. User enters username and password
2. Backend checks credentials
3. **If not verified**: Error message with link to verify
4. **If verified**: JWT token issued and user logged in

### Resend OTP
- Available on verification page
- Deletes old OTPs for the email
- Generates new 6-digit code
- Sends fresh email
- Resets 5-minute timer

## 📁 Modified Files

### Backend
- `server/database/init.js` - Added `user_otps` table
- `server/routes/auth.js` - Complete verification flow
  - Modified `/register` endpoint
  - Modified `/login` endpoint  
  - Added `/verify-email` endpoint
  - Added `/resend-otp` endpoint

### Frontend
- `client/src/App.tsx` - Added verification route
- `client/src/pages/VerifyEmailPage.tsx` - NEW file
- `client/src/pages/LoginPage.tsx` - Updated registration flow
- `client/src/context/AuthContext.tsx` - Support direct token login

## 🧪 Testing

### Without Email Configuration
The system will show warning: `⚠️ Email service not configured`
- Registration will fail to send email
- Users cannot verify their accounts
- Need to manually update database to test:
  ```sql
  UPDATE users SET verified=1 WHERE email='test@example.com';
  ```

### With Email Configuration
1. Register new account → Check email for OTP
2. Enter OTP → Should auto-login
3. Test resend OTP → New code sent
4. Test expired OTP → Error message after 5 minutes
5. Try login before verify → Blocked with message

## 🎨 UI Features

### Verification Page
- Large 6-digit input field
- Real-time validation (numbers only)
- Color-coded messages (error/success)
- Resend button with loading state
- 5-minute expiry notice
- Spam folder reminder
- Back to login link

### Login Page Enhancement
- "Email Verification Required" notice for registration
- Loading states on buttons
- Handles verification redirect from failed login

## 🔒 Security Features

- **OTP Expiry**: 5 minutes
- **OTP Format**: 6 random digits
- **One-time use**: OTP deleted after successful verification
- **Email uniqueness**: Database constraint
- **Verified flag**: Prevents unverified login
- **Password hashing**: bcrypt (10 rounds)
- **JWT tokens**: 24-hour expiry

## 📊 Database Schema

### users table
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  verified INTEGER DEFAULT 0,  -- 0=unverified, 1=verified
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### user_otps table
```sql
CREATE TABLE user_otps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  otp TEXT NOT NULL,           -- 6-digit code
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL  -- created_at + 5 minutes
)
```

## ✨ Next Steps

1. **Set up Gmail credentials** (see above)
2. **Restart the server** with environment variables
3. **Test registration** with a real email address
4. **Verify the email** works end-to-end

## 🚀 Quick Start

```powershell
# Set environment variables
$env:EMAIL_USER="your-email@gmail.com"
$env:EMAIL_APP_PASSWORD="your-app-password"

# Start the application
cd C:\Users\nandy\OneDrive\Desktop\narendra2
npm start
```

The application is now running with email verification enabled!
- Backend: http://localhost:5000
- Frontend: http://localhost:5173

Register a new account to test the email verification flow.

# 🔐 Admin OTP Login - Quick Start

## What's New?

Your bus booking system now has a **secure admin portal** with **OTP-based email authentication**!

---

## ⚡ Get Started in 3 Minutes

### Step 1: Configure Email (Gmail)

1. **Get Gmail App Password:**
   - Go to [Google Account Security](https://myaccount.google.com/security)
   - Enable **2-Step Verification**
   - Go to **App passwords**
   - Generate password for "Mail"
   - Copy the 16-character code

2. **Create `.env` file in `server` folder:**
   ```bash
   cd server
   cp .env.example .env
   ```

3. **Edit `.env` with your Gmail:**
   ```env
   EMAIL_USER=youremail@gmail.com
   EMAIL_APP_PASSWORD=abcdefghijklmnop
   JWT_SECRET=my-super-secret-key-12345
   ```

---

### Step 2: Add Your Admin Email

**Option 1 - Quick (Use Default):**
- Default admin: `admin@busapp.com`
- Just use this for testing!

**Option 2 - Add Your Email:**

Edit `server/database/init.js` (line ~343):
```javascript
const adminData = [
  ['admin@busapp.com', 'System Administrator'],
  ['youremail@gmail.com', 'Your Name']  // ← Add this line
];
```

Then delete database and restart:
```bash
rm server/database/app.db
npm start
```

---

### Step 3: Test It!

1. **Start the app:**
   ```bash
   npm start
   ```

2. **Open admin login:**
   ```
   http://localhost:5173/#/admin/login
   ```

3. **Enter your admin email** → Click "Send Verification Code"

4. **Check your email** → You'll receive a 6-digit OTP

5. **Enter OTP** → Login successful! 🎉

---

## 🎯 Features Implemented

✅ **Email-only login** (no passwords!)  
✅ **6-digit OTP** sent via Gmail  
✅ **5-minute expiry** for security  
✅ **Rate limiting** (5 requests per 15 min)  
✅ **Admin whitelist** (only approved emails)  
✅ **Beautiful UI** with countdown timer  
✅ **JWT authentication** (24-hour sessions)  
✅ **Professional email template**  

---

## 📍 Routes

| Route | Description |
|-------|-------------|
| `/admin/login` | Admin login with OTP |
| `/admin/dashboard` | Admin portal (after login) |

---

## 🔌 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/send-otp` | POST | Send OTP to email |
| `/api/admin/verify-otp` | POST | Verify OTP & get token |
| `/api/admin/profile` | GET | Get admin profile |

---

## 🛠️ Tech Stack

**Backend:**
- OTP generation & validation
- Nodemailer (Gmail SMTP)
- SQLite tables: `admin_whitelist`, `admin_otps`
- Rate limiting (in-memory)
- JWT with ADMIN role

**Frontend:**
- React + TypeScript
- 6-digit OTP input boxes
- Auto-focus & paste support
- Countdown timer
- Error handling

---

## 📧 Email Template Preview

```
┌─────────────────────────────────┐
│  🔐 Admin Login Verification    │
├─────────────────────────────────┤
│                                 │
│  Your Verification Code         │
│                                 │
│     ┌───────────────┐           │
│     │   1 2 3 4 5 6 │           │
│     └───────────────┘           │
│                                 │
│  ⏰ Valid for: 5 minutes        │
│  🎯 Purpose: Admin login        │
│  🔒 One-time use only           │
│                                 │
└─────────────────────────────────┘
```

---

## 🐛 Troubleshooting

### Email not sending?
```bash
⚠️  Email service not configured
```
**Fix:** Check `.env` file has correct `EMAIL_USER` and `EMAIL_APP_PASSWORD`

### "Unauthorized: Invalid admin credentials"
**Fix:** Your email is not in admin whitelist. Add it to `admin_whitelist` table.

### OTP expired?
**Fix:** Request a new code. OTPs expire after 5 minutes.

### Rate limited?
**Fix:** Wait 15 minutes or restart server.

---

## 📖 Full Documentation

See [ADMIN_OTP_SETUP.md](./ADMIN_OTP_SETUP.md) for:
- Detailed setup guide
- Security features explanation
- Database schema
- API documentation
- Advanced configuration
- Production deployment tips

---

## ✨ Quick Test

```bash
# 1. Configure email in server/.env
EMAIL_USER=youremail@gmail.com
EMAIL_APP_PASSWORD=your-app-password

# 2. Start app
npm start

# 3. Open browser
http://localhost:5173/#/admin/login

# 4. Enter admin email
admin@busapp.com

# 5. Check email for OTP
# 6. Enter OTP and login!
```

---

## 🎉 You're All Set!

Your admin OTP login system is ready. Access the admin portal at:

**http://localhost:5173/#/admin/login**

Default admin email: `admin@busapp.com`

---

**Need help?** Check [ADMIN_OTP_SETUP.md](./ADMIN_OTP_SETUP.md) for detailed documentation.

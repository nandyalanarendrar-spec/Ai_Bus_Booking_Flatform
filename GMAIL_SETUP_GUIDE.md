# Quick Gmail Setup for Email Verification

## 🚨 Current Issue
The message "OTP sent! Check your email" appears, but **no email is actually sent** because Gmail credentials are not configured.

## ✅ Solution: Configure Gmail Credentials

### Option 1: Automatic Setup (Easiest)

1. **Run the setup script:**
   ```
   Double-click: setup-gmail.bat
   ```

2. **Follow the prompts:**
   - It will guide you through enabling 2FA
   - Help you generate an App Password
   - Start the servers with proper configuration

### Option 2: Manual Setup

#### Step 1: Enable 2-Factor Authentication
1. Visit: https://myaccount.google.com/security
2. Click "2-Step Verification"
3. Complete the setup

#### Step 2: Generate App Password
1. Visit: https://myaccount.google.com/apppasswords
2. Select:
   - **App**: Mail
   - **Device**: Windows Computer
3. Click "Generate"
4. **Copy the 16-character password** (e.g., `abcd efgh ijkl mnop`)

#### Step 3: Set Environment Variables & Start

Open PowerShell and run:

```powershell
# Stop existing servers
Stop-Process -Name node -Force -ErrorAction SilentlyContinue

# Set your Gmail credentials (replace with your actual values)
$env:EMAIL_USER = "yourname@gmail.com"
$env:EMAIL_APP_PASSWORD = "abcdefghijklmnop"  # Remove spaces from app password

# Start backend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd C:\Users\nandy\OneDrive\Desktop\narendra2\server; `$env:EMAIL_USER='$($env:EMAIL_USER)'; `$env:EMAIL_APP_PASSWORD='$($env:EMAIL_APP_PASSWORD)'; node index.js"

# Wait 3 seconds
Start-Sleep -Seconds 3

# Start frontend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd C:\Users\nandy\OneDrive\Desktop\narendra2\client; npm run dev"
```

### Option 3: Create .env File (Permanent)

1. **Create file**: `server/.env`
   ```
   EMAIL_USER=yourname@gmail.com
   EMAIL_APP_PASSWORD=abcdefghijklmnop
   ```

2. **Install dotenv** (if not already installed):
   ```powershell
   cd server
   npm install dotenv
   ```

3. **Edit** `server/index.js` - Add at the top:
   ```javascript
   require('dotenv').config();
   ```

4. **Start normally**:
   ```powershell
   npm start
   ```

## 🔍 Verify Email Service

After configuration, you should see:
```
✅ Email service ready
```

Instead of:
```
⚠️ Email service not configured
```

## 📧 Test Email Verification

1. Register a new account with a real email
2. Check your inbox (and spam folder)
3. You should receive an email with a 6-digit OTP
4. Enter the OTP on the verification page
5. You'll be automatically logged in

## ⚠️ Important Notes

- **App Password is NOT your Gmail password**
- 2-Factor Authentication MUST be enabled first
- Remove spaces from the app password when entering
- Keep your app password secure (don't commit to git)
- Check spam folder if email doesn't arrive

## 🔐 Security Tips

✅ Use App Password (not regular Gmail password)
✅ Enable 2-Factor Authentication
✅ Add `server/.env` to `.gitignore`
✅ Don't share your app password

## 🆘 Troubleshooting

### "Email not configured" warning still shows
- Environment variables not set properly
- Restart the server after setting variables

### Email doesn't arrive
- Check spam/junk folder
- Verify app password is correct (no spaces)
- Confirm 2FA is enabled
- Check Gmail account allows "Less secure apps" or use App Password

### "Invalid credentials" error
- App password is incorrect
- 2FA not enabled
- Using regular password instead of app password

## 📞 Quick Test

After setup, test admin login (already works):
1. Go to: http://localhost:5173/#/admin/login
2. Enter admin email
3. Check if OTP email arrives
4. If admin OTP works, user OTP will work too

---

**Current Status**: Email service code is ✅ working, just needs Gmail credentials configured.

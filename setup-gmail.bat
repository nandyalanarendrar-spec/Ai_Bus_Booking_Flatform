@echo off
echo ===============================================
echo  Gmail Setup for Email Verification
echo ===============================================
echo.
echo This script will help you configure Gmail for sending OTP emails.
echo.
echo STEP 1: Enable 2-Factor Authentication
echo ----------------------------------------
echo 1. Go to: https://myaccount.google.com/security
echo 2. Click "2-Step Verification"
echo 3. Follow the setup process
echo.
pause
echo.
echo STEP 2: Generate App Password
echo ----------------------------------------
echo 1. Go to: https://myaccount.google.com/apppasswords
echo 2. Select "Mail" and "Windows Computer"
echo 3. Click "Generate"
echo 4. Copy the 16-character password (format: xxxx xxxx xxxx xxxx)
echo.
pause
echo.
echo STEP 3: Enter Your Credentials
echo ----------------------------------------
echo.
set /p GMAIL_USER="Enter your Gmail address (e.g., yourname@gmail.com): "
set /p APP_PASSWORD="Enter the 16-character app password (remove spaces): "
echo.
echo ===============================================
echo  Starting Server with Email Configuration
echo ===============================================
echo.
echo Your Gmail: %GMAIL_USER%
echo App Password: %APP_PASSWORD:~0,4%************
echo.
echo Starting in 3 seconds...
timeout /t 3 /nobreak >nul
echo.

REM Stop existing processes
echo Stopping existing servers...
taskkill /F /IM node.exe >nul 2>&1

REM Start backend with environment variables
echo Starting backend server...
cd /d "%~dp0server"
start "Backend Server" cmd /k "set EMAIL_USER=%GMAIL_USER%&& set EMAIL_APP_PASSWORD=%APP_PASSWORD%&& node index.js"

REM Wait for backend to start
timeout /t 3 /nobreak >nul

REM Start frontend
echo Starting frontend...
cd /d "%~dp0client"
start "Frontend Server" cmd /k "npm run dev"

echo.
echo ===============================================
echo  Servers Started Successfully!
echo ===============================================
echo.
echo Backend:  http://localhost:5000
echo Frontend: http://localhost:5173
echo.
echo Email service is now configured and ready!
echo.
echo Press any key to exit this window...
pause >nul

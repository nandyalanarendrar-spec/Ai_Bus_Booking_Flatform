# Email Configuration - Quick Start
# App Password: xklc tpqb emfj wswn (provided by user)

# INSTRUCTIONS:
# 1. Replace YOUR_EMAIL@gmail.com below with your actual Gmail address
# 2. Run this script in PowerShell

# Stop existing Node processes
Write-Host "Stopping existing servers..." -ForegroundColor Yellow
Stop-Process -Name node -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Your Gmail credentials
$EMAIL_USER = "YOUR_EMAIL@gmail.com"  # ← CHANGE THIS TO YOUR EMAIL
$EMAIL_APP_PASSWORD = "xklctpqbemfjwswn"  # App password (spaces removed)

Write-Host "`n===============================================" -ForegroundColor Cyan
Write-Host " Starting Servers with Email Configuration" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "Email: $EMAIL_USER" -ForegroundColor Green
Write-Host "App Password: xklc-****-****-****" -ForegroundColor Green
Write-Host "`n"

# Start Backend Server in new window
Write-Host "Starting Backend Server..." -ForegroundColor Yellow
$backendCmd = "Set-Location C:\Users\nandy\OneDrive\Desktop\narendra2\server; `$env:EMAIL_USER='$EMAIL_USER'; `$env:EMAIL_APP_PASSWORD='$EMAIL_APP_PASSWORD'; Write-Host '🚀 Backend Server Starting...' -ForegroundColor Green; Write-Host 'Email User: $EMAIL_USER' -ForegroundColor Cyan; node index.js"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd

# Wait for backend to initialize
Write-Host "Waiting for backend to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 4

# Start Frontend Server in new window
Write-Host "Starting Frontend Server..." -ForegroundColor Yellow
$frontendCmd = "Set-Location C:\Users\nandy\OneDrive\Desktop\narendra2\client; Write-Host '🚀 Frontend Server Starting...' -ForegroundColor Green; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd

Write-Host "`n===============================================" -ForegroundColor Cyan
Write-Host " ✅ Servers Started Successfully!" -ForegroundColor Green
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "Backend:  http://localhost:5000" -ForegroundColor White
Write-Host "Frontend: http://localhost:5173" -ForegroundColor White
Write-Host "`nEmail service is now configured!" -ForegroundColor Green
Write-Host "Look for '✅ Email service ready' in the backend window" -ForegroundColor Yellow
Write-Host "`n"

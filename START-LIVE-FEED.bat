@echo off
setlocal
cd /d "%~dp0"
title Live Feed Hub

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Please install Node.js first.
  echo https://nodejs.org/
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm not found. Please install Node.js first.
  echo https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo Checking port 3847...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$listeners = Get-NetTCPConnection -LocalPort 3847 -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }; foreach ($l in $listeners) { Stop-Process -Id $l.OwningProcess -Force -ErrorAction SilentlyContinue }"

echo Starting Live Feed Hub...
echo.
echo Browser: http://127.0.0.1:3847/
echo Keep this window open while you use the dashboard.
echo Press Ctrl+C to stop.
echo.
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 6; Start-Process 'http://127.0.0.1:3847/'"
call npm start

echo.
echo Server stopped or failed to start.
pause

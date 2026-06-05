@echo off
setlocal
cd /d "%~dp0"
title Live Feed Hub

if not exist ".data" mkdir ".data"
set "START_LOG=%CD%\.data\start-live-feed.log"

echo [%date% %time%] START-LIVE-FEED launched from %CD% > "%START_LOG%"

if not exist "package.json" (
  echo Project files were not found in:
  echo %CD%
  echo.
  echo This shortcut must point to the Live Feed Hub folder.
  echo [%date% %time%] package.json missing in %CD% >> "%START_LOG%"
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Please install Node.js first.
  echo https://nodejs.org/
  echo [%date% %time%] node not found >> "%START_LOG%"
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm not found. Please install Node.js first.
  echo https://nodejs.org/
  echo [%date% %time%] npm not found >> "%START_LOG%"
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  echo [%date% %time%] npm install started >> "%START_LOG%"
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    echo [%date% %time%] npm install failed >> "%START_LOG%"
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
start "" powershell -NoProfile -WindowStyle Hidden -Command "for ($i = 0; $i -lt 60; $i++) { try { Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3847/api/sources' -TimeoutSec 2 | Out-Null; Start-Process 'http://127.0.0.1:3847/'; exit 0 } catch { Start-Sleep -Seconds 1 } }; Start-Process 'http://127.0.0.1:3847/'"
echo [%date% %time%] node src/index.js starting >> "%START_LOG%"
node src/index.js

echo.
echo Server stopped or failed to start.
echo.
echo If it failed, check:
echo %CD%\.data\server.err.log
echo %START_LOG%
echo [%date% %time%] server stopped or failed, exit %errorlevel% >> "%START_LOG%"
pause

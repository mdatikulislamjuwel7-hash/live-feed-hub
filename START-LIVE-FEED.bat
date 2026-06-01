@echo off
setlocal
cd /d "%~dp0"
title Live Feed Hub
echo Starting Live Feed Hub...
echo.
echo Browser: http://127.0.0.1:3847/
echo Keep this window open while you use the dashboard.
echo Press Ctrl+C to stop.
echo.
start "" "http://127.0.0.1:3847/"
npm start

@echo off
title Habesha Cafe Server
cd /d "%~dp0"
echo Starting Habesha Cafe server...
node src\server.js
if errorlevel 1 (
    echo.
    echo Server exited with an error. Press any key to close.
    pause >nul
)

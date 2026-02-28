@echo off
REM Coordinates Grabber API Server Launcher
REM This script starts the Flask backend that bridges React to AutoCAD

echo ===============================================
echo   Coordinates Grabber API Server
echo ===============================================
echo.

REM Load API_KEY from repo root .env if present (api_server.py reads it too)
if not exist "..\\.env" (
    echo WARNING: ..\\.env not found. API_KEY must be set in your environment.
    echo.
)

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found!
    echo Please install Python 3.9+ from python.org
    pause
    exit /b 1
)

echo [1/3] Checking dependencies...
pip show flask >nul 2>&1
if errorlevel 1 (
    echo Installing dependencies...
    pip install -r requirements-api.txt
    if errorlevel 1 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
)

echo [2/3] Checking AutoCAD...
tasklist /FI "IMAGENAME eq acad.exe" 2>NUL | find /I /N "acad.exe">NUL
if errorlevel 1 (
    echo WARNING: AutoCAD does not appear to be running
    echo The server will start, but features won't work until AutoCAD starts
    echo.
) else (
    echo AutoCAD detected!
)

echo [3/3] Starting API server on http://localhost:5000
echo.
echo IMPORTANT:
echo - Keep this window open while using the React app
echo - Open a drawing in AutoCAD for full functionality
echo - Press Ctrl+C to stop the server
echo.
echo ===============================================
echo.

python api_server.py

pause

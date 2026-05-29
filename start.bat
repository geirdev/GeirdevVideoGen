@echo off
title GeirdevVideoGen - Windows One-Touch Launcher

:: 🎬 GeirdevVideoGen - Windows One-Touch Launcher

echo ==========================================================
echo  🎬 GeirdevVideoGen - Windows One-Touch Launcher
echo ==========================================================
echo.

:: 1. Check Node.js & npm presence and initiate unattended silent installation if missing
where node >nul 2>nul
set NODE_CHECK=%errorlevel%
where npm >nul 2>nul
set NPM_CHECK=%errorlevel%

if %NODE_CHECK% neq 0 (
    echo ⚠️  [System Notice] Node.js is not installed on your computer.
    echo ⚙   [Auto-Installer] Initiating automated silent Node.js installation...
    echo.
    
    :: Inspect and trigger winget on Windows 10/11
    where winget >nul 2>nul
    if %errorlevel% equ 0 (
        echo 💾 Installing Node.js LTS silently using Windows Package Manager (winget)...
        echo.
        winget install OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
    ) else (
        echo 💾 Downloading official Windows installer (MSI) from Node.js servers...
        :: PowerShell Failsafe download & msiexec silent install
        powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.12.2/node-v20.12.2-x64.msi' -OutFile 'node_install.msi'"
        if not exist node_install.msi (
            echo ❌ Error: Failed to download Node.js installer. Please check your internet connection.
            pause
            exit /b 1
        )
        echo.
        echo ⚙   Installing Node.js silently. Please wait a moment...
        msiexec /i node_install.msi /qn /norestart
        del node_install.msi
    )
    
    :: Instantly bind PATH variables to current cmd session
    set "PATH=%SystemDrive%\Program Files\nodejs\;%PATH%"
    set "PATH=%APPDATA%\npm;%PATH%"
    
    :: Final verification
    where node >nul 2>nul
    if %errorlevel% neq 0 (
        echo.
        echo ❌ Error: Silent installation failed or was blocked.
        echo 💡 Manual Guide: Please visit https://nodejs.org directly to install it.
        echo.
        pause
        exit /b 1
    )
    echo ✅ [Success] Node.js has been successfully installed on your computer!
    echo.
) else (
    echo ✅ [Checked] Node.js and npm are present and healthy!
    echo.
)

:: 2. Automatically install required library dependencies (npm install)
echo 📦 [1/2] Installing required project dependencies and components...
echo        (This may take 15 seconds to a minute depending on your connection.)
echo.
call npm install
if %errorlevel% neq 0 (
    echo.
    echo ❌ Error: Failed to install project dependencies.
    echo        Please check your network status.
    echo.
    pause
    exit /b 1
)
echo ✅ [Success] Project dependencies successfully configured!
echo.

:: 3. Parallel backend/frontend bootstrapper with browser auto-open
echo 🚀 [2/2] Launching local servers and web studio...
echo        (Your web browser window will open automatically in a moment!)
echo.
call npm run start

#!/bin/bash

# 🎬 GeirdevVideoGen - Mac / Linux One-Touch Launcher

# Artistic Terminal Intro
echo "=========================================================="
echo " 🎬 GeirdevVideoGen - Mac/Linux One-Touch Launcher"
echo "=========================================================="
echo ""

# 1. Check Node.js & npm presence and initiate unattended silent installation if missing
if ! command -v node &> /dev/null || ! command -v npm &> /dev/null
then
    echo "⚠️  [System Notice] Node.js or npm is not installed on your computer."
    echo "⚙️  [Auto-Installer] Initiating automated silent Node.js installation for a seamless launch."
    echo ""
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "🍏 Downloading Node.js LTS Universal package for macOS..."
        # Node.js Universal PKG - supports Apple Silicon (M-series) and Intel Mac
        NODE_PKG_URL="https://nodejs.org/dist/v20.12.2/node-v20.12.2.pkg"
        TEMP_PKG="/tmp/node-install.pkg"
        
        curl -L -o "$TEMP_PKG" "$NODE_PKG_URL"
        
        if [ $? -ne 0 ]; then
            echo "❌ Error: Failed to download Node.js. Please check your internet connection."
            read -p "Press Enter to exit..."
            exit 1
        fi
        
        echo ""
        echo "🔒 Authorization Required: To register and install Node.js on your Mac,"
        echo "    please type your macOS login password."
        echo "    (For security, characters will not be displayed on screen as you type.)"
        echo ""
        
        sudo installer -pkg "$TEMP_PKG" -target /
        
        # Clean up temp file
        rm -f "$TEMP_PKG"
        
        # Instantly bind paths to current terminal session
        export PATH="/usr/local/bin:$PATH"
        
        if ! command -v node &> /dev/null; then
            echo "❌ Error: Installation failed or permission was denied."
            echo "💡 Manual Guide: Please visit https://nodejs.org directly to install it."
            read -p "Press Enter to exit..."
            exit 1
        fi
        
        echo "✅ [Success] Node.js has been successfully installed on your Mac!"
        echo ""
    else
        # Linux Package Management
        echo "🐧 Linux environment detected. Attempting to install via package manager..."
        if command -v apt-get &> /dev/null; then
            sudo apt-get update && sudo apt-get install -y nodejs npm
        elif command -v yum &> /dev/null; then
            sudo yum install -y nodejs npm
        else
            echo "❌ Error: Unsupported Linux distribution. Please install Node.js manually."
            read -p "Press Enter to exit..."
            exit 1
        fi
        
        if ! command -v node &> /dev/null; then
            echo "❌ Error: Installation failed. Please install Node.js manually."
            read -p "Press Enter to exit..."
            exit 1
        fi
        echo "✅ [Success] Node.js has been successfully installed on your Linux system!"
        echo ""
    fi
else
    echo "✅ [Checked] Node.js and npm are present and healthy!"
    echo ""
fi

# 2. Automatically install required library dependencies (npm install)
echo "📦 [1/2] Installing required project dependencies and components..."
echo "       (This may take 15 seconds to a minute depending on your connection.)"
echo ""
npm install

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Error: Failed to install project dependencies."
    echo "       Please check your network status."
    read -p "Press Enter to exit..."
    exit 1
fi
echo "✅ [Success] Project dependencies successfully configured!"
echo ""

# 3. Parallel backend/frontend bootstrapper with browser auto-open
echo "🚀 [2/2] Launching local servers and web studio..."
echo "       (Your web browser window will open automatically in a moment!)"
echo ""
npm run start

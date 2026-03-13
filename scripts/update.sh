#!/bin/bash

# RemoteYeah.com Parser - Update Script
# Updates code and restarts services

set -e  # Stop on error

echo "🔄 Starting update process..."

# Discard local changes and pull latest
echo "📥 Pulling latest code..."
git checkout .
git pull

# Install backend dependencies
echo "📦 Installing backend dependencies..."
npm install

# Build frontend
echo "🏗️  Building frontend..."
cd frontend
npm install
npm run generate
cd ..

# Restart PM2 processes
echo "🔄 Restarting services..."
if command -v pm2 &> /dev/null; then
    pm2 delete ecosystem.config.js 2>/dev/null || true
    pm2 start ecosystem.config.js
else
    npx pm2 delete ecosystem.config.js 2>/dev/null || true
    npx pm2 start ecosystem.config.js
fi

echo "✅ Update complete!"

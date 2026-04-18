#!/bin/bash

# RemoteYeah.com Parser - Update Script
# Updates code and restarts services

set -e  # Stop on error

echo "🔄 Starting update process..."

# Discard local changes and pull latest
echo "📥 Pulling latest code..."
git checkout .
OLD_HEAD=$(git rev-parse HEAD 2>/dev/null || echo "")
git pull
NEW_HEAD=$(git rev-parse HEAD 2>/dev/null || echo "")

# Install backend dependencies
echo "📦 Installing backend dependencies..."
npm install

# Check if frontend needs to be built
if [ "$OLD_HEAD" != "$NEW_HEAD" ] && git diff --name-only $OLD_HEAD $NEW_HEAD | grep -q '^frontend/'; then
    BUILD_FRONTEND=true
elif [ ! -d "frontend/.output/public" ]; then
    BUILD_FRONTEND=true
else
    BUILD_FRONTEND=false
fi

# Build frontend
if [ "$BUILD_FRONTEND" = true ]; then
    echo "🏗️  Building frontend..."
    cd frontend
    npm install
    npm run generate
    cd ..
else
    echo "⏭️  Frontend unchanged, skipping build..."
fi

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

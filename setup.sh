#!/bin/bash

# RemoteYeah.com Parser - Setup Script
# Deployment script for fresh installation

set -e  # Stop on error

echo "🚀 Commencing RemoteYeah Parser installation..."

# Colours for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Colour

# Function for success messages
success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Function for warnings
warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Function for errors
error() {
    echo -e "${RED}✗ $1${NC}"
}

# Verify Node.js
echo ""
echo "📦 Verifying dependencies..."
if ! command -v node &> /dev/null; then
    error "Node.js is not installed. Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    error "Node.js version 18 or higher is required. Current version: $(node -v)"
    exit 1
fi
success "Node.js $(node -v) installed"

# Verify npm
if ! command -v npm &> /dev/null; then
    error "npm is not installed"
    exit 1
fi
success "npm $(npm -v) installed"

# Install backend dependencies
echo ""
echo "📥 Installing backend dependencies..."
npm install
success "Backend dependencies installed"

# Install frontend dependencies
echo ""
echo "📥 Installing frontend dependencies..."
cd frontend
npm install
cd ..
success "Frontend dependencies installed"

# Create .env file
echo ""
if [ -f .env ]; then
    warning ".env file already exists, skipping creation"
else
    echo "⚙️  Creating .env file..."
    cp .env.example .env
    success ".env file created"
    
    echo ""
    warning "IMPORTANT: Edit the .env file and specify:"
    echo "  - MONGODB_CONNECTION_STRING (MongoDB connection string)"
    echo "  - REMOTEYEAH_SEARCH_URLS (URLs to parse)"
    echo "  - STOP_WORDS (optional)"
fi

# Build frontend
echo ""
echo "🏗️  Building frontend..."
cd frontend
npm run generate
cd ..
success "Frontend built"

# Create necessary directories
echo ""
echo "📁 Creating directories..."
mkdir -p userdir
mkdir -p tmp_user_dir
success "Directories created"

# Verify PM2
echo ""
if ! command -v pm2 &> /dev/null; then
    warning "PM2 is not installed globally"
    echo "For production, it's recommended to install PM2:"
    echo "  npm install -g pm2"
    echo ""
    echo "Alternatively, use the local version via: npx pm2"
fi

# Final instructions
echo ""
echo "═══════════════════════════════════════════════════════════"
success "Installation complete!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "📝 Next steps:"
echo ""
echo "1. Configure the .env file:"
echo "   nano .env"
echo ""
echo "2. Start the project using one of these methods:"
echo ""
echo "   Development mode:"
echo "   npm start                    # API server"
echo "   npm run frontend:dev         # Frontend dev server"
echo ""
echo "   Production mode (PM2):"
echo "   npm run start:all            # Start all workers via PM2"
echo "   pm2 logs                     # View logs"
echo "   pm2 status                   # Process status"
echo "   pm2 stop all                 # Stop all processes"
echo ""
echo "   Manual worker execution:"
echo "   npm run jobs:list            # Parse job listings"
echo "   npm run jobs:parse           # Parse job pages"
echo "   npm run cv:generate          # Generate CVs"
echo ""
echo "4. Open in browser:"
echo "   http://localhost:4040"
echo ""
echo "═══════════════════════════════════════════════════════════"

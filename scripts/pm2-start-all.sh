#!/bin/bash

###############################################################################
# pm2-start-all.sh
# PM2로 모든 서비스를 시작하는 스크립트
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Starting All Services with PM2${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo -e "${RED}Error: PM2 is not installed${NC}"
    echo "Install PM2: npm install -g pm2"
    exit 1
fi

# Check if ecosystem.config.js exists
if [ ! -f "$PROJECT_ROOT/ecosystem.config.js" ]; then
    echo -e "${RED}Error: ecosystem.config.js not found${NC}"
    exit 1
fi

# Check if services are already running
if sudo pm2 list | grep -q "online"; then
    echo -e "${YELLOW}Some services are already running${NC}"
    sudo pm2 list
    echo ""
    read -p "Do you want to restart them? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Restarting services..."
        sudo pm2 restart ecosystem.config.js
    else
        echo "Skipping start"
        exit 0
    fi
else
    # Start all services
    echo "Starting all services..."
    cd "$PROJECT_ROOT"
    sudo pm2 start ecosystem.config.js
fi

echo ""
echo -e "${GREEN}✓ All services started${NC}"
echo ""

# Wait a moment for services to initialize
sleep 3

# Show status
echo "Service Status:"
pm2 list

echo ""
echo "Useful PM2 Commands:"
echo "  pm2 status           - Show service status"
echo "  pm2 logs             - View all logs"
echo "  pm2 logs [name]      - View specific service logs"
echo "  pm2 monit            - Real-time monitoring"
echo "  pm2 restart all      - Restart all services"
echo "  pm2 stop all         - Stop all services"
echo "  pm2 delete all       - Remove all services"
echo ""
echo "Save PM2 configuration:"
echo "  pm2 save             - Save current process list"
echo "  pm2 startup          - Setup auto-start on boot"
echo ""

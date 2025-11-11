#!/bin/bash

###############################################################################
# deploy-all.sh
# 모든 서비스를 빌드하고 배포하는 통합 스크립트
###############################################################################

set -e  # 에러 발생 시 즉시 종료

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Status-Verify Full Deployment${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Function to print section header
print_section() {
    echo ""
    echo -e "${BLUE}================================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}================================================${NC}"
    echo ""
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
print_section "Checking Prerequisites"

MISSING_DEPS=()

if ! command_exists node; then
    MISSING_DEPS+=("Node.js")
fi

if ! command_exists npm; then
    MISSING_DEPS+=("npm")
fi

if ! command_exists docker; then
    MISSING_DEPS+=("Docker")
fi

if ! command_exists docker compose; then
    MISSING_DEPS+=("Docker Compose")
fi

if [ ${#MISSING_DEPS[@]} -gt 0 ]; then
    echo -e "${RED}Error: Missing dependencies:${NC}"
    printf '%s\n' "${MISSING_DEPS[@]}"
    echo ""
    echo "Please install missing dependencies and try again"
    exit 1
fi

echo -e "${GREEN}✓ All prerequisites met${NC}"

# Check if PostgreSQL is running
print_section "Checking Database"

if ! docker compose -f "$PROJECT_ROOT/docker-compose.yml" ps | grep -q "sla-monitor-db.*Up"; then
    echo -e "${YELLOW}PostgreSQL is not running${NC}"
    read -p "Do you want to start PostgreSQL? (Y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        bash "$SCRIPT_DIR/setup-database.sh"
    else
        echo -e "${RED}Error: Database must be running${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✓ PostgreSQL is running${NC}"
fi

# Deploy verify-monitor-api
print_section "Deploying verify-monitor-api (Backend API)"

cd "$PROJECT_ROOT/verify-monitor-api"

echo "Installing dependencies..."
npm ci --only=production

echo "npm node_modules Installing dependencies..."
npm install

echo "Generating Prisma client..."
npx prisma generate

echo "verify-monitor-api Building TypeScript..."
npm run build

echo "Running database migrations..."
npx prisma migrate deploy

if [ "${SEED_DATABASE}" = "true" ]; then
    echo "Seeding database..."
    npm run db:seed
fi

mkdir -p logs
echo -e "${GREEN}✓ verify-monitor-api deployed${NC}"

# Deploy watch-server
print_section "Deploying watch-server (Health Monitor)"

cd "$PROJECT_ROOT/watch-server"

echo "Installing dependencies..."
npm ci --only=production

echo "npm node_modules Installing dependencies..."
npm install

echo "Generating Prisma client..."
npx prisma generate

echo "watch-server Building TypeScript..."
npm run build

mkdir -p logs
echo -e "${GREEN}✓ watch-server deployed${NC}"

# Deploy verify-main
print_section "Deploying verify-main (Frontend Dashboard)"

cd "$PROJECT_ROOT/verify-main"

echo "Installing dependencies..."
npm ci --only=production

echo "npm node_modules Installing dependencies..."
npm install --legacy-peer-deps

echo "verify-main Building Next.js application..."
npm run build

mkdir -p logs
echo -e "${GREEN}✓ verify-main deployed${NC}"

# Deploy verify-incidents
print_section "Deploying verify-incidents (Incident Management)"

cd "$PROJECT_ROOT/verify-incidents"

echo "Installing dependencies..."
npm ci --only=production

echo "npm node_modules Installing dependencies..."
npm install 


echo "verify-incidents Building Next.js application..."
npm run build

mkdir -p logs
echo -e "${GREEN}✓ verify-incidents deployed${NC}"

# Summary
cd "$PROJECT_ROOT"

print_section "Deployment Summary"

echo -e "${GREEN}All services deployed successfully!${NC}"
echo ""
echo "Deployed Services:"
echo "  ✓ PostgreSQL Database (port 5432)"
echo "  ✓ verify-monitor-api (port 3001)"
echo "  ✓ watch-server (port 3008)"
echo "  ✓ verify-main (port 80)"
echo "  ✓ verify-incidents (port 3006)"
echo ""
echo "Next Steps:"
echo "  1. Start all services: bash scripts/pm2-start-all.sh"
echo "  2. Check status: pm2 status"
echo "  3. View logs: pm2 logs"
echo "  4. Test health: bash scripts/health-check.sh"
echo ""
echo "Access URLs:"
echo "  System Status: http://localhost:80"
echo "  Incidents: http://localhost:3006"
echo "  API: http://localhost:3001/api/health"
echo ""

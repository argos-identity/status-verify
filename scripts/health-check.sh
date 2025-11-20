#!/bin/bash

###############################################################################
# health-check.sh
# 모든 서비스의 Health Check를 수행하는 스크립트
###############################################################################

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Service Health Check${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Function to check HTTP endpoint
check_http() {
    local name=$1
    local url=$2
    local expected=$3

    echo -n "Checking $name... "

    response=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")

    if [ "$response" = "$expected" ]; then
        echo -e "${GREEN}✓ OK${NC} (HTTP $response)"
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} (HTTP $response)"
        return 1
    fi
}

# Function to check TCP port
check_port() {
    local name=$1
    local port=$2

    echo -n "Checking $name (port $port)... "

    if nc -z localhost "$port" 2>/dev/null; then
        echo -e "${GREEN}✓ LISTENING${NC}"
        return 0
    else
        echo -e "${RED}✗ NOT LISTENING${NC}"
        return 1
    fi
}

# Track failures
FAILURES=0

echo "Database:"
check_port "PostgreSQL" 5432 || ((FAILURES++))

echo ""
echo "Backend Services:"
check_http "verify-monitor-api" "http://localhost:3001/api/health" "200" || ((FAILURES++))
check_http "watch-server" "http://localhost:3008/health" "200" || ((FAILURES++))

echo ""
echo "Frontend Services:"
check_http "verify-main" "http://localhost:80" "200" || ((FAILURES++))
check_http "verify-incidents" "http://localhost:3006" "200" || ((FAILURES++))

echo ""
echo -e "${BLUE}================================================${NC}"

if [ $FAILURES -eq 0 ]; then
    echo -e "${GREEN}All services are healthy!${NC}"
    exit 0
else
    echo -e "${RED}$FAILURES service(s) failed health check${NC}"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check service status: pm2 status"
    echo "  2. View logs: pm2 logs"
    echo "  3. Check database: docker-compose ps"
    echo "  4. Review errors: pm2 logs --err"
    exit 1
fi

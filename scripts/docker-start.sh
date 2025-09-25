#!/bin/bash

# Docker Start Script for SLA Monitor System
# Starts the complete system with proper dependency management

set -e

echo "🚀 Starting SLA Monitor System..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Environment setup
MODE=${1:-production}
DETACHED=${2:-false}

echo -e "${BLUE}📁 Project root: $PROJECT_ROOT${NC}"
echo -e "${BLUE}🎯 Mode: $MODE${NC}"

# Check if .env file exists
if [[ ! -f ".env" ]]; then
    echo -e "${YELLOW}⚠️ .env file not found. Creating from template...${NC}"
    cp .env.example .env
    echo -e "${GREEN}✅ .env file created. Please review and modify as needed.${NC}"
fi

# Docker compose command setup
COMPOSE_CMD="docker-compose -f docker-compose.yml"

if [[ "$MODE" == "development" || "$MODE" == "dev" ]]; then
    COMPOSE_CMD="$COMPOSE_CMD -f docker-compose.dev.yml"
    echo -e "${YELLOW}🔧 Development mode enabled${NC}"
fi

# Additional flags
COMPOSE_FLAGS=""
if [[ "$DETACHED" == "true" || "$DETACHED" == "-d" ]]; then
    COMPOSE_FLAGS="$COMPOSE_FLAGS -d"
    echo -e "${BLUE}🔇 Detached mode enabled${NC}"
fi

# Stop any running containers first
echo -e "\n${YELLOW}🛑 Stopping any existing containers...${NC}"
$COMPOSE_CMD down --remove-orphans || true

# Pull latest images if in production mode
if [[ "$MODE" == "production" ]]; then
    echo -e "\n${BLUE}📥 Pulling latest images...${NC}"
    $COMPOSE_CMD pull || true
fi

# Start services
echo -e "\n${GREEN}🚀 Starting services...${NC}"
$COMPOSE_CMD up $COMPOSE_FLAGS --build

if [[ "$DETACHED" == "true" || "$DETACHED" == "-d" ]]; then
    echo -e "\n${GREEN}🎉 SLA Monitor System started successfully!${NC}"
    echo -e "\n${BLUE}📊 Service URLs:${NC}"
    echo -e "  🌐 System Status Dashboard: http://localhost:3000"
    echo -e "  🚨 Incident Management: http://localhost:3006"
    echo -e "  🔌 API Server: http://localhost:3001"
    echo -e "  🔍 Watch Server: http://localhost:3008"
    echo -e "  🗄️ Database: localhost:5432"
    echo -e "\n${BLUE}💡 To view logs: docker-compose logs -f${NC}"
    echo -e "${BLUE}💡 To view watch-server logs: ./scripts/docker-logs.sh watch-server follow${NC}"
    echo -e "${BLUE}💡 To stop system: ./scripts/docker-stop.sh${NC}"
fi
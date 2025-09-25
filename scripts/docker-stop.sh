#!/bin/bash

# Docker Stop Script for SLA Monitor System
# Gracefully stops all services

set -e

echo "🛑 Stopping SLA Monitor System..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Options
REMOVE_VOLUMES=${1:-false}
REMOVE_IMAGES=${2:-false}

echo -e "${BLUE}📁 Project root: $PROJECT_ROOT${NC}"

# Stop containers
echo -e "\n${YELLOW}🔄 Stopping containers...${NC}"
docker-compose down --remove-orphans

# Remove volumes if requested
if [[ "$REMOVE_VOLUMES" == "true" || "$REMOVE_VOLUMES" == "--volumes" ]]; then
    echo -e "\n${YELLOW}🗑️ Removing volumes...${NC}"
    docker-compose down -v
    echo -e "${RED}⚠️ Database data has been removed!${NC}"
fi

# Remove images if requested
if [[ "$REMOVE_IMAGES" == "true" || "$REMOVE_IMAGES" == "--images" ]]; then
    echo -e "\n${YELLOW}🗑️ Removing images...${NC}"
    docker rmi $(docker images | grep "sla-monitor/" | awk '{print $3}') 2>/dev/null || true
    echo -e "${GREEN}✅ Images removed${NC}"
fi

# Clean up orphaned containers and networks
echo -e "\n${YELLOW}🧹 Cleaning up...${NC}"
docker system prune -f --filter "label=com.docker.compose.project=status-verify-api" || true

echo -e "\n${GREEN}🎉 SLA Monitor System stopped successfully!${NC}"

# Show cleanup options if not used
if [[ "$REMOVE_VOLUMES" != "true" && "$REMOVE_IMAGES" != "true" ]]; then
    echo -e "\n${BLUE}💡 Cleanup options:${NC}"
    echo -e "  📦 Remove volumes: ./scripts/docker-stop.sh --volumes"
    echo -e "  🖼️ Remove images: ./scripts/docker-stop.sh --images"
    echo -e "  🧽 Full cleanup: ./scripts/docker-stop.sh --volumes --images"
fi
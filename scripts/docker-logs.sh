#!/bin/bash

# Docker Logs Script for SLA Monitor System
# View logs from specific services or all services

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

SERVICE=${1:-}
FOLLOW=${2:-false}

echo -e "${BLUE}📋 SLA Monitor System Logs${NC}"

# Available services
SERVICES=(
    "postgres"
    "verify-monitor-api"
    "verify-main"
    "verify-incidents"
    "watch-server"
)

# Show usage if no service specified
if [[ -z "$SERVICE" ]]; then
    echo -e "\n${YELLOW}Usage: $0 <service> [follow]${NC}"
    echo -e "\n${BLUE}Available services:${NC}"
    for svc in "${SERVICES[@]}"; do
        echo -e "  • $svc"
    done
    echo -e "\n${BLUE}Examples:${NC}"
    echo -e "  ./scripts/docker-logs.sh verify-monitor-api"
    echo -e "  ./scripts/docker-logs.sh verify-main follow"
    echo -e "  ./scripts/docker-logs.sh watch-server follow"
    echo -e "  ./scripts/docker-logs.sh all"
    exit 0
fi

# Compose flags
FLAGS=""
if [[ "$FOLLOW" == "follow" || "$FOLLOW" == "-f" || "$FOLLOW" == "true" ]]; then
    FLAGS="-f"
    echo -e "${YELLOW}📡 Following logs (Ctrl+C to stop)...${NC}"
fi

# Show logs
if [[ "$SERVICE" == "all" ]]; then
    echo -e "${GREEN}🔍 Showing logs for all services...${NC}\n"
    docker-compose logs $FLAGS
else
    # Validate service name
    if [[ " ${SERVICES[@]} " =~ " ${SERVICE} " ]]; then
        echo -e "${GREEN}🔍 Showing logs for $SERVICE...${NC}\n"
        docker-compose logs $FLAGS "$SERVICE"
    else
        echo -e "${RED}❌ Unknown service: $SERVICE${NC}"
        echo -e "${BLUE}Available services: ${SERVICES[*]}${NC}"
        exit 1
    fi
fi
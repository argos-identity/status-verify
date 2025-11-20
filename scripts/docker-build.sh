#!/bin/bash

# Docker Build Script for SLA Monitor System
# Builds all Docker images with proper tagging

set -e

echo "🐳 Building SLA Monitor System Docker Images..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Build arguments
BUILD_MODE=${1:-production}
TAG_VERSION=${2:-latest}

echo -e "${BLUE}📁 Project root: $PROJECT_ROOT${NC}"
echo -e "${BLUE}🏗️ Build mode: $BUILD_MODE${NC}"
echo -e "${BLUE}🏷️ Tag version: $TAG_VERSION${NC}"

# Build verify-main (System Status Dashboard)
echo -e "\n${YELLOW}🔨 Building verify-main...${NC}"
docker build \
  -t sla-monitor/verify-main:$TAG_VERSION \
  -f verify-main/Dockerfile \
  verify-main/

echo -e "${GREEN}✅ verify-main built successfully${NC}"

# Build verify-incidents (Incident Management App)
echo -e "\n${YELLOW}🔨 Building verify-incidents...${NC}"
docker build \
  -t sla-monitor/verify-incidents:$TAG_VERSION \
  -f verify-incidents/Dockerfile \
  verify-incidents/

echo -e "${GREEN}✅ verify-incidents built successfully${NC}"

# Build verify-monitor-api (Backend API)
echo -e "\n${YELLOW}🔨 Building verify-monitor-api...${NC}"
docker build \
  -t sla-monitor/verify-monitor-api:$TAG_VERSION \
  -f verify-monitor-api/Dockerfile \
  verify-monitor-api/

echo -e "${GREEN}✅ verify-monitor-api built successfully${NC}"

# Build watch-server (Health Monitoring Service)
echo -e "\n${YELLOW}🔨 Building watch-server...${NC}"
docker build \
  -t sla-monitor/watch-server:$TAG_VERSION \
  -f watch-server/Dockerfile \
  watch-server/

echo -e "${GREEN}✅ watch-server built successfully${NC}"

# List built images
echo -e "\n${BLUE}📋 Built images:${NC}"
docker images | grep "sla-monitor/"

echo -e "\n${GREEN}🎉 All images built successfully!${NC}"
echo -e "${BLUE}💡 To start the system: ./scripts/docker-start.sh${NC}"
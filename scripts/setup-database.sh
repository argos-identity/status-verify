#!/bin/bash

###############################################################################
# setup-database.sh
# PostgreSQL 데이터베이스를 Docker로 구축하는 스크립트
###############################################################################

set -e  # 에러 발생 시 즉시 종료

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}  PostgreSQL Database Setup (Docker)${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed${NC}"
    echo "Please install Docker first: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker compose &> /dev/null; then
    echo -e "${RED}Error: Docker Compose is not installed${NC}"
    echo "Please install Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

# Check if .env file exists
if [ ! -f "$PROJECT_ROOT/.env" ]; then
    echo -e "${YELLOW}Warning: .env file not found${NC}"
    echo "Creating .env from .env.example..."

    if [ -f "$PROJECT_ROOT/.env.example" ]; then
        cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
        echo -e "${GREEN}✓ Created .env file${NC}"
        echo -e "${YELLOW}Please edit .env file and set proper passwords${NC}"
        echo ""
        read -p "Press Enter to continue after editing .env file..."
    else
        echo -e "${RED}Error: .env.example not found${NC}"
        exit 1
    fi
fi

# Load environment variables
source "$PROJECT_ROOT/.env"

echo "Database Configuration:"
echo "  User: ${DB_USER}"
echo "  Database: ${DB_NAME:-sla_monitor}"
echo "  Port: ${DB_PORT:-5432}"
echo ""

# Check if PostgreSQL container is already running
if [ "$(docker ps -q -f name=sla-monitor-db)" ]; then
    echo -e "${YELLOW}PostgreSQL container is already running${NC}"
    read -p "Do you want to recreate it? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Stopping and removing existing container..."
        docker compose -f "$PROJECT_ROOT/docker-compose.yml" down postgres
    else
        echo "Skipping database setup"
        exit 0
    fi
fi

echo "Starting PostgreSQL container..."
docker compose -f "$PROJECT_ROOT/docker-compose.yml" up -d postgres

echo -e "${GREEN}✓ PostgreSQL container started${NC}"
echo ""

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
MAX_ATTEMPTS=30
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if docker compose -f "$PROJECT_ROOT/docker-compose.yml" exec -T postgres pg_isready -U "${DB_USER}" -d "${DB_NAME:-sla_monitor}" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PostgreSQL is ready${NC}"
        break
    fi

    ATTEMPT=$((ATTEMPT + 1))
    echo -n "."
    sleep 1

    if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
        echo -e "${RED}Error: PostgreSQL failed to start${NC}"
        echo "Check logs: docker-compose logs postgres"
        exit 1
    fi
done

echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}  Database Setup Complete!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo "Connection Information:"
echo "  Host: localhost"
echo "  Port: ${DB_PORT:-5432}"
echo "  Database: ${DB_NAME:-sla_monitor}"
echo "  User: ${DB_USER}"
echo ""
echo "Connect with:"
echo "  psql -h localhost -U ${DB_USER} -d ${DB_NAME:-sla_monitor}"
echo ""
echo "Next Steps:"
echo "  1. Run migrations: cd verify-monitor-api && npx prisma migrate deploy"
echo "  2. Seed initial data: cd verify-monitor-api && npm run db:seed"
echo "  3. Start services: pm2 start ecosystem.config.js"
echo ""

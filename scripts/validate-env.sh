#!/bin/bash

###############################################################################
# validate-env.sh
# 환경변수 보안 검증 스크립트
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Environment Variables Security Validation${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Check if .env file exists
if [ ! -f "$PROJECT_ROOT/.env" ]; then
    echo -e "${RED}❌ Error: .env file not found${NC}"
    echo "Create .env file from .env.example:"
    echo "  cp .env.example .env"
    exit 1
fi

# Load environment variables
source "$PROJECT_ROOT/.env"

echo "Checking required environment variables..."
echo ""

# Required variables
REQUIRED_VARS=(
    "DB_USER"
    "DB_PASSWORD"
    "DATABASE_URL"
    "JWT_SECRET"
)

OPTIONAL_VARS=(
    "JWT_EXPIRES_IN"
    "JWT_REFRESH_EXPIRES_IN"
    "CORS_ORIGIN"
    "NODE_ENV"
)

MISSING=()
WARNINGS=()

# Check required variables
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        MISSING+=("$var")
        echo -e "${RED}❌ Missing: $var${NC}"
    else
        echo -e "${GREEN}✓ Found: $var${NC}"
    fi
done

echo ""

# Security validations
echo "Running security validations..."
echo ""

# 1. Database password strength
if [ -n "$DB_PASSWORD" ]; then
    PASSWORD_LENGTH=${#DB_PASSWORD}

    if [ $PASSWORD_LENGTH -lt 12 ]; then
        WARNINGS+=("DB_PASSWORD is too short (${PASSWORD_LENGTH} chars, minimum 12)")
        echo -e "${YELLOW}⚠️  Warning: DB_PASSWORD is too short (${PASSWORD_LENGTH} chars, minimum 12)${NC}"
    else
        echo -e "${GREEN}✓ DB_PASSWORD length is adequate (${PASSWORD_LENGTH} chars)${NC}"
    fi

    # Check for common weak passwords
    WEAK_PASSWORDS=("password" "123456" "admin" "dev_password_123" "test")
    for weak in "${WEAK_PASSWORDS[@]}"; do
        if [[ "$DB_PASSWORD" == *"$weak"* ]]; then
            echo -e "${RED}❌ Error: DB_PASSWORD contains weak pattern: '$weak'${NC}"
            MISSING+=("Weak DB_PASSWORD")
            break
        fi
    done
fi

# 2. JWT Secret strength
if [ -n "$JWT_SECRET" ]; then
    JWT_LENGTH=${#JWT_SECRET}

    if [ $JWT_LENGTH -lt 32 ]; then
        echo -e "${RED}❌ Error: JWT_SECRET is too short (${JWT_LENGTH} chars, minimum 32)${NC}"
        MISSING+=("JWT_SECRET too short")
    else
        echo -e "${GREEN}✓ JWT_SECRET length is adequate (${JWT_LENGTH} chars)${NC}"
    fi

    # Check for development/weak JWT secrets
    WEAK_JWTS=("dev_jwt_secret" "secret" "test" "change_in_production")
    for weak in "${WEAK_JWTS[@]}"; do
        if [[ "$JWT_SECRET" == *"$weak"* ]]; then
            echo -e "${RED}❌ Error: JWT_SECRET contains weak pattern: '$weak'${NC}"
            MISSING+=("Weak JWT_SECRET")
            break
        fi
    done
fi

# 3. DATABASE_URL validation
if [ -n "$DATABASE_URL" ]; then
    echo -e "${GREEN}✓ DATABASE_URL is set${NC}"

    # Check for localhost in production
    if [[ "$NODE_ENV" == "production" ]] && [[ "$DATABASE_URL" == *"localhost"* ]]; then
        WARNINGS+=("DATABASE_URL uses 'localhost' in production")
        echo -e "${YELLOW}⚠️  Warning: DATABASE_URL uses 'localhost' in production${NC}"
    fi

    # Check for weak passwords in DATABASE_URL
    if [[ "$DATABASE_URL" == *"dev_password"* ]] || [[ "$DATABASE_URL" == *"password123"* ]]; then
        echo -e "${RED}❌ Error: DATABASE_URL contains weak password${NC}"
        MISSING+=("Weak password in DATABASE_URL")
    fi
fi

# 4. NODE_ENV validation
if [ -n "$NODE_ENV" ]; then
    if [[ "$NODE_ENV" != "development" ]] && [[ "$NODE_ENV" != "production" ]] && [[ "$NODE_ENV" != "test" ]]; then
        WARNINGS+=("NODE_ENV has unexpected value: $NODE_ENV")
        echo -e "${YELLOW}⚠️  Warning: NODE_ENV has unexpected value: $NODE_ENV${NC}"
    else
        echo -e "${GREEN}✓ NODE_ENV is set to: $NODE_ENV${NC}"
    fi
fi

# 5. CORS Origin validation (production only)
if [[ "$NODE_ENV" == "production" ]]; then
    if [ -z "$CORS_ORIGIN" ]; then
        WARNINGS+=("CORS_ORIGIN not set in production")
        echo -e "${YELLOW}⚠️  Warning: CORS_ORIGIN not set in production${NC}"
    elif [[ "$CORS_ORIGIN" == *"localhost"* ]]; then
        WARNINGS+=("CORS_ORIGIN contains 'localhost' in production")
        echo -e "${YELLOW}⚠️  Warning: CORS_ORIGIN contains 'localhost' in production${NC}"
    else
        echo -e "${GREEN}✓ CORS_ORIGIN is properly configured${NC}"
    fi
fi

# 6. File permissions check
ENV_PERMS=$(stat -f "%Lp" "$PROJECT_ROOT/.env" 2>/dev/null || stat -c "%a" "$PROJECT_ROOT/.env" 2>/dev/null)
if [ "$ENV_PERMS" != "600" ]; then
    WARNINGS+=(".env file permissions are too open: $ENV_PERMS (should be 600)")
    echo -e "${YELLOW}⚠️  Warning: .env file permissions are too open: $ENV_PERMS${NC}"
    echo "   Fix with: chmod 600 .env"
else
    echo -e "${GREEN}✓ .env file permissions are secure (600)${NC}"
fi

echo ""
echo -e "${BLUE}================================================${NC}"
echo "Validation Summary:"
echo -e "${BLUE}================================================${NC}"
echo ""

# Print optional variables status
echo "Optional Variables:"
for var in "${OPTIONAL_VARS[@]}"; do
    if [ -n "${!var}" ]; then
        echo -e "  ${GREEN}✓${NC} $var"
    else
        echo -e "  ${YELLOW}○${NC} $var (not set, using defaults)"
    fi
done

echo ""

# Final result
if [ ${#MISSING[@]} -gt 0 ]; then
    echo -e "${RED}❌ VALIDATION FAILED${NC}"
    echo ""
    echo "Missing or invalid required variables:"
    printf '  - %s\n' "${MISSING[@]}"
    echo ""
    echo "Please fix these issues before deploying."
    exit 1
fi

if [ ${#WARNINGS[@]} -gt 0 ]; then
    echo -e "${YELLOW}⚠️  VALIDATION PASSED WITH WARNINGS${NC}"
    echo ""
    echo "Warnings (${#WARNINGS[@]}):"
    printf '  - %s\n' "${WARNINGS[@]}"
    echo ""
    echo "Consider addressing these warnings before production deployment."
    exit 0
fi

echo -e "${GREEN}✅ ALL VALIDATIONS PASSED${NC}"
echo ""
echo "Environment is properly configured for deployment."
exit 0

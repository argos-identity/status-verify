#!/bin/bash
# Next.js Standalone 빌드 및 배포 스크립트
#
# 사용법:
#   ./scripts/deploy-standalone.sh
#
# 이 스크립트는 다음을 수행합니다:
# 1. Next.js 애플리케이션 빌드 (standalone 모드)
# 2. 정적 파일 (.next/static, public) 복사
# 3. 빌드 완료 확인

set -e  # 에러 발생 시 스크립트 중단

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Next.js Standalone 빌드 스크립트${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 현재 디렉토리 확인
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

echo -e "${YELLOW}📂 프로젝트 경로: ${PROJECT_ROOT}${NC}"
cd "$PROJECT_ROOT"

# 1. 빌드 실행
echo ""
echo -e "${YELLOW}🏗️  Step 1: Next.js 애플리케이션 빌드 중...${NC}"
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ 빌드 실패!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ 빌드 완료${NC}"

# 2. 정적 파일 복사
echo ""
echo -e "${YELLOW}📦 Step 2: 정적 파일 복사 중...${NC}"

STANDALONE_DIR=".next/standalone/status-verify/verify-main"

# .next/static 디렉토리 확인 및 복사
if [ -d ".next/static" ]; then
    echo "  → .next/static 복사 중..."
    mkdir -p "$STANDALONE_DIR/.next"
    cp -r .next/static "$STANDALONE_DIR/.next/static"
    echo -e "${GREEN}  ✅ .next/static 복사 완료${NC}"
else
    echo -e "${RED}  ❌ .next/static 디렉토리를 찾을 수 없습니다!${NC}"
    exit 1
fi

# public 디렉토리 확인 및 복사
if [ -d "public" ]; then
    echo "  → public 복사 중..."
    cp -r public "$STANDALONE_DIR/public"
    echo -e "${GREEN}  ✅ public 복사 완료${NC}"
else
    echo -e "${YELLOW}  ⚠️  public 디렉토리가 없습니다 (선택사항)${NC}"
fi

# 3. 빌드 결과 확인
echo ""
echo -e "${YELLOW}🔍 Step 3: 빌드 결과 검증 중...${NC}"

# server.js 파일 확인
if [ -f "$STANDALONE_DIR/server.js" ]; then
    echo -e "${GREEN}  ✅ server.js 존재${NC}"
else
    echo -e "${RED}  ❌ server.js를 찾을 수 없습니다!${NC}"
    exit 1
fi

# .next/static 복사 확인
if [ -d "$STANDALONE_DIR/.next/static" ]; then
    STATIC_FILES=$(find "$STANDALONE_DIR/.next/static" -type f | wc -l)
    echo -e "${GREEN}  ✅ .next/static 복사 완료 (파일 수: $STATIC_FILES)${NC}"
else
    echo -e "${RED}  ❌ .next/static 복사 실패!${NC}"
    exit 1
fi

# public 복사 확인
if [ -d "$STANDALONE_DIR/public" ]; then
    PUBLIC_FILES=$(find "$STANDALONE_DIR/public" -type f | wc -l)
    echo -e "${GREEN}  ✅ public 복사 완료 (파일 수: $PUBLIC_FILES)${NC}"
fi

# 4. 완료 메시지
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Standalone 빌드 완료!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}🚀 서버 실행 방법:${NC}"
echo -e "   ${BLUE}node .next/standalone/status-verify/verify-main/server.js${NC}"
echo ""
echo -e "${YELLOW}📝 또는 npm 스크립트 사용:${NC}"
echo -e "   ${BLUE}npm run start:standalone${NC}"
echo ""

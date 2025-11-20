# 빠른 시작 가이드 (Quickstart)

> 새로운 서버에 Status-Verify 프로젝트를 빠르게 배포하는 가이드

## 📋 목차

1. [사전 준비](#사전-준비)
2. [빠른 배포 (자동)](#빠른-배포-자동)
3. [수동 배포](#수동-배포)
4. [검증](#검증)
5. [문제 해결](#문제-해결)

---

## 사전 준비

### 필수 소프트웨어 설치

```bash
# Node.js 18 이상
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18

# PM2 (프로세스 매니저)
npm install -g pm2

# Docker & Docker Compose (데이터베이스용)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# 로그아웃 후 다시 로그인하여 Docker 권한 적용
```

### 프로젝트 클론

```bash
# Git 저장소에서 클론
git clone <repository-url> status-verify
cd status-verify

# 또는 파일 복사
scp -r status-verify user@server:/path/to/
cd /path/to/status-verify
```

---

## 빠른 배포 (자동)

### 1단계: 환경변수 설정

```bash
# 루트 .env 파일 생성
cp .env.example .env

# 비밀번호 및 JWT Secret 설정 (필수!)
nano .env

# 최소한 다음 항목 변경:
# DB_PASSWORD=강력한_비밀번호
```

### 2단계: 자동 배포 스크립트 실행

```bash
# 모든 스크립트에 실행 권한 부여
chmod +x scripts/*.sh

# 1. 데이터베이스 구축 (Docker)
bash scripts/setup-database.sh

# 2. 전체 배포 (빌드 + 마이그레이션 + 시딩)
bash scripts/deploy-all.sh

# 3. PM2로 모든 서비스 시작
bash scripts/pm2-start-all.sh

# 4. Health Check
bash scripts/health-check.sh
```

### 3단계: 접속 확인

```bash
# 시스템 상태 대시보드
open http://localhost:80

# 인시던트 관리
open http://localhost:3006

# API 헬스체크
curl http://localhost:3001/api/health
```

**끝!** 🎉 모든 서비스가 실행 중입니다.

---

## 수동 배포

자동 스크립트가 작동하지 않는 경우 수동으로 배포:

### 1. PostgreSQL 데이터베이스

```bash
# Docker Compose로 시작
docker-compose up -d postgres

# 연결 확인
docker-compose exec postgres pg_isready -U slamonitor -d sla_monitor
```

### 2. verify-monitor-api (Backend)

```bash
cd verify-monitor-api

# 환경변수 설정
cp .env.example .env
nano .env  # DATABASE_URL, JWT_SECRET 설정

# 의존성 설치 및 빌드
npm ci --only=production
npx prisma generate
npm run build

# 마이그레이션 및 시딩
npx prisma migrate deploy
npm run db:seed  # 첫 배포시만

# 로그 디렉토리 생성
mkdir -p logs

# PM2로 시작
pm2 start dist/server.js --name verify-monitor-api \
  --instances 2 --exec-mode cluster

cd ..
```

### 3. watch-server (헬스체크 모니터)

```bash
cd watch-server

# 환경변수 설정
cp .env.example .env
nano .env  # DATABASE_URL 설정

# 의존성 설치 및 빌드
npm ci --only=production
npx prisma generate
npm run build

# 로그 디렉토리
mkdir -p logs

# PM2로 시작 (단일 인스턴스)
pm2 start dist/index.js --name watch-server

cd ..
```

### 4. verify-main (프론트엔드 대시보드)

```bash
cd verify-main

# 환경변수 설정
cp .env.local.example .env.local
nano .env.local  # API URL 설정

# 로그 디렉토리
mkdir -p logs


# 의존성 설치 및 빌드
npm run build:standalone


# Port 80 권한 부여 (한 번만)
sudo setcap 'cap_net_bind_service=+ep' $(which node)

# PM2로 시작
cd ..

pm2 start verify-main-ecosystem.config.js --name verify-main \ --instances 2 --exec-mode cluster

또는 

npm run start:standalone
```

### 5. verify-incidents (인시던트 관리)

```bash
cd verify-incidents

# 환경변수 설정
cp .env.local.example .env.local
nano .env.local  # API URL, NEXTAUTH_SECRET 설정

# 의존성 설치 및 빌드
npm ci --only=production
npm run build

# 로그 디렉토리
mkdir -p logs

# PM2로 시작
pm2 start .next/standalone/server.js --name verify-incidents \
  --instances 2 --exec-mode cluster \
  -- --port 3006

cd ..
```

### 6. PM2 설정 저장

```bash
# 현재 프로세스 목록 저장
pm2 save

# 시스템 부팅 시 자동 시작 설정
pm2 startup
# 출력된 명령어를 복사해서 실행

# 상태 확인
pm2 status
```

---

## 검증

### 1. 서비스 상태 확인

```bash
# PM2 프로세스 상태
pm2 status

# 예상 출력:
# ┌─────┬────────────────────────┬─────────┬─────────┐
# │ id  │ name                   │ status  │ cpu     │
# ├─────┼────────────────────────┼─────────┼─────────┤
# │ 0   │ verify-monitor-api     │ online  │ 0.2%    │
# │ 1   │ watch-server           │ online  │ 0.1%    │
# │ 2   │ verify-main            │ online  │ 0.3%    │
# │ 3   │ verify-incidents       │ online  │ 0.2%    │
# └─────┴────────────────────────┴─────────┴─────────┘
```

### 2. Health Check

```bash
# 자동 헬스체크 스크립트
bash scripts/health-check.sh

# 또는 수동으로:
curl http://localhost:5432  # PostgreSQL
curl http://localhost:3001/api/health  # API
curl http://localhost:3008/health  # Watch Server
curl -I http://localhost:80  # verify-main
curl -I http://localhost:3006  # verify-incidents
```

### 3. 데이터베이스 확인

```bash
# PostgreSQL 접속
psql -h localhost -U slamonitor -d sla_monitor

# 테이블 확인
\dt

# 서비스 데이터 확인
SELECT id, name, display_name FROM services;

# 사용자 확인
SELECT username, email, role FROM users;

# 종료
\q
```

### 4. 로그 확인

```bash
# 모든 로그
pm2 logs

# 특정 서비스 로그
pm2 logs verify-monitor-api --lines 50

# 에러 로그만
pm2 logs --err

# 실시간 모니터링
pm2 monit
```

---

## 문제 해결

### 문제 1: Port 80 권한 에러

**증상**: `Error: listen EACCES: permission denied 0.0.0.0:80`

**해결**:
```bash
# 옵션 1: Node.js에 권한 부여 (권장)
sudo setcap 'cap_net_bind_service=+ep' $(which node)
pm2 restart verify-main

# 옵션 2: Port 3000으로 변경
# verify-main/.env.local에서 PORT=3000
# Nginx로 80 → 3000 프록시 설정
```

### 문제 2: 데이터베이스 연결 실패

**증상**: `Can't reach database server`

**해결**:
```bash
# PostgreSQL 상태 확인
docker-compose ps

# 시작
docker-compose up -d postgres

# 로그 확인
docker-compose logs postgres

# 연결 테스트
psql -h localhost -U slamonitor -d sla_monitor
```

### 문제 3: PM2 프로세스가 계속 재시작

**증상**: restart count가 계속 증가

**해결**:
```bash
# 에러 로그 확인
pm2 logs [service-name] --err --lines 100

# 수동 실행으로 에러 확인
cd verify-monitor-api
node dist/server.js

# 환경변수 확인
pm2 show verify-monitor-api

# 포트 충돌 확인
sudo lsof -i :3001
sudo netstat -tulpn | grep 3001
```

### 문제 4: Prisma 마이그레이션 에러

**증상**: `Migration failed to apply`

**해결**:
```bash
cd verify-monitor-api

# 마이그레이션 상태 확인
npx prisma migrate status

# 강제 적용
npx prisma migrate resolve --applied "migration_name"

# 클라이언트 재생성
npx prisma generate

# 데이터베이스 초기화 (개발환경만!)
npx prisma migrate reset
```

### 문제 5: watch-server가 모니터링하지 않음

**증상**: 헬스체크 로그가 없음

**해결**:
```bash
# watch-server 로그 확인
pm2 logs watch-server

# 서비스 설정 확인
psql -U slamonitor -d sla_monitor
SELECT id, name, endpoint_url, is_active FROM services;

# 수동 헬스체크 테스트
curl http://localhost:3008/api/test-health-check

# 서비스 URL 연결 테스트
curl -v https://idverify-api.argosidentity.com/modules/recognition
```

---

## 유용한 명령어

### PM2 관리

```bash
pm2 status               # 상태 확인
pm2 restart all          # 모든 서비스 재시작
pm2 stop all             # 모든 서비스 중지
pm2 delete all           # 모든 서비스 삭제
pm2 logs                 # 통합 로그
pm2 monit                # 실시간 모니터링
pm2 save                 # 프로세스 목록 저장
pm2 flush                # 로그 비우기
```

### Docker 관리

```bash
docker-compose ps                        # 컨테이너 상태
docker-compose logs postgres             # PostgreSQL 로그
docker-compose restart postgres          # PostgreSQL 재시작
docker-compose down                      # 모든 컨테이너 중지
docker-compose up -d                     # 모든 컨테이너 시작
```

### 데이터베이스 관리

```bash
# 백업
docker-compose exec postgres pg_dump -U slamonitor sla_monitor > backup.sql

# 복원
cat backup.sql | docker-compose exec -T postgres psql -U slamonitor -d sla_monitor

# Prisma Studio (GUI)
cd verify-monitor-api
npx prisma studio  # http://localhost:5555
```

---

## 다음 단계

배포가 완료되면:

1. **비밀번호 변경**: 기본 admin 계정 비밀번호 변경
2. **SSL 설정**: Let's Encrypt로 HTTPS 설정
3. **모니터링**: Grafana, Prometheus 설정
4. **백업 자동화**: Cron으로 데이터베이스 자동 백업
5. **알림 설정**: Slack/이메일 알림 연동

---

## 참고 문서

- [DEPLOYMENT.md](./DEPLOYMENT.md) - 완전한 배포 가이드
- [DATABASE-SETUP.md](./DATABASE-SETUP.md) - 데이터베이스 상세 가이드
- [ecosystem.config.js](./ecosystem.config.js) - PM2 설정
- [docker-compose.yml](./docker-compose.yml) - Docker 설정
- [CLAUDE.md](./CLAUDE.md) - 프로젝트 개요

---

## 기본 계정 정보

```
Admin:
  Email: admin@argosidentity.com
  Password: Admin@123

Reporter:
  Email: reporter@argosidentity.com
  Password: reporter123

Viewer:
  Email: viewer@argosidentity.com
  Password: viewer123
```

**⚠️ 보안 주의**: 첫 로그인 후 즉시 비밀번호를 변경하세요!

---

**Last Updated**: 2025-11-10
**Version**: 1.0.0

# Status-Verify 프로젝트 배포 가이드

> 신규 서버에 SLA 모니터링 시스템 전체를 구축하는 완전한 가이드

## 📋 목차

1. [시스템 개요](#시스템-개요)
2. [사전 요구사항](#사전-요구사항)
3. [데이터베이스 구축 (Docker)](#데이터베이스-구축-docker)
4. [서비스별 배포 방법](#서비스별-배포-방법)
5. [PM2 통합 배포](#pm2-통합-배포)
6. [검증 및 테스트](#검증-및-테스트)
7. [보안 체크리스트](#보안-체크리스트)
8. [트러블슈팅](#트러블슈팅)

---

## 시스템 개요

### 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                        사용자                                │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │    HAProxy (Optional)         │
        │    Port 80 (HTTP)             │
        └───────────────┬───────────────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
        ▼                               ▼
┌───────────────┐              ┌───────────────┐
│ verify-main   │              │ verify-       │
│ (Next.js)     │              │ incidents     │
│ Port 80       │              │ Port 3006     │
└───────┬───────┘              └───────┬───────┘
        │                               │
        └───────────────┬───────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │  verify-monitor-api           │
        │  (Express + Socket.IO)        │
        │  Port 3001                    │
        └───────────────┬───────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ PostgreSQL  │  │ watch-server│  │ External    │
│ Port 5432   │  │ Port 3008   │  │ Services    │
└─────────────┘  └─────────────┘  └─────────────┘
```

### 구성 요소

| 서비스 | 포트 | 기술 스택 | 용도 |
|--------|------|-----------|------|
| **verify-main** | 80 | Next.js 15, React 19 | 시스템 상태 대시보드 |
| **verify-incidents** | 3006 | Next.js 15, NextAuth | 인시던트 관리 앱 |
| **verify-monitor-api** | 3001 | Express, Socket.IO, Prisma | REST API + WebSocket |
| **watch-server** | 3008 | Node.js, Prisma | 자동 헬스체크 모니터링 |
| **PostgreSQL** | 5432 | PostgreSQL 15 | 데이터베이스 |

### 데이터베이스 스키마

**9개 핵심 테이블**:
- `services` - 모니터링 대상 서비스
- `uptime_records` - 일별 가동률 기록
- `incident` - 인시던트 보고서
- `incident_update` - 인시던트 업데이트 이력
- `users` - 사용자 (viewer/reporter/admin)
- `api_response_times` - API 응답시간 측정
- `api_call_logs` - 일별 API 호출 통계
- `watch_server_logs` - 헬스체크 결과
- `system_status` - 전체 시스템 상태

---

## 사전 요구사항

### 시스템 요구사항

```bash
# OS
Ubuntu 20.04 LTS 이상 또는 CentOS 7 이상

# Node.js
Node.js >= 18.0.0
npm >= 9.0.0

# Docker (데이터베이스용)
Docker >= 20.10
Docker Compose >= 2.0

# Process Manager
PM2 (npm install -g pm2)

# Database
PostgreSQL 15 (Docker 또는 직접 설치)
```

### 필수 설치 패키지

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y git curl wget build-essential

# Node.js 설치 (nvm 사용 권장)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18

# PM2 설치
npm install -g pm2

# Docker 설치
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Docker Compose 설치
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

---

## 데이터베이스 구축 (Docker)

### 1. Docker Compose 파일 확인

프로젝트 루트의 `docker-compose.yml` 파일을 사용합니다:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: sla-monitor-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: sla_monitor
      POSTGRES_USER: ${DB_USER:-slamonitor}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-dev_password_123}
      POSTGRES_INITDB_ARGS: "--encoding=UTF8"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U slamonitor -d sla_monitor"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

### 2. 환경변수 설정

```bash
# 프로젝트 루트에 .env 파일 생성
cat > .env << 'EOF'
# Database Configuration
DB_USER=slamonitor
DB_PASSWORD=your_strong_password_here_change_this
DB_PORT=5432
DATABASE_URL=postgresql://slamonitor:your_strong_password_here_change_this@localhost:5432/sla_monitor
EOF

# 보안을 위해 권한 제한
chmod 600 .env
```

### 3. PostgreSQL 시작

```bash
# Docker Compose로 PostgreSQL 시작
docker-compose up -d postgres

# 컨테이너 상태 확인
docker-compose ps

# 로그 확인
docker-compose logs -f postgres

# 데이터베이스 연결 테스트
docker-compose exec postgres pg_isready -U slamonitor -d sla_monitor
```

### 4. 데이터베이스 접속 확인

```bash
# psql 접속
docker-compose exec postgres psql -U slamonitor -d sla_monitor

# 또는 로컬에서 직접 접속
psql -h localhost -U slamonitor -d sla_monitor
```

**참고**: 데이터베이스 스키마는 `verify-monitor-api` 배포 시 자동으로 생성됩니다.

---

## 서비스별 배포 방법

### 1. verify-monitor-api (Backend API)

#### 1.1 환경변수 설정

```bash
cd verify-monitor-api

# .env 파일 생성
cat > .env << 'EOF'
# Server Configuration
NODE_ENV=production
PORT=3001
HOST=0.0.0.0

# Database (Required)
DATABASE_URL=postgresql://slamonitor:your_password@localhost:5432/sla_monitor
DB_MAX_CONNECTIONS=10

# JWT Authentication (Required - Generate strong secret)
JWT_SECRET=$(openssl rand -base64 64)
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:80,http://localhost:3006
CORS_CREDENTIALS=true

# Socket.IO Configuration
SOCKET_PING_TIMEOUT=60000
SOCKET_PING_INTERVAL=25000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
LOG_FILE=logs/api.log

# Seeding (First deployment only)
SEED_DATABASE=true

# Default Admin Account
DEFAULT_ADMIN_EMAIL=admin@argosidentity.com
DEFAULT_ADMIN_PASSWORD=Admin@123
EOF

chmod 600 .env
```

#### 1.2 빌드 및 배포

```bash
# 의존성 설치
npm ci --only=production

# Prisma 클라이언트 생성
npx prisma generate

# TypeScript 빌드
npm run build

# 데이터베이스 마이그레이션 (프로덕션)
npx prisma migrate deploy

# 초기 데이터 시딩 (첫 배포시만)
npm run db:seed

# 로그 디렉토리 생성
mkdir -p logs
```

#### 1.3 PM2로 실행

```bash
# 단일 서비스 실행
pm2 start dist/server.js --name verify-monitor-api \
  --instances 2 \
  --exec-mode cluster \
  --env production

# 상태 확인
pm2 status verify-monitor-api

# 로그 확인
pm2 logs verify-monitor-api --lines 50
```

#### 1.4 Health Check

```bash
curl http://localhost:3001/api/health

# 예상 응답:
# {"status":"ok","timestamp":"2025-11-10T..."}
```

---

### 2. watch-server (모니터링 서비스)

#### 2.1 환경변수 설정

```bash
cd watch-server

cat > .env << 'EOF'
# Watch Server Configuration
NODE_ENV=production
PORT=3008

# Database (Same as API)
DATABASE_URL=postgresql://slamonitor:your_password@localhost:5432/sla_monitor

# Monitoring Settings
MONITORING_INTERVAL=60000  # 1분 (60초)
REQUEST_TIMEOUT=5000       # 5초
MAX_RETRIES=3
RETRY_DELAY=1000

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/watch-server.log

# Service Endpoints (프로덕션 URL로 변경)
ID_RECOGNITION_URL=https://idverify-api.argosidentity.com/modules/recognition
FACE_LIVENESS_URL=https://idverify-api.argosidentity.com/modules/liveness
ID_LIVENESS_URL=https://idverify-api.argosidentity.com/modules/document
FACE_COMPARE_URL=https://idverify-api.argosidentity.com/modules/compare
CURP_VERIFIER_URL=https://idverify-api.argosidentity.com/modules/verify/curp

# Service Authentication
SERVICE_API_KEY=b5e25e79-343c-4b18-9c76-f0c4fae000c3
SERVICE_AUTH_HEADER=x-api-key

# Auto-Incident Detection
ENABLE_AUTO_INCIDENT_DETECTION=true
MONITOR_API_URL=http://localhost:3001
AUTO_DETECTION_TIMEOUT=5000
EOF

chmod 600 .env
```

#### 2.2 빌드 및 배포

```bash
# 의존성 설치
npm ci --only=production

# Prisma 클라이언트 생성
npx prisma generate

# TypeScript 빌드
npm run build

# 로그 디렉토리 생성
mkdir -p logs
```

#### 2.3 PM2로 실행

```bash
# watch-server는 단일 인스턴스로 실행 (cron 작업)
pm2 start dist/index.js --name watch-server \
  --instances 1 \
  --exec-mode fork

pm2 status watch-server
pm2 logs watch-server --lines 50
```

---

### 3. verify-main (프론트엔드 대시보드)

#### 3.1 환경변수 설정

```bash
cd verify-main

cat > .env.local << 'EOF'
NODE_ENV=production
PORT=80

# API URLs
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001

# 프로덕션에서는 실제 도메인 사용
# NEXT_PUBLIC_API_URL=https://api.yourdomain.com
# NEXT_PUBLIC_WS_URL=wss://api.yourdomain.com
EOF
```

#### 3.2 빌드 및 배포

```bash
# 의존성 설치
npm ci --only=production

# Next.js 빌드 (standalone 모드)
npm run build

# standalone 빌드 확인
ls -la .next/standalone/
```

#### 3.3 PM2로 실행

```bash
# Port 80은 root 권한 필요 (또는 setcap 사용)
# 옵션 1: sudo로 실행
sudo pm2 start .next/standalone/server.js --name verify-main \
  --instances 2 \
  --exec-mode cluster

# 옵션 2: Port 3000으로 변경 후 nginx/HAProxy로 라우팅
# PORT=3000 pm2 start .next/standalone/server.js --name verify-main
```

**Port 80 권한 부여 (권장)**:
```bash
# Node.js에 port 80 바인딩 권한 부여
sudo setcap 'cap_net_bind_service=+ep' $(which node)

# 이제 일반 사용자로 실행 가능
pm2 start .next/standalone/server.js --name verify-main \
  --instances 2 \
  --exec-mode cluster
```

---

### 4. verify-incidents (인시던트 관리)

#### 4.1 환경변수 설정

```bash
cd verify-incidents

cat > .env.local << 'EOF'
NODE_ENV=production
PORT=3006

# API URLs
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001

# NextAuth Configuration
NEXTAUTH_URL=http://localhost:3006
NEXTAUTH_SECRET=$(openssl rand -base64 32)

# 프로덕션 URL
# NEXTAUTH_URL=https://incidents.yourdomain.com
EOF
```

#### 4.2 빌드 및 배포

```bash
# 의존성 설치
npm ci --only=production

# Next.js 빌드
npm run build

# standalone 빌드 확인
ls -la .next/standalone/
```

#### 4.3 PM2로 실행

```bash
pm2 start .next/standalone/server.js --name verify-incidents \
  --instances 2 \
  --exec-mode cluster \
  -- --port 3006

pm2 status verify-incidents
```

---

## PM2 통합 배포

### ecosystem.config.js 사용

프로젝트 루트의 `ecosystem.config.js` 파일을 사용하여 모든 서비스를 한번에 관리:

```bash
# 프로젝트 루트에서 실행
cd /path/to/status-verify

# 모든 서비스 시작
pm2 start ecosystem.config.js

# 상태 확인
pm2 status

# 모니터링 대시보드
pm2 monit

# 로그 확인
pm2 logs

# 특정 서비스 재시작
pm2 restart verify-monitor-api

# 모든 서비스 재시작
pm2 restart all

# 서비스 중지
pm2 stop all

# PM2 설정 저장
pm2 save

# 시스템 부팅시 자동 시작 설정
pm2 startup
# 출력된 명령어를 복사해서 실행
```

### PM2 유용한 명령어

```bash
# 서비스 삭제
pm2 delete verify-monitor-api
pm2 delete all

# 로그 비우기
pm2 flush

# 메모리 사용량 확인
pm2 show verify-monitor-api

# 실시간 로그 스트리밍
pm2 logs --raw

# JSON 형식으로 상태 확인
pm2 jlist

# 웹 모니터링 (선택사항)
pm2 install pm2-server-monit
```

---

## 검증 및 테스트

### 1. Health Check 엔드포인트

```bash
# verify-monitor-api
curl http://localhost:3001/api/health
# 예상: {"status":"ok","timestamp":"..."}

# watch-server
curl http://localhost:3008/health
# 예상: {"status":"ok","uptime":...}

# verify-main (브라우저 접속)
curl -I http://localhost:80
# 예상: HTTP/1.1 200 OK

# verify-incidents
curl -I http://localhost:3006
# 예상: HTTP/1.1 200 OK
```

### 2. 데이터베이스 확인

```bash
# PostgreSQL 접속
psql -h localhost -U slamonitor -d sla_monitor

# 테이블 확인
\dt

# 서비스 데이터 확인
SELECT id, name, display_name, status FROM services;

# 사용자 확인
SELECT username, email, role FROM users;

# 최근 헬스체크 로그
SELECT * FROM watch_server_logs ORDER BY created_at DESC LIMIT 10;

# 나가기
\q
```

### 3. PM2 프로세스 상태

```bash
# 모든 프로세스 상태
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

### 4. 로그 확인

```bash
# API 로그
tail -f verify-monitor-api/logs/api.log

# Watch server 로그
tail -f watch-server/logs/watch-server.log

# PM2 로그
pm2 logs --lines 100
```

### 5. WebSocket 연결 테스트

```bash
# Socket.IO 클라이언트 테스트 (Node.js)
node -e "
const io = require('socket.io-client');
const socket = io('http://localhost:3001');
socket.on('connect', () => {
  console.log('WebSocket 연결 성공!');
  process.exit(0);
});
socket.on('connect_error', (err) => {
  console.error('WebSocket 연결 실패:', err.message);
  process.exit(1);
});
"
```

### 6. API 기능 테스트

```bash
# 서비스 목록 조회 (인증 불필요 - Public endpoint)
curl http://localhost:3001/api/services

# 헬스체크 시작 (테스트)
curl http://localhost:3008/api/test-health-check

# 시스템 상태 조회
curl http://localhost:3001/api/system-status
```

---

## 보안 체크리스트

### 🔐 배포 전 필수 보안 설정

#### 1. 비밀번호 변경
- [ ] PostgreSQL 데이터베이스 비밀번호 변경
- [ ] JWT_SECRET 강력한 값으로 생성 (64자 이상)
- [ ] NEXTAUTH_SECRET 생성
- [ ] 기본 admin 계정 비밀번호 변경

```bash
# JWT Secret 생성
openssl rand -base64 64

# NEXTAUTH Secret 생성
openssl rand -base64 32

# 데이터베이스 비밀번호 변경
docker-compose exec postgres psql -U postgres
ALTER USER slamonitor WITH PASSWORD 'new_strong_password';
```

#### 2. 환경변수 보안
- [ ] 모든 .env 파일 권한 600으로 설정
- [ ] .env 파일을 git에 커밋하지 않도록 확인 (.gitignore)
- [ ] 프로덕션 환경변수는 별도 관리 (AWS Secrets Manager 등)

```bash
# 권한 설정
find . -name ".env*" -exec chmod 600 {} \;

# .gitignore 확인
cat .gitignore | grep ".env"
```

#### 3. CORS 설정
- [ ] ALLOWED_ORIGINS를 실제 프로덕션 도메인으로 변경
- [ ] 와일드카드(*) 사용하지 않기

```bash
# verify-monitor-api/.env
ALLOWED_ORIGINS=https://yourdomain.com,https://incidents.yourdomain.com
```

#### 4. 방화벽 설정
```bash
# UFW 방화벽 설정 (Ubuntu)
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# 내부 포트는 외부에서 접근 불가능하도록 설정
# 3001, 3006, 3008, 5432는 localhost에서만 접근
```

#### 5. SSL/TLS 인증서
- [ ] Let's Encrypt 인증서 발급
- [ ] Nginx 또는 HAProxy에서 HTTPS 설정
- [ ] HTTP에서 HTTPS로 자동 리다이렉트

#### 6. Rate Limiting
- [ ] API rate limit 설정 확인 (기본: 100 req/15min)
- [ ] 필요시 조정

#### 7. 로그 보안
- [ ] 로그 파일에 민감 정보 기록하지 않기
- [ ] 로그 로테이션 설정 (logrotate)

```bash
# /etc/logrotate.d/status-verify
/path/to/status-verify/*/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 nodejs nodejs
    sharedscripts
}
```

---

## 트러블슈팅

### 문제 1: 데이터베이스 연결 실패

**증상**:
```
Error: P1001: Can't reach database server at localhost:5432
```

**해결 방법**:
```bash
# 1. PostgreSQL이 실행 중인지 확인
docker-compose ps postgres

# 2. 수동으로 시작
docker-compose up -d postgres

# 3. 로그 확인
docker-compose logs postgres

# 4. 네트워크 확인
telnet localhost 5432

# 5. 방화벽 확인
sudo ufw status
```

---

### 문제 2: Prisma Migration 실패

**증상**:
```
Error: Migration failed to apply
```

**해결 방법**:
```bash
cd verify-monitor-api

# 1. 현재 마이그레이션 상태 확인
npx prisma migrate status

# 2. 마이그레이션 초기화 (개발 환경에서만!)
npx prisma migrate reset

# 3. 프로덕션에서 강제 적용
npx prisma migrate resolve --applied "migration_name"

# 4. 클라이언트 재생성
npx prisma generate
```

---

### 문제 3: PM2 프로세스가 계속 재시작됨

**증상**:
```
verify-monitor-api  │ restart │ 10
```

**해결 방법**:
```bash
# 1. 로그 확인
pm2 logs verify-monitor-api --lines 100 --err

# 2. 환경변수 확인
pm2 show verify-monitor-api

# 3. 수동 실행으로 에러 확인
cd verify-monitor-api
node dist/server.js

# 4. 포트 충돌 확인
sudo lsof -i :3001
sudo netstat -tulpn | grep 3001

# 5. 메모리 부족 확인
free -h
pm2 show verify-monitor-api  # memory usage 확인
```

---

### 문제 4: Port 80 바인딩 실패

**증상**:
```
Error: listen EACCES: permission denied 0.0.0.0:80
```

**해결 방법**:
```bash
# 방법 1: Node.js에 권한 부여 (권장)
sudo setcap 'cap_net_bind_service=+ep' $(which node)

# 방법 2: 다른 포트 사용 + Nginx 프록시
# verify-main을 port 3000으로 변경
# Nginx에서 80 → 3000 프록시

# 방법 3: sudo로 PM2 실행 (비권장)
sudo pm2 start ecosystem.config.js
```

---

### 문제 5: WebSocket 연결 실패

**증상**:
브라우저 콘솔에서 `WebSocket connection failed`

**해결 방법**:
```bash
# 1. API 서버 확인
curl http://localhost:3001/api/health

# 2. Socket.IO 엔드포인트 확인
curl http://localhost:3001/socket.io/

# 3. CORS 설정 확인
# verify-monitor-api/.env에서 ALLOWED_ORIGINS 확인

# 4. 방화벽 확인
sudo ufw status

# 5. 프론트엔드 환경변수 확인
# NEXT_PUBLIC_WS_URL이 올바른지 확인
```

---

### 문제 6: watch-server가 서비스를 모니터링하지 않음

**증상**:
로그에 health check 기록이 없음

**해결 방법**:
```bash
# 1. watch-server 로그 확인
pm2 logs watch-server --lines 50

# 2. 데이터베이스 연결 확인
# watch-server는 services 테이블에서 서비스 목록을 가져옴

# 3. 서비스 URL 확인
psql -U slamonitor -d sla_monitor
SELECT id, name, endpoint_url, is_active FROM services;

# 4. 네트워크 확인
curl -v https://idverify-api.argosidentity.com/modules/recognition

# 5. 수동 health check 실행
curl http://localhost:3008/api/test-health-check
```

---

## 유용한 명령어 모음

### 전체 시스템 관리

```bash
# 모든 서비스 시작
pm2 start ecosystem.config.js

# 모든 서비스 재시작
pm2 restart all

# 모든 서비스 중지
pm2 stop all

# 모든 서비스 삭제
pm2 delete all

# 설정 저장
pm2 save

# 시스템 재부팅 후 자동 시작
pm2 startup
```

### 데이터베이스 관리

```bash
# 백업
docker-compose exec postgres pg_dump -U slamonitor sla_monitor > backup_$(date +%Y%m%d).sql

# 복원
cat backup.sql | docker-compose exec -T postgres psql -U slamonitor -d sla_monitor

# Prisma Studio (GUI)
cd verify-monitor-api
npx prisma studio
```

### 로그 모니터링

```bash
# 실시간 로그
pm2 logs --lines 100

# 특정 서비스 로그
pm2 logs verify-monitor-api --lines 50

# 에러 로그만 보기
pm2 logs --err

# 로그 비우기
pm2 flush
```

---

## 다음 단계

배포가 완료되면:

1. **모니터링 설정**: Grafana, Prometheus 등으로 시스템 모니터링
2. **백업 자동화**: PostgreSQL 자동 백업 cron 작업 설정
3. **알림 설정**: 인시던트 발생 시 Slack/이메일 알림
4. **SSL 인증서**: Let's Encrypt로 HTTPS 설정
5. **CI/CD**: GitHub Actions 또는 Jenkins로 자동 배포 파이프라인 구축

---

## 참고 문서

- [DATABASE-SETUP.md](./DATABASE-SETUP.md) - 데이터베이스 상세 가이드
- [ecosystem.config.js](./ecosystem.config.js) - PM2 설정 파일
- [docker-compose.yml](./docker-compose.yml) - Docker 설정
- [CLAUDE.md](./CLAUDE.md) - 프로젝트 개요
- [PRD.md](./PRD.md) - 제품 요구사항 명세서

---

## 기술 지원

문제가 발생하면:
1. 로그 파일 확인 (`pm2 logs`)
2. 트러블슈팅 섹션 참고
3. GitHub Issues 등록
4. 개발팀에 문의

---

**Last Updated**: 2025-11-10
**Version**: 1.0.0

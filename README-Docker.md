# SLA Monitor System - Docker 배포 가이드

이 프로젝트를 Docker로 통합 배포하는 완전한 가이드입니다.

## 🏗️ 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Network                            │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐                           │
│  │ verify-main │  │verify-incidents│                         │
│  │   :3000     │  │     :3006     │                         │
│  └─────────────┘  └─────────────┘                           │
│          │                │              Frontend Network   │
│          └────────────────┼─────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┤
│  │                      │              Backend Network     │
│  │ ┌─────────────────┐  │  ┌─────────────┐ ┌─────────────┐ │
│  │ │ verify-monitor- │  │  │ watch-server│ │ PostgreSQL  │ │
│  │ │      api :3001  │◄─┼─►│    :3008    │►│    :5432    │ │
│  │ └─────────────────┘  │  └─────────────┘ └─────────────┘ │
│  │                      │  ↓ (1분마다 헬스체크)             │
│  │                      │  External Services               │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 빠른 시작

### 1. 필수 준비사항
- Docker (>= 20.x)
- Docker Compose (>= 2.x)
- 최소 4GB RAM
- 디스크 공간 2GB 이상

### 2. 환경 설정
```bash
# 저장소 클론 (이미 있다면 생략)
git clone <repository-url>
cd status-verify-api

# 환경 변수 설정
cp .env.example .env
# .env 파일을 편집하여 환경에 맞게 수정
```

### 3. 시스템 시작
```bash
# 프로덕션 모드로 시작
./scripts/docker-start.sh

# 또는 개발 모드로 시작
./scripts/docker-start.sh development

# 백그라운드에서 실행
./scripts/docker-start.sh production -d
```

### 4. 접속 정보
시작 후 다음 URL로 접속할 수 있습니다:

- **시스템 상태 대시보드**: http://localhost:3000
- **인시던트 관리**: http://localhost:3006
- **API 서버**: http://localhost:3001
- **Watch Server (모니터링)**: http://localhost:3008
- **데이터베이스**: localhost:5432

## 🛠️ 관리 명령어

### 빌드
```bash
# 모든 이미지 빌드
./scripts/docker-build.sh

# 특정 버전으로 빌드
./scripts/docker-build.sh production v1.0.0
```

### 로그 확인
```bash
# 모든 서비스 로그
./scripts/docker-logs.sh all

# 특정 서비스 로그 실시간 보기
./scripts/docker-logs.sh verify-monitor-api follow
./scripts/docker-logs.sh watch-server follow

# Watch Server 모니터링 로그 확인 (매우 유용)
./scripts/docker-logs.sh watch-server
```

### 시스템 정지
```bash
# 기본 정지
./scripts/docker-stop.sh

# 데이터베이스 포함 완전 삭제
./scripts/docker-stop.sh --volumes

# 이미지까지 완전 삭제
./scripts/docker-stop.sh --volumes --images
```

## 📁 Docker 구성 파일

### 핵심 파일들
```
├── docker-compose.yml          # 메인 프로덕션 구성
├── docker-compose.dev.yml      # 개발 모드 오버라이드
├── .env.example               # 환경 변수 템플릿
├── verify-main/
│   ├── Dockerfile             # Next.js 대시보드
│   └── .dockerignore
├── verify-incidents/
│   ├── Dockerfile             # Next.js 인시던트 앱
│   └── .dockerignore
├── verify-monitor-api/
│   ├── Dockerfile             # Express API 서버
│   ├── .dockerignore
│   └── scripts/
│       └── docker-entrypoint.sh
└── scripts/
    ├── docker-build.sh        # 빌드 스크립트
    ├── docker-start.sh        # 시작 스크립트
    ├── docker-stop.sh         # 정지 스크립트
    └── docker-logs.sh         # 로그 조회 스크립트
```

## 🔧 환경 설정

### 주요 환경 변수
```bash
# 데이터베이스
DB_USER=slamonitor
DB_PASSWORD=secure_password_here
DB_PORT=5432

# JWT 설정
JWT_SECRET=very_long_secure_secret_key_change_in_production
JWT_EXPIRES_IN=24h

# 포트 설정
API_PORT=3001
MAIN_PORT=3000
INCIDENTS_PORT=3006

# 자동 데이터 시딩
SEED_DATABASE=true
```

### 프로덕션 환경 권장사항
- `JWT_SECRET`: 최소 64자 이상의 강력한 키
- `DB_PASSWORD`: 복잡한 데이터베이스 비밀번호
- `CORS_ORIGIN`: 실제 도메인으로 제한
- `NODE_ENV=production` 설정

## 🗄️ 데이터베이스

### 자동 초기화
컨테이너 시작 시 자동으로:
1. PostgreSQL 데이터베이스 생성
2. Prisma 마이그레이션 실행
3. 시드 데이터 추가 (SEED_DATABASE=true일 때)

### 수동 데이터베이스 작업
```bash
# 컨테이너에서 Prisma 명령 실행
docker-compose exec verify-monitor-api npx prisma migrate deploy
docker-compose exec verify-monitor-api npm run db:seed

# 데이터베이스 스튜디오
docker-compose exec verify-monitor-api npx prisma studio
```

## 🔍 헬스 체크

각 서비스는 헬스 체크가 설정되어 있습니다:

```bash
# 서비스 상태 확인
docker-compose ps

# 특정 서비스 헬스 확인
curl http://localhost:3001/api/health  # API 서버
curl http://localhost:3000/api/health  # 메인 앱
curl http://localhost:3006/api/health  # 인시던트 앱
```

## 🚦 네트워킹

### 네트워크 분리
- **Frontend Network**: React 앱들 간 통신
- **Backend Network**: API와 데이터베이스 통신

### 내부 DNS
Docker 컨테이너들은 서비스 이름으로 통신:
- `postgres`: 데이터베이스
- `verify-monitor-api`: API 서버
- `verify-main`: 메인 대시보드
- `verify-incidents`: 인시던트 앱

## 📊 모니터링

### 로그 관리
```bash
# 실시간 로그
docker-compose logs -f

# 서비스별 로그
docker-compose logs verify-monitor-api
docker-compose logs postgres

# 최근 N줄 로그
docker-compose logs --tail=100 verify-main
```

### 리소스 사용량
```bash
# 컨테이너 통계
docker stats

# 디스크 사용량
docker system df
```

## 🔄 업데이트 및 배포

### 코드 업데이트
```bash
# 1. 최신 코드 가져오기
git pull

# 2. 이미지 다시 빌드
./scripts/docker-build.sh

# 3. 서비스 재시작
./scripts/docker-stop.sh
./scripts/docker-start.sh
```

### 무중단 배포 (권장)
```bash
# 새 버전 빌드
./scripts/docker-build.sh production v2.0.0

# 단계별 배포
docker-compose up -d --no-deps verify-monitor-api
docker-compose up -d --no-deps verify-main
docker-compose up -d --no-deps verify-incidents
```

## ⚠️ 문제 해결

### 공통 문제

1. **포트 충돌**
   ```bash
   # 포트 사용 확인
   lsof -i :3000

   # .env에서 포트 변경
   MAIN_PORT=3010
   ```

2. **데이터베이스 연결 실패**
   ```bash
   # 데이터베이스 컨테이너 로그 확인
   ./scripts/docker-logs.sh postgres

   # 연결 테스트
   docker-compose exec postgres psql -U slamonitor -d sla_monitor
   ```

3. **메모리 부족**
   ```bash
   # Docker 메모리 제한 확인
   docker system info | grep Memory

   # 불필요한 이미지 정리
   docker system prune -a
   ```

4. **권한 문제**
   ```bash
   # 스크립트 실행 권한
   chmod +x scripts/*.sh
   chmod +x verify-monitor-api/scripts/docker-entrypoint.sh
   ```

### 개발 환경 문제

1. **핫 리로딩 안됨**
   ```bash
   # 개발 모드로 실행 확인
   ./scripts/docker-start.sh development

   # 볼륨 마운트 확인
   docker-compose -f docker-compose.yml -f docker-compose.dev.yml config
   ```

2. **빌드 캐시 문제**
   ```bash
   # 캐시 무시하고 빌드
   docker-compose build --no-cache
   ```

## 📈 성능 최적화

### 프로덕션 권장사항

1. **이미지 크기 최소화**: 멀티스테이지 빌드 사용 (이미 적용됨)
2. **메모리 제한**: 각 컨테이너에 메모리 제한 설정
3. **CPU 제한**: CPU 사용량 제한으로 안정성 확보
4. **로그 로테이션**: Docker 로그 크기 제한

### docker-compose 성능 설정 예시
```yaml
services:
  verify-monitor-api:
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '1.0'
        reservations:
          memory: 256M
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

## 🔍 Watch Server 모니터링

### 개요
Watch Server는 시스템의 헬스 체크를 담당하는 핵심 컴포넌트입니다.

### 주요 기능
- **1분 간격 자동 헬스체크**: 모든 서비스의 상태를 정기적으로 확인
- **메트릭 수집**: 응답 시간, 가용성, 오류율 데이터 수집
- **자동 인시던트 생성**: 장애 감지 시 자동으로 인시던트 생성
- **실시간 알림**: WebSocket을 통한 실시간 상태 변경 알림

### Watch Server API 엔드포인트
```bash
# 서비스 상태 확인
curl http://localhost:3008/health

# 수동 헬스체크 실행
curl -X POST http://localhost:3008/api/health-check

# 서비스 메트릭 조회
curl http://localhost:3008/api/metrics/id-recognition

# 전체 시스템 메트릭
curl http://localhost:3008/api/metrics

# 모니터링 상태
curl http://localhost:3008/api/status
```

### 모니터링 설정
환경 변수를 통해 Watch Server 동작을 설정할 수 있습니다:

```bash
# 모니터링 간격 (기본: 60초)
MONITORING_INTERVAL=60000

# 헬스체크 타임아웃 (기본: 30초)
HEALTH_CHECK_TIMEOUT=30000

# 재시도 횟수 (기본: 3회)
MAX_RETRY_ATTEMPTS=3

# 모니터링할 외부 서비스
SERVICE_ENDPOINTS=https://api1.example.com/health,https://api2.example.com/health

# 로그 레벨 (debug, info, warn, error)
LOG_LEVEL=info
```

### 모니터링 모드
```bash
# 연속 실행 (기본)
WATCH_MODE=continuous

# 한 번만 실행 (테스트용)
WATCH_MODE=once

# 커스텀 cron 표현식 사용
WATCH_MODE=cron
WATCH_CRON_EXPRESSION="*/2 * * * *"  # 2분마다
```

### 트러블슈팅
```bash
# Watch Server 상태 확인
docker-compose ps watch-server

# 상세 로그 확인
./scripts/docker-logs.sh watch-server follow

# 헬스체크 상태 확인
curl http://localhost:3008/health

# 컨테이너 재시작
docker-compose restart watch-server

# 수동 헬스체크 실행
curl -X POST http://localhost:3008/api/health-check
```

## 🔐 보안 고려사항

1. **환경 변수**: 실제 운영에서는 강력한 비밀번호와 키 사용
2. **네트워크**: 방화벽에서 필요한 포트만 열기
3. **업데이트**: 정기적인 베이스 이미지 업데이트
4. **로그**: 민감한 정보가 로그에 노출되지 않도록 주의
5. **Watch Server**: 모니터링 엔드포인트에 대한 접근 제어 고려

---

## 🆘 지원

문제가 발생하면:
1. 로그 확인: `./scripts/docker-logs.sh all`
2. 서비스 상태 확인: `docker-compose ps`
3. GitHub Issues에 문제 보고

**즐거운 Docker 여행 되세요! 🐳**
# 데이터베이스 구축 가이드

> PostgreSQL 데이터베이스를 Docker로 구축하고 초기 데이터를 설정하는 완전한 가이드

## 📋 목차

1. [데이터베이스 아키텍처](#데이터베이스-아키텍처)
2. [Docker로 PostgreSQL 설치](#docker로-postgresql-설치)
3. [스키마 구조](#스키마-구조)
4. [마이그레이션 및 시딩](#마이그레이션-및-시딩)
5. [백업 및 복구](#백업-및-복구)
6. [성능 최적화](#성능-최적화)

---

## 데이터베이스 아키텍처

### 전체 구조

```
sla_monitor (Database)
├── services              - 모니터링 대상 서비스
├── uptime_records        - 일별 가동률 기록 (90일치)
├── incident              - 인시던트 보고서
├── incident_update       - 인시던트 업데이트 이력
├── users                 - 사용자 계정 (RBAC)
├── api_response_times    - API 응답시간 측정 (Raw Data)
├── api_call_logs         - 일별 API 호출 통계 (Aggregated)
├── watch_server_logs     - 헬스체크 결과 로그
└── system_status         - 전체 시스템 상태
```

### 주요 특징

- **시계열 데이터 최적화**: 인덱스 및 파티셔닝 전략
- **관계형 데이터**: 외래 키로 데이터 무결성 보장
- **Enum 타입**: 상태값 일관성 보장
- **자동 타임스탬프**: `created_at`, `updated_at` 자동 관리

---

## Docker로 PostgreSQL 설치

### 1. Docker Compose 파일

프로젝트 루트의 `docker-compose.yml`:

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
      - ./backups:/backups  # 백업 디렉토리
    ports:
      - "${DB_PORT:-5432}:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-slamonitor} -d sla_monitor"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - sla_network

volumes:
  postgres_data:
    driver: local

networks:
  sla_network:
    driver: bridge
```

### 2. 환경변수 설정

```bash
# 프로젝트 루트에 .env 파일 생성
cat > .env << 'EOF'
# Database Configuration
DB_USER=slamonitor
DB_PASSWORD=강력한_비밀번호_여기_입력
DB_PORT=5432
DB_NAME=sla_monitor

# Connection URL for Prisma
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${DB_PORT}/${DB_NAME}
EOF

# 보안 권한 설정
chmod 600 .env

# 프로덕션용 강력한 비밀번호 생성
openssl rand -base64 32
```

### 3. PostgreSQL 시작

```bash
# Docker Compose로 시작
docker-compose up -d postgres

# 로그 확인
docker-compose logs -f postgres

# 컨테이너 상태 확인
docker-compose ps

# Health check
docker-compose exec postgres pg_isready -U slamonitor -d sla_monitor
```

### 4. 데이터베이스 접속

```bash
# psql 클라이언트로 접속
docker-compose exec postgres psql -U slamonitor -d sla_monitor

# 또는 로컬 psql 사용
psql -h localhost -U slamonitor -d sla_monitor

# 비밀번호 입력 프롬프트가 나타남
```

---

## 스키마 구조

### 1. services (모니터링 서비스)

```sql
CREATE TABLE services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  endpoint_url TEXT NOT NULL,
  status TEXT DEFAULT 'o',
  is_active BOOLEAN DEFAULT true,
  check_interval INTEGER DEFAULT 60000,
  timeout INTEGER DEFAULT 5000,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 초기 데이터
INSERT INTO services (id, name, display_name, description, endpoint_url) VALUES
('id-recognition', 'ID Recognition', 'ID 인식', 'ID 문서 인식 서비스', 'https://idverify-api.argosidentity.com/modules/recognition'),
('face-liveness', 'Face Liveness', '얼굴 라이브니스', '얼굴 라이브니스 검증 서비스', 'https://idverify-api.argosidentity.com/modules/liveness'),
('id-liveness', 'ID Liveness', 'ID 라이브니스', 'ID 문서 라이브니스 검증', 'https://idverify-api.argosidentity.com/modules/document'),
('face-compare', 'Face Compare', '얼굴 비교', '얼굴 매칭 비교 서비스', 'https://idverify-api.argosidentity.com/modules/compare'),
('curp-verifier', 'CURP Verifier', 'CURP 검증', 'CURP 문서 검증 서비스', 'https://idverify-api.argosidentity.com/modules/verify/curp');
```

**필드 설명**:
- `id`: 서비스 고유 식별자 (kebab-case)
- `name`: 서비스 이름 (영문)
- `display_name`: 화면 표시 이름 (한글)
- `endpoint_url`: 헬스체크 URL
- `status`: 현재 상태 ('o', 'po', 'mo', 'nd')
- `is_active`: 모니터링 활성화 여부
- `check_interval`: 체크 간격 (ms, 기본 60초)
- `timeout`: 타임아웃 (ms, 기본 5초)
- `metadata`: 추가 설정 (JSON)

---

### 2. uptime_records (가동률 기록)

```sql
CREATE TYPE uptime_status AS ENUM ('o', 'po', 'mo', 'nd', 'e');

CREATE TABLE uptime_records (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status uptime_status NOT NULL,
  uptime_percentage DECIMAL(5, 2),
  total_checks INTEGER DEFAULT 0,
  successful_checks INTEGER DEFAULT 0,
  failed_checks INTEGER DEFAULT 0,
  avg_response_time INTEGER,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(service_id, date)
);

-- 인덱스
CREATE INDEX idx_uptime_records_service_date ON uptime_records(service_id, date DESC);
CREATE INDEX idx_uptime_records_date ON uptime_records(date DESC);
```

**필드 설명**:
- `service_id`: 서비스 참조
- `date`: 기록 날짜 (하루 단위)
- `status`: 해당 날짜의 전체 상태
  - `'o'`: Operational (정상)
  - `'po'`: Partial Outage (부분 장애)
  - `'mo'`: Major Outage (주요 장애)
  - `'nd'`: No Data (데이터 없음)
  - `'e'`: Empty (비어있음)
- `uptime_percentage`: 가동률 (%)
- `total_checks`: 총 체크 횟수
- `successful_checks`: 성공 횟수
- `failed_checks`: 실패 횟수
- `avg_response_time`: 평균 응답시간 (ms)

---

### 3. incident (인시던트)

```sql
CREATE TYPE incident_status AS ENUM ('investigating', 'identified', 'monitoring', 'resolved');
CREATE TYPE incident_severity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE incident_priority AS ENUM ('P1', 'P2', 'P3', 'P4');

CREATE TABLE incident (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status incident_status DEFAULT 'investigating',
  severity incident_severity DEFAULT 'medium',
  priority incident_priority DEFAULT 'P3',
  affected_services TEXT[] DEFAULT '{}',
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  identified_at TIMESTAMP,
  resolved_at TIMESTAMP,
  duration_minutes INTEGER,
  impact_description TEXT,
  root_cause TEXT,
  resolution_notes TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_incident_status ON incident(status);
CREATE INDEX idx_incident_started_at ON incident(started_at DESC);
CREATE INDEX idx_incident_affected_services ON incident USING GIN(affected_services);
```

**필드 설명**:
- `status`: 인시던트 상태
  - `investigating`: 조사 중
  - `identified`: 원인 파악됨
  - `monitoring`: 모니터링 중
  - `resolved`: 해결됨
- `severity`: 심각도 (low, medium, high, critical)
- `priority`: 우선순위 (P1~P4)
  - P1: Critical (15분 이내 대응)
  - P2: High (1시간 이내)
  - P3: Medium (4시간 이내)
  - P4: Low (24시간 이내)
- `affected_services`: 영향받는 서비스 배열
- `duration_minutes`: 총 지속 시간 (분)

---

### 4. incident_update (인시던트 업데이트)

```sql
CREATE TABLE incident_update (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incident(id) ON DELETE CASCADE,
  status incident_status NOT NULL,
  message TEXT NOT NULL,
  is_customer_visible BOOLEAN DEFAULT true,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_incident_update_incident ON incident_update(incident_id, created_at DESC);
```

**필드 설명**:
- `incident_id`: 인시던트 참조
- `status`: 업데이트 시점의 상태
- `message`: 업데이트 메시지 (마크다운 지원)
- `is_customer_visible`: 고객에게 공개 여부

---

### 5. users (사용자)

```sql
CREATE TYPE user_role AS ENUM ('viewer', 'reporter', 'admin');

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role user_role DEFAULT 'viewer',
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMP,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- 기본 사용자 (비밀번호는 bcrypt 해시)
INSERT INTO users (id, username, email, password_hash, role) VALUES
('admin-1', 'admin', 'admin@argosidentity.com', '$2b$10$...', 'admin'),
('reporter-1', 'reporter', 'reporter@argosidentity.com', '$2b$10$...', 'reporter'),
('viewer-1', 'viewer', 'viewer@argosidentity.com', '$2b$10$...', 'viewer');
```

**역할 권한**:
- `viewer`: 읽기 전용 (대시보드 조회)
- `reporter`: 인시던트 생성 및 업데이트
- `admin`: 모든 권한 (사용자 관리, 서비스 설정)

---

### 6. api_response_times (응답시간)

```sql
CREATE TABLE api_response_times (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  response_time INTEGER NOT NULL,
  status_code INTEGER,
  is_success BOOLEAN DEFAULT true,
  error_message TEXT,
  endpoint TEXT,
  method TEXT DEFAULT 'GET',
  measured_at TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB
);

-- 인덱스 (시계열 데이터 최적화)
CREATE INDEX idx_api_response_service_time ON api_response_times(service_id, measured_at DESC);
CREATE INDEX idx_api_response_measured_at ON api_response_times(measured_at DESC);

-- 파티션 (선택사항 - 대용량 데이터)
-- 월별 파티셔닝 가능
```

**필드 설명**:
- `response_time`: 응답시간 (ms)
- `status_code`: HTTP 상태 코드
- `is_success`: 성공 여부 (200-299)
- `error_message`: 에러 메시지 (실패 시)

---

### 7. api_call_logs (일별 통계)

```sql
CREATE TABLE api_call_logs (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_calls INTEGER DEFAULT 0,
  successful_calls INTEGER DEFAULT 0,
  failed_calls INTEGER DEFAULT 0,
  avg_response_time INTEGER,
  min_response_time INTEGER,
  max_response_time INTEGER,
  p50_response_time INTEGER,
  p95_response_time INTEGER,
  p99_response_time INTEGER,
  total_downtime_minutes INTEGER DEFAULT 0,
  uptime_percentage DECIMAL(5, 2),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(service_id, date)
);

-- 인덱스
CREATE INDEX idx_api_call_logs_service_date ON api_call_logs(service_id, date DESC);
```

**필드 설명**:
- 일별 집계 데이터 (매일 자정 배치 작업으로 생성)
- `p50`, `p95`, `p99`: 응답시간 백분위수
- `uptime_percentage`: 해당 날짜의 가동률

---

### 8. watch_server_logs (헬스체크 로그)

```sql
CREATE TYPE watch_error_type AS ENUM ('timeout', 'connection_error', 'http_error', 'dns_error', 'unknown');

CREATE TABLE watch_server_logs (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  is_healthy BOOLEAN NOT NULL,
  response_time INTEGER,
  status_code INTEGER,
  error_type watch_error_type,
  error_message TEXT,
  metadata JSONB,
  checked_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_watch_logs_service_checked ON watch_server_logs(service_id, checked_at DESC);
CREATE INDEX idx_watch_logs_checked_at ON watch_server_logs(checked_at DESC);
CREATE INDEX idx_watch_logs_unhealthy ON watch_server_logs(service_id, is_healthy, checked_at DESC) WHERE is_healthy = false;
```

**필드 설명**:
- `is_healthy`: 헬스체크 성공 여부
- `response_time`: 응답시간 (ms)
- `error_type`: 에러 유형
  - `timeout`: 타임아웃
  - `connection_error`: 연결 실패
  - `http_error`: HTTP 에러 (4xx, 5xx)
  - `dns_error`: DNS 해석 실패
- `checked_at`: 체크 시각

---

### 9. system_status (시스템 전체 상태)

```sql
CREATE TYPE system_health_status AS ENUM ('operational', 'degraded', 'outage');

CREATE TABLE system_status (
  id TEXT PRIMARY KEY DEFAULT 'current',
  overall_status system_health_status DEFAULT 'operational',
  operational_services INTEGER DEFAULT 0,
  total_services INTEGER DEFAULT 0,
  active_incidents INTEGER DEFAULT 0,
  last_incident_at TIMESTAMP,
  message TEXT,
  metadata JSONB,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 단일 레코드만 유지 (Singleton)
INSERT INTO system_status (id) VALUES ('current')
ON CONFLICT (id) DO NOTHING;
```

**필드 설명**:
- 전체 시스템의 현재 상태를 나타내는 단일 레코드
- `overall_status`:
  - `operational`: 모든 서비스 정상
  - `degraded`: 일부 서비스 장애
  - `outage`: 주요 서비스 장애

---

## 마이그레이션 및 시딩

### 1. Prisma 마이그레이션

```bash
cd verify-monitor-api

# 1. Prisma 클라이언트 생성
npx prisma generate

# 2. 개발 환경 - 마이그레이션 생성 및 적용
npx prisma migrate dev --name init

# 3. 프로덕션 환경 - 마이그레이션 적용
npx prisma migrate deploy

# 4. 마이그레이션 상태 확인
npx prisma migrate status

# 5. 마이그레이션 이력 확인
npx prisma migrate resolve --rolled-back "migration_name"
```

### 2. 초기 데이터 시딩

```bash
# 시딩 스크립트 실행
npm run db:seed

# 또는 직접 실행
ts-node prisma/seeds/index.ts
```

**시딩 내용**:
1. **기본 서비스 5개**:
   - ID Recognition
   - Face Liveness
   - ID Liveness
   - Face Compare
   - CURP Verifier

2. **기본 사용자 3명**:
   - admin@argosidentity.com (Admin)
   - reporter@argosidentity.com (Reporter)
   - viewer@argosidentity.com (Viewer)

3. **과거 90일치 가동률 데이터** (샘플):
   - 각 서비스별 일별 uptime_records
   - 랜덤 상태값 ('o', 'po', 'nd')

4. **시스템 상태 초기화**:
   - system_status 레코드 생성

### 3. 데이터 초기화 (재시딩)

```bash
# 모든 데이터 삭제 후 재시딩
npm run db:reset-data

# 또는
ts-node prisma/reset-data.ts
```

---

## 백업 및 복구

### 1. 수동 백업

```bash
# 전체 데이터베이스 백업
docker-compose exec postgres pg_dump -U slamonitor sla_monitor > backup_$(date +%Y%m%d_%H%M%S).sql

# 압축 백업
docker-compose exec postgres pg_dump -U slamonitor sla_monitor | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz

# 특정 테이블만 백업
docker-compose exec postgres pg_dump -U slamonitor -t services -t users sla_monitor > tables_backup.sql

# 스키마만 백업 (데이터 제외)
docker-compose exec postgres pg_dump -U slamonitor --schema-only sla_monitor > schema_only.sql
```

### 2. 백업 복원

```bash
# 압축 해제 후 복원
gunzip < backup.sql.gz | docker-compose exec -T postgres psql -U slamonitor -d sla_monitor

# 직접 복원
cat backup.sql | docker-compose exec -T postgres psql -U slamonitor -d sla_monitor

# 새 데이터베이스에 복원
docker-compose exec postgres createdb -U postgres sla_monitor_restored
cat backup.sql | docker-compose exec -T postgres psql -U slamonitor -d sla_monitor_restored
```

### 3. 자동 백업 (Cron)

```bash
# /etc/cron.d/postgres-backup
0 2 * * * postgres /usr/local/bin/backup-postgres.sh >> /var/log/postgres-backup.log 2>&1
```

**백업 스크립트** (`backup-postgres.sh`):

```bash
#!/bin/bash
BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)
KEEP_DAYS=30

# 백업 디렉토리 생성
mkdir -p "$BACKUP_DIR"

# 백업 실행
docker-compose exec -T postgres pg_dump -U slamonitor sla_monitor | gzip > "$BACKUP_DIR/sla_monitor_$DATE.sql.gz"

# 오래된 백업 삭제 (30일 이상)
find "$BACKUP_DIR" -name "sla_monitor_*.sql.gz" -mtime +$KEEP_DAYS -delete

echo "Backup completed: $BACKUP_DIR/sla_monitor_$DATE.sql.gz"
```

### 4. 데이터 검증

```bash
# 백업 파일 무결성 검사
gunzip -t backup.sql.gz

# 복원 후 데이터 확인
psql -U slamonitor -d sla_monitor << EOF
SELECT COUNT(*) FROM services;
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM uptime_records;
SELECT COUNT(*) FROM incident;
EOF
```

---

## 성능 최적화

### 1. 인덱스 최적화

```sql
-- 자주 사용하는 쿼리에 대한 인덱스
CREATE INDEX CONCURRENTLY idx_uptime_service_date
ON uptime_records(service_id, date DESC);

CREATE INDEX CONCURRENTLY idx_incident_status_started
ON incident(status, started_at DESC);

CREATE INDEX CONCURRENTLY idx_watch_logs_service_time
ON watch_server_logs(service_id, checked_at DESC)
WHERE is_healthy = false;

-- 복합 인덱스
CREATE INDEX CONCURRENTLY idx_api_response_composite
ON api_response_times(service_id, measured_at DESC, is_success);
```

### 2. 쿼리 성능 분석

```sql
-- EXPLAIN ANALYZE로 쿼리 성능 분석
EXPLAIN ANALYZE
SELECT s.name, ur.date, ur.uptime_percentage
FROM services s
JOIN uptime_records ur ON s.id = ur.service_id
WHERE ur.date >= NOW() - INTERVAL '90 days'
ORDER BY ur.date DESC;

-- 느린 쿼리 로그 활성화 (postgresql.conf)
-- log_min_duration_statement = 1000  # 1초 이상 걸리는 쿼리 로그
```

### 3. 연결 풀링

```bash
# verify-monitor-api/.env
DATABASE_URL=postgresql://slamonitor:password@localhost:5432/sla_monitor?connection_limit=10&pool_timeout=20
DB_MAX_CONNECTIONS=10
```

**Prisma 연결 설정**:

```typescript
// prisma/client.ts
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: ['query', 'error', 'warn'],
});
```

### 4. 데이터 파티셔닝 (대용량 처리)

```sql
-- 월별 파티셔닝 예시 (api_response_times)
CREATE TABLE api_response_times_2025_01 PARTITION OF api_response_times
FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE api_response_times_2025_02 PARTITION OF api_response_times
FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

-- 자동 파티션 생성 함수
CREATE OR REPLACE FUNCTION create_monthly_partition()
RETURNS void AS $$
DECLARE
  start_date DATE := date_trunc('month', NOW());
  end_date DATE := start_date + INTERVAL '1 month';
  partition_name TEXT := 'api_response_times_' || to_char(start_date, 'YYYY_MM');
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF api_response_times
     FOR VALUES FROM (%L) TO (%L)',
    partition_name, start_date, end_date
  );
END;
$$ LANGUAGE plpgsql;
```

### 5. 데이터 정리 (Data Retention)

```sql
-- 90일 이상 된 데이터 삭제 (매일 실행)
DELETE FROM api_response_times
WHERE measured_at < NOW() - INTERVAL '90 days';

DELETE FROM watch_server_logs
WHERE checked_at < NOW() - INTERVAL '90 days';

-- VACUUM으로 공간 회수
VACUUM ANALYZE api_response_times;
VACUUM ANALYZE watch_server_logs;
```

**Cron 작업**:

```bash
# /etc/cron.d/postgres-cleanup
0 3 * * * postgres /usr/local/bin/cleanup-old-data.sh
```

### 6. PostgreSQL 설정 최적화

```bash
# docker-compose.yml에 추가
postgres:
  command:
    - "postgres"
    - "-c"
    - "shared_buffers=256MB"
    - "-c"
    - "effective_cache_size=1GB"
    - "-c"
    - "maintenance_work_mem=64MB"
    - "-c"
    - "checkpoint_completion_target=0.9"
    - "-c"
    - "wal_buffers=16MB"
    - "-c"
    - "default_statistics_target=100"
    - "-c"
    - "random_page_cost=1.1"
    - "-c"
    - "effective_io_concurrency=200"
    - "-c"
    - "work_mem=2MB"
    - "-c"
    - "min_wal_size=1GB"
    - "-c"
    - "max_wal_size=4GB"
    - "-c"
    - "max_connections=100"
```

---

## 모니터링 및 유지보수

### 1. 데이터베이스 크기 확인

```sql
-- 전체 데이터베이스 크기
SELECT pg_size_pretty(pg_database_size('sla_monitor'));

-- 테이블별 크기
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- 인덱스 크기
SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_indexes
JOIN pg_class ON pg_indexes.indexname = pg_class.relname
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;
```

### 2. 연결 확인

```sql
-- 현재 연결 수
SELECT count(*) FROM pg_stat_activity;

-- 연결 상세 정보
SELECT
  pid,
  usename,
  application_name,
  client_addr,
  state,
  query
FROM pg_stat_activity
WHERE datname = 'sla_monitor';
```

### 3. 테이블 통계

```sql
-- 각 테이블의 레코드 수
SELECT
  schemaname,
  tablename,
  n_live_tup AS row_count
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC;

-- Dead tuples 확인 (VACUUM 필요 여부)
SELECT
  schemaname,
  tablename,
  n_dead_tup,
  last_vacuum,
  last_autovacuum
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_dead_tup DESC;
```

---

## 트러블슈팅

### 문제 1: 마이그레이션 실패

```bash
# 마이그레이션 상태 확인
npx prisma migrate status

# 특정 마이그레이션을 적용된 것으로 표시 (스킵)
npx prisma migrate resolve --applied "20250110_init"

# 마이그레이션 롤백 (개발 환경에서만)
npx prisma migrate reset
```

### 문제 2: 연결 거부

```bash
# PostgreSQL이 실행 중인지 확인
docker-compose ps postgres

# 로그 확인
docker-compose logs postgres

# 네트워크 확인
telnet localhost 5432

# 방화벽 확인
sudo ufw status
```

### 문제 3: 디스크 공간 부족

```bash
# 디스크 사용량 확인
df -h

# Docker 볼륨 정리
docker volume prune

# PostgreSQL 데이터 정리
docker-compose exec postgres psql -U slamonitor -d sla_monitor << EOF
VACUUM FULL;
REINDEX DATABASE sla_monitor;
EOF
```

---

## Prisma Studio

Prisma Studio는 데이터베이스를 GUI로 관리할 수 있는 도구입니다:

```bash
cd verify-monitor-api

# Prisma Studio 실행
npx prisma studio

# 브라우저에서 http://localhost:5555 접속
```

**기능**:
- 테이블 데이터 조회 및 편집
- 관계형 데이터 네비게이션
- 필터링 및 정렬
- 레코드 추가/수정/삭제

---

## 참고 자료

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [DEPLOYMENT.md](./DEPLOYMENT.md) - 전체 배포 가이드

---

**Last Updated**: 2025-11-10
**Version**: 1.0.0

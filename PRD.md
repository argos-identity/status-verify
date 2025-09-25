# SLA Monitor System - Product Requirements Document (PRD)

**버전**: 1.0  
**작성일**: 2025-08-28  
**프로젝트**: SLA 모니터링 시스템  

---

## 1. 프로젝트 개요

### 1.1 제품명
**SLA Monitor System** - 실시간 서비스 레벨 모니터링 시스템

### 1.2 목적 및 배경
- **목적**: 다중 서비스 환경에서 실시간 SLA 모니터링 및 업타임 추적 시스템 구축
- **배경**: Verify 서비스들 (ID Recognition, Face Liveness, ID Liveness, Face Compare, Curp Verifier)의 안정성 모니터링 필요
- **문제 정의**: 현재 하드코딩된 더미 데이터로 인한 실시간 모니터링 불가

### 1.3 비즈니스 목표
- 서비스 가용성 99.9% 이상 달성
- 실시간 상태 모니터링을 통한 신속한 장애 대응
- 투명한 SLA 정보 제공으로 고객 신뢰 향상
- 데이터 기반 인프라 개선 의사결정 지원

---

## 2. 시스템 아키텍처

### 2.1 전체 아키텍처
```
┌─────────────────────┐    ┌──────────────┐    ┌─────────┐    ┌──────────────┐
│    Web Pages        │    │  Backend     │    │   DB    │    │   Watch      │
│                     │◄──►│    API       │◄──►│         │◄───│   Server     │
│ • Verify-Main       │    │              │    │         │    │              │
│ • Verify-Incidents  │    │              │    │         │    │ (1분마다     │
│                     │    │              │    │         │    │ 상태 체크)   │
└─────────────────────┘    └──────────────┘    └─────────┘    │              │
                                                              │      ▼       │
                                                              │  Verify      │
                                                              │  Servers     │
                                                              └──────────────┘
```

### 2.2 컴포넌트 구성
1. **Web Pages** (포트 3003, 3005)
   - `verify-main`: 시스템 상태 페이지, 과거 인시던트 표시, 업타임 추적
   - `verify-incidents`: Incident 관리 애플리케이션, 운영팀 전용 관리 도구

2. **Backend API**
   - REST API 서버
   - WebSocket 실시간 통신
   - PostgreSQL 데이터 관리

3. **Watch Server** (Phase 5)
   - 스케줄링 기반 모니터링 (1분 간격)
   - 서비스 헬스체크
   - 메트릭 데이터 수집

### 2.3 데이터 플로우
1. Watch Server → Verify Servers (헬스체크)
2. Watch Server → DB (메트릭 저장)
3. Backend API ← DB (데이터 조회)
4. Web Pages ← Backend API (실시간 데이터 제공)

---

## 3. 기능 요구사항

### 3.1 시스템 상태 모니터링 (verify-main)
- **전체 시스템 상태 표시**
  - "All Systems Operational" 상태 배너
  - 각 서비스별 실시간 상태 (Operational/Degraded/Outage)
  
- **서비스별 업타임 그래프**
  - 90일간 업타임 히스토리 막대그래프
  - 업타임 퍼센티지 표시
  - 상태 색상 구분 (정상: 녹색, 경고: 주황, 장애: 빨강)

- **과거 인시던트 관리**
  - 일자별 인시던트 목록
  - 인시던트 상태 업데이트 타임라인
  - 데이터 없을 시 "데이터를 준비 중입니다." 메시지

### 3.2 실시간 데이터 연동
- **WebSocket 연결**
  - 상태 변경 시 실시간 업데이트
  - 새로운 인시던트 발생 시 즉시 반영
  - 업타임 데이터 실시간 갱신

### 3.3 Incident 관리 시스템 (verify-incidents)
- **Incident 생성 워크플로우**
  - 제목, 상세 설명, 심각도(low/medium/high/critical) 입력
  - 우선순위(P1/P2/P3) 설정 및 자동 분류
  - 영향받는 서비스 다중 선택 (ID Recognition, Face Liveness 등)
  - 발생 기준 및 감지 방법 상세 기록
  - 보고자 정보 및 초기 대응 상황 입력

- **상태 관리 시스템**
  - investigating → identified → monitoring → resolved 4단계 플로우
  - 각 상태 변경 시 의무적 업데이트 메모 추가
  - 해결 시간 자동 계산 및 SLA 메트릭 연동
  - 상태별 색상 코딩 및 시각적 구분

- **실시간 협업 기능**
  - 다중 사용자 동시 편집 지원
  - 실시간 상태 변경 알림 시스템
  - 댓글 및 업데이트 히스토리 관리
  - verify-main Past Incidents 섹션 즉시 반영

- **사용자 인터페이스 요구사항**
  - 모바일 반응형 디자인 (긴급 상황 대응)
  - 직관적인 폼 디자인 및 빠른 입력 지원
  - 키보드 단축키 지원 (Ctrl+S 저장, Esc 취소)
  - 자동 저장 기능 (30초마다 임시 저장)
  - 접근성 준수 (WCAG 2.1 AA 레벨)

---

## 4. 기술 요구사항

### 4.1 Frontend 기술 스택
- **프레임워크**: Next.js 15.3.5
- **UI 라이브러리**: React 19, TypeScript
- **스타일링**: TailwindCSS
- **컴포넌트**: Radix UI, Lucide React
- **실시간 통신**: Socket.IO Client
- **폼 관리**: React Hook Form + Zod 검증 (verify-incidents)
- **상태 관리**: Context API 또는 Zustand (verify-incidents)
- **실시간 협업**: Socket.IO Client multi-user editing (verify-incidents)

### 4.2 Backend 기술 스택
- **런타임**: Node.js 18+
- **프레임워크**: Express.js
- **언어**: TypeScript
- **데이터베이스**: PostgreSQL 14+
- **ORM**: Prisma
- **실시간 통신**: Socket.IO
- **스케줄링**: node-cron (Watch Server용)

### 4.3 인프라 요구사항
- **개발 환경**: Docker Compose
- **데이터베이스**: PostgreSQL 컨테이너
- **포트 구성**:
  - verify-main: 3003
  - verify-incidents: 3005
  - Backend API: 3001
  - Watch Server: 3008

---

## 5. API 명세

### 5.1 REST API 엔드포인트

#### 시스템 상태
```
GET /api/system-status
Response: {
  overallStatus: "operational" | "degraded" | "outage",
  lastUpdated: "2025-08-28T10:30:00Z",
  services: [
    {
      id: "id-recognition",
      name: "ID Recognition",
      status: "operational",
      uptime: "99.13",
      uptimeData: [...] // 90일 상태 배열
    }
  ]
}
```

#### 서비스 목록
```
GET /api/services
Response: {
  services: [
    { id: "all-systems", name: "All Systems" },
    { id: "id-recognition", name: "ID Recognition" },
    ...
  ]
}
```

#### 업타임 데이터
```
GET /api/uptime/:serviceId
Query: ?months=3&startDate=2025-06-01
Response: {
  service: {
    id: "id-recognition",
    name: "ID Recognition"
  },
  months: [
    {
      name: "August 2025",
      uptime: "99.13",
      days: ["o", "o", "po", ...] // 일별 상태 배열
    }
  ]
}
```

#### 인시던트
```
GET /api/incidents
Response: {
  incidents: [
    {
      id: "inc-2025-001",
      title: "서비스 응답 지연",
      status: "investigating",
      createdAt: "2025-08-28T09:00:00Z",
      updates: [...]
    }
  ]
}

GET /api/incidents/past
Query: ?days=30&page=1&limit=10
Response: {
  days: [
    {
      date: "2025-08-27",
      incidents: [...] | null,
      noIncidentMessage?: "특별한 문제가 없습니다."
    }
  ],
  pagination: { ... }
}
```

#### Incident 관리 (CRUD)
```
POST /api/incidents
Request: {
  title: "서비스 응답 지연",
  description: "ID Recognition 서비스에서 응답 시간이 평균 15초 이상 지연되고 있습니다.",
  severity: "high",
  priority: "P2", 
  affected_services: ["id-recognition", "face-liveness"],
  reporter: "모니터링 시스템",
  detection_criteria: "연속 3회 7초 초과 응답시간"
}
Response: {
  incident: {
    id: "inc-2025-001",
    title: "서비스 응답 지연",
    status: "investigating",
    created_at: "2025-08-28T10:30:00Z",
    ...
  }
}

PUT /api/incidents/:id
Request: {
  title?: string,
  description?: string,
  status?: "investigating" | "identified" | "monitoring" | "resolved",
  severity?: "low" | "medium" | "high" | "critical"
}
Response: {
  incident: Incident
}

POST /api/incidents/:id/updates
Request: {
  status: "identified",
  description: "원인을 데이터베이스 연결 풀 부족으로 식별했습니다. 연결 풀 크기를 50에서 100으로 증가시켰습니다."
}
Response: {
  update: {
    id: "upd-2025-001",
    incident_id: "inc-2025-001", 
    status: "identified",
    description: "...",
    created_at: "2025-08-28T11:15:00Z"
  }
}

DELETE /api/incidents/:id
Response: {
  success: true,
  message: "Incident가 성공적으로 삭제되었습니다."
}
```

#### SLA 리포트 데이터
```
GET /api/sla/response-times/:serviceId
Query: ?period=monthly&year=2025&month=8
Response: {
  service: { id: string, name: string },
  period: "2025-08",
  avgResponseTime: 1250, // ms
  targetThreshold: 7000, // 7초
  metrics: {
    totalRequests: 45678,
    avgResponseTime: 1250,
    slowRequests300: { count: 234, percentage: 0.51 }, // 300% 이상
    slowRequests500: { count: 89, percentage: 0.19 },  // 500% 이상
    timeoutRequests: { count: 12, percentage: 0.03 }   // 7초 초과
  }
}

GET /api/sla/availability/:serviceId
Query: ?period=monthly&year=2025&month=8
Response: {
  service: { id: string, name: string },
  period: "2025-08",
  metrics: {
    totalChecks: 44640, // 1분마다 31일 = 31 * 24 * 60
    successfulChecks: 44521,
    failedChecks: 119,
    uptimePercentage: 99.73,
    totalDowntime: "3h 58m", // 절대 시간
    downtimeMinutes: 238
  }
}

GET /api/sla/usage/:serviceId
Query: ?period=monthly&year=2025&month=8
Response: {
  service: { id: string, name: string },
  period: "2025-08",
  metrics: {
    totalCalls: 125467,
    successfulCalls: 123891, // 200 OK
    errorCalls: 1576,        // non-200
    errorRate: 1.26,         // percentage
    dailyStats: [
      { date: "2025-08-01", total: 4123, success: 4098, errors: 25 },
      // ... 31 days
    ]
  }
}

GET /api/sla/incidents/stats
Query: ?period=monthly&year=2025&month=8
Response: {
  period: "2025-08",
  summary: {
    totalIncidents: 7,
    p1Count: 1,
    p2Count: 3,
    p3Count: 3,
    avgResolutionTime: "2h 15m"
  },
  incidents: [
    {
      id: "inc-2025-001",
      priority: "P1",
      title: "서비스 완전 중단",
      reporter: "모니터링 시스템",
      detectionCriteria: "연속 3회 타임아웃",
      createdAt: "2025-08-15T14:30:00Z",
      resolvedAt: "2025-08-15T18:45:00Z",
      resolutionTime: "4h 15m"
    }
  ]
}
```

### 5.2 WebSocket 이벤트
```typescript
// 클라이언트 → 서버
"join-room": { room: "system-status" | "uptime" | "incidents" }
"leave-room": { room: string }

// 서버 → 클라이언트
"status-update": { serviceId: string, status: string, timestamp: string }
"incident-created": { incident: Incident }
"incident-updated": { incidentId: string, update: IncidentUpdate }
"uptime-updated": { serviceId: string, date: string, status: string }
"sla-metrics-updated": { serviceId: string, metrics: SLAMetrics }

// verify-incidents 전용 협업 이벤트
"incident-editing": { 
  incidentId: string, 
  userId: string, 
  userName: string,
  isEditing: boolean,
  field?: string // 편집 중인 필드명
}
"incident-comment": { 
  incidentId: string, 
  comment: {
    id: string,
    userId: string,
    userName: string,
    message: string,
    timestamp: string
  }
}
"user-joined": { 
  room: string, 
  user: { 
    id: string, 
    name: string, 
    role: "viewer" | "reporter" | "admin" 
  } 
}
"user-left": { room: string, userId: string, userName: string }
"auto-save": { 
  incidentId: string, 
  data: Partial<Incident>, 
  timestamp: string 
}
```

---

## 6. 사용자 관리 및 권한 시스템

### 6.1 사용자 역할 정의

**Viewer (조회자)**
- **목적**: 시스템 상태 및 인시던트 정보 조회만 가능
- **접근 권한**: verify-main 전체 기능
- **제한 사항**: 데이터 생성, 수정, 삭제 불가

**Reporter (보고자)**
- **목적**: 인시던트 보고 및 상태 업데이트 담당
- **접근 권한**: Viewer 권한 + verify-incidents 생성/수정 기능
- **제한 사항**: 인시던트 삭제 불가, 시스템 설정 변경 불가

**Admin (관리자)**
- **목적**: 시스템 전체 관리 및 사용자 관리 담당  
- **접근 권한**: 모든 기능 + 사용자 관리 + 시스템 설정
- **특권**: 인시던트 삭제, 사용자 역할 변경, 시스템 구성 변경

### 6.2 접근 권한 매트릭스

| 기능 | Viewer | Reporter | Admin |
|------|--------|----------|-------|
| **시스템 상태 조회** (verify-main) | ✅ | ✅ | ✅ |
| **인시던트 목록 조회** | ✅ | ✅ | ✅ |
| **인시던트 생성** | ❌ | ✅ | ✅ |
| **인시던트 상태 업데이트** | ❌ | ✅ | ✅ |
| **인시던트 수정** | ❌ | ✅ | ✅ |
| **인시던트 삭제** | ❌ | ❌ | ✅ |
| **사용자 관리** | ❌ | ❌ | ✅ |
| **시스템 설정** | ❌ | ❌ | ✅ |

### 6.3 인증 및 인가 시스템

**인증 방식**
- **개발 단계**: 단순 사용자명/비밀번호 로그인
- **향후 확장**: SSO (Single Sign-On) 연동 고려

**세션 관리**
- **JWT 토큰 기반**: 24시간 유효기간
- **리프레시 토큰**: 7일 유효기간
- **자동 로그아웃**: 비활성 상태 2시간 후

**역할 기반 접근 제어 (RBAC)**
```typescript
interface User {
  id: string;
  username: string;
  email: string;
  role: "viewer" | "reporter" | "admin";
  created_at: string;
  last_login_at?: string;
  is_active: boolean;
}

interface Permission {
  resource: string;  // "incidents", "users", "system"
  action: string;    // "read", "create", "update", "delete"
}
```

### 6.4 보안 요구사항

**데이터 보호**
- **민감 정보 암호화**: 사용자 비밀번호 bcrypt 해싱
- **API 인증 정책**:
  - **읽기 전용 API (GET)**: JWT 토큰 없이 공개 접근 허용
  - **쓰기 API (POST/PUT/DELETE)**: JWT 토큰 필수
  - **예외**: 사용자 정보 등 민감한 GET 요청은 인증 필요
- **HTTPS 강제**: 모든 통신 TLS 1.3 암호화

**감사 로그**
- **사용자 활동 추적**: 로그인, 인시던트 생성/수정/삭제
- **권한 변경 로그**: 관리자의 사용자 권한 변경 이력
- **시스템 접근 로그**: 실패한 로그인 시도, 비정상 접근

---

## 7. 데이터베이스 설계

### 7.1 테이블 구조

#### services
```sql
CREATE TABLE services (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  endpoint_url VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### uptime_records
```sql
CREATE TABLE uptime_records (
  id SERIAL PRIMARY KEY,
  service_id VARCHAR(50) REFERENCES services(id),
  date DATE NOT NULL,
  status VARCHAR(10) NOT NULL, -- 'o', 'po', 'mo', 'nd', 'e'
  response_time INTEGER, -- ms
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(service_id, date)
);
```

#### api_response_times
```sql
CREATE TABLE api_response_times (
  id SERIAL PRIMARY KEY,
  service_id VARCHAR(50) REFERENCES services(id),
  response_time INTEGER NOT NULL, -- ms
  status_code INTEGER NOT NULL,
  endpoint VARCHAR(255),
  method VARCHAR(10) DEFAULT 'GET',
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX(service_id, timestamp),
  INDEX(timestamp, status_code)
);
```

#### api_call_logs
```sql
CREATE TABLE api_call_logs (
  id SERIAL PRIMARY KEY,
  service_id VARCHAR(50) REFERENCES services(id),
  date DATE NOT NULL,
  total_calls INTEGER DEFAULT 0,
  success_calls INTEGER DEFAULT 0, -- 200 OK responses
  error_calls INTEGER DEFAULT 0,   -- non-200 responses
  avg_response_time INTEGER,       -- ms
  max_response_time INTEGER,       -- ms
  min_response_time INTEGER,       -- ms
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(service_id, date)
);
```

#### watch_server_logs
```sql
CREATE TABLE watch_server_logs (
  id SERIAL PRIMARY KEY,
  service_id VARCHAR(50) REFERENCES services(id),
  check_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status_code INTEGER,
  response_time INTEGER, -- ms
  is_success BOOLEAN NOT NULL,
  error_message TEXT,
  error_type VARCHAR(50), -- 'timeout', 'connection_error', 'http_error', etc.
  
  INDEX(service_id, check_time),
  INDEX(check_time, is_success)
);
```

#### incidents
```sql
CREATE TABLE incidents (
  id VARCHAR(50) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL, -- 'investigating', 'identified', 'monitoring', 'resolved'
  severity VARCHAR(10) NOT NULL, -- 'low', 'medium', 'high', 'critical'
  priority VARCHAR(5) NOT NULL, -- 'P1', 'P2', 'P3'
  reporter VARCHAR(100), -- 보고 주체
  detection_criteria TEXT, -- 발생 기준
  affected_services TEXT[], -- JSON array of service IDs
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP
);
```

#### incident_updates
```sql
CREATE TABLE incident_updates (
  id SERIAL PRIMARY KEY,
  incident_id VARCHAR(50) REFERENCES incidents(id),
  status VARCHAR(20) NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### system_status
```sql
CREATE TABLE system_status (
  id SERIAL PRIMARY KEY,
  overall_status VARCHAR(20) NOT NULL, -- 'operational', 'degraded', 'outage'
  message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 7.2 인덱스 전략
```sql
-- 성능 최적화를 위한 인덱스
CREATE INDEX idx_uptime_service_date ON uptime_records(service_id, date DESC);
CREATE INDEX idx_incidents_status ON incidents(status, created_at DESC);
CREATE INDEX idx_incidents_priority ON incidents(priority, created_at DESC);
CREATE INDEX idx_incident_updates_incident ON incident_updates(incident_id, created_at DESC);
CREATE INDEX idx_system_status_created ON system_status(created_at DESC);

-- SLA 리포트용 새로운 인덱스
CREATE INDEX idx_api_response_times_service_time ON api_response_times(service_id, timestamp DESC);
CREATE INDEX idx_api_response_times_status ON api_response_times(status_code, timestamp DESC);
CREATE INDEX idx_api_call_logs_service_date ON api_call_logs(service_id, date DESC);
CREATE INDEX idx_watch_server_logs_service_time ON watch_server_logs(service_id, check_time DESC);
CREATE INDEX idx_watch_server_logs_success ON watch_server_logs(is_success, check_time DESC);
```

---

## 8. 구현 단계별 계획

### Phase 1: Backend API 서버 구성 (1주)
- [x] 프로젝트 구조 설정
- [ ] Express.js + TypeScript 설정
- [ ] PostgreSQL + Prisma 설정
- [ ] 기본 API 라우트 구성
- [ ] Socket.IO 설정

### Phase 2: 데이터베이스 설계 (3일)
- [ ] Prisma 스키마 작성
- [ ] 마이그레이션 생성
- [ ] 시드 데이터 작성 (현재 하드코딩 데이터 기반)
- [ ] 테스트 데이터 삽입

### Phase 2.5: verify-incidents 애플리케이션 개발 (1주)
- [ ] 프로젝트 구조 생성 (verify-main과 동일한 구조)
- [ ] 기본 라우팅 및 레이아웃 설정 (/, /create, /[id], /history)
- [ ] IncidentForm 컴포넌트 구현 (React Hook Form + Zod 검증)
- [ ] IncidentList 컴포넌트 구현 (목록 표시 및 상태별 필터링)
- [ ] IncidentTimeline 컴포넌트 구현 (업데이트 히스토리)
- [ ] 실시간 협업 기능 구현 (다중 사용자 편집)
- [ ] 자동 저장 기능 구현 (30초마다 임시 저장)
- [ ] 모바일 반응형 디자인 구현
- [ ] 키보드 단축키 지원 (Ctrl+S, Esc)
- [ ] 접근성 준수 (WCAG 2.1 AA 레벨)

### Phase 3: API 엔드포인트 구현 (1주)
- [ ] 시스템 상태 API 구현
- [ ] 서비스 목록 API 구현
- [ ] 업타임 데이터 API 구현
- [ ] 인시던트 관리 API 구현
- [ ] WebSocket 이벤트 핸들러 구현

### Phase 4: 프론트엔드 API 연동 (1주)
- [ ] verify-main 컴포넌트 API 연동
  - [ ] SystemStatus 컴포넌트 수정
  - [ ] PastIncidents 컴포넌트 수정
- [ ] Socket.IO 클라이언트 구현
- [ ] 로딩 상태 및 에러 처리

### Phase 4.5: Incidents 시스템 통합 및 실시간 연동 (3일)
- [ ] verify-incidents와 Backend API 연동
  - [ ] Incident CRUD API 클라이언트 구현
  - [ ] 폼 데이터 검증 및 제출 처리
  - [ ] 에러 처리 및 사용자 피드백
- [ ] verify-main Past Incidents 섹션 활성화
  - [ ] 하드코딩된 빈 배열을 실제 API 데이터로 교체
  - [ ] 실시간 Incident 업데이트 반영
- [ ] 멀티유저 실시간 협업 기능
  - [ ] WebSocket 기반 동시 편집 지원
  - [ ] 사용자 편집 상태 표시 (누가 어떤 필드를 편집 중인지)
  - [ ] 충돌 방지 및 자동 동기화
- [ ] 알림 시스템 구현
  - [ ] 새 Incident 생성 시 관련 사용자에게 알림
  - [ ] 상태 변경 시 실시간 알림
  - [ ] 토스트 알림 및 브라우저 푸시 알림
- [ ] 권한 시스템 구현
  - [ ] 역할 기반 UI 제어 (Viewer/Reporter/Admin)
  - [ ] API 호출 시 JWT 토큰 인증
  - [ ] 접근 권한 검증 및 에러 처리

### Phase 5: Watch Server 구현 (향후 별도)
- [ ] 별도 Watch Server 프로젝트 생성
- [ ] 1분 간격 스케줄러 구현
- [ ] 서비스 헬스체크 로직
- [ ] 메트릭 데이터 수집 및 저장
- [ ] Backend API 상태 알림 연동

### Phase 6: SLA 리포트 시스템 구현
- [ ] **응답 시간 메타데이터 수집**
  - [ ] API 호출별 응답 시간 로깅 시스템
  - [ ] api_response_times 테이블 데이터 수집
  - [ ] 응답 시간 분석 로직 (평균, 300%/500% 지연, 7초 초과)
  
- [ ] **워치서버 확장**
  - [ ] 비정상 응답 전용 로깅 (watch_server_logs)
  - [ ] 정상/비정상 응답 분류 알고리즘
  - [ ] 다운타임 절대 시간 계산
  
- [ ] **사용량 통계 시스템**
  - [ ] api_call_logs 테이블 일일 집계
  - [ ] 호출/성공/오류 통계 계산
  - [ ] 일별/월별 사용량 트렌드 분석
  
- [ ] **장애 관리 고도화**
  - [ ] P1/P2/P3 우선순위 분류 시스템
  - [ ] 보고 주체 및 발생 기준 추적
  - [ ] 장애 해결 시간 계산 및 통계
  
- [ ] **SLA 리포트 API 구현**
  - [ ] `/api/sla/response-times/:serviceId` 엔드포인트
  - [ ] `/api/sla/availability/:serviceId` 엔드포인트
  - [ ] `/api/sla/usage/:serviceId` 엔드포인트
  - [ ] `/api/sla/incidents/stats` 엔드포인트

---

## 9. 성공 지표 및 KPI

### 9.1 시스템 성능 목표
- **API 응답 시간**: 평균 < 200ms
- **WebSocket 연결 안정성**: > 99.9%
- **데이터 정확성**: 100%
- **시스템 가용성**: > 99.9%

### 9.2 사용자 경험 목표
- **페이지 로딩 시간**: < 3초
- **실시간 데이터 업데이트 지연**: < 5초
- **모바일 반응형 지원**: 100%
- **접근성 준수**: WCAG 2.1 AA 레벨

### 9.3 Incident 관리 시스템 목표
- **Incident 입력 시간**: 긴급 상황에서 기본 정보 입력 < 2분
- **상태 업데이트 주기**: 진행 중인 Incident는 30분마다 상태 업데이트
- **해결 시간 추적 정확도**: 100% (자동 계산 시스템)
- **협업 효율성**: 동시 편집 충돌 < 1%
- **알림 전달 시간**: Incident 생성/업데이트 후 실시간 알림 < 5초
- **자동 저장 성공률**: > 99.9% (30초마다 임시 저장)
- **Past Incidents 동기화**: verify-incidents 변경사항이 verify-main에 < 3초 내 반영

### 9.4 비즈니스 목표
- **모니터링 커버리지**: 100% (모든 서비스)
- **장애 감지 시간**: < 1분
- **데이터 보관 기간**: 1년
- **확장성**: 50개 서비스까지 지원

---

## 10. 리스크 및 제약사항

### 10.1 기술적 리스크
- **PostgreSQL 성능**: 대량 시계열 데이터 처리
- **WebSocket 연결**: 네트워크 불안정 시 재연결
- **데이터 동기화**: 여러 클라이언트 간 상태 동기화

### 10.2 운영 리스크
- **데이터 백업**: 정기 백업 및 복구 전략 필요
- **모니터링 서버 장애**: Watch Server 이중화 고려
- **스케일링**: 서비스 증가 시 성능 영향

### 10.3 제약사항
- **개발 리소스**: 1명 개발자
- **개발 기간**: Phase 1-4까지 3주
- **인프라 비용**: 최소 비용으로 구성

---

## 11. SLA 리포트 구성요소

### 11.1 현재 구성된 기본 정보 (verify-main에서 제공)
- ✅ **가용성 (%)**: verify-main에서 업타임 퍼센티지로 표시
- ✅ **일별/월별 상태 표시**: verify-main에서 상태 그리드로 표시
- ✅ **서비스별 현재 상태**: verify-main에서 Operational/Degraded/Outage 표시
- ✅ **기본 인시던트 관리**: verify-main에서 Past Incidents 섹션 (현재는 준비 중 상태)

### 11.2 추가 필요한 SLA 리포트 구성요소

#### 11.2.1 응답 시간 메트릭
1. **API별 월간 평균 응답 시간**
   - 각 서비스별 월간 평균 응답 시간 계산
   - 목표: 7초 이내 유지
   
2. **월간 평균 응답 대비 500% 이상 지연된 API 응답 비율**
   - 극심한 지연 응답 비율 추적
   - 성능 이슈 조기 감지 지표
   
3. **월간 평균 응답 대비 300% 이상 지연된 API 응답 비율**
   - 중간 수준 지연 응답 비율 추적
   - 성능 저하 경향 파악
   
4. **목표 (7초) 초과 API 응답 비율**
   - SLA 목표 대비 실제 성능 측정
   - 서비스 품질 보증 지표

**필요한 데이터**: 각 API 호출별 응답 시간 메타데이터 수집

#### 11.2.2 상세 가용성 데이터
1. **총 다운타임 (시간 단위)**
   - 현재는 퍼센티지만 표시, 절대 시간 추가 필요
   - 월별/분기별 다운타임 누적 계산
   
2. **총 워치 서버 호출 수**
   - 모니터링 시스템 자체의 안정성 확인
   - 데이터 수집 완성도 측정
   
3. **정상 응답 vs 비정상 응답 수**
   - 성공/실패 응답 비율 상세 분석
   - 서비스 안정성 정량적 측정

**구현 방법**: 워치서버가 1분마다 API 호출하여 비정상 응답만 별도 기록

#### 11.2.3 사용량 통계
1. **API별 월간 호출 count**
   - 서비스 이용 패턴 분석
   - 용량 계획 기초 데이터
   
2. **API별 월간 200 OK 응답 count**
   - 성공적인 서비스 제공 횟수
   - 실제 서비스 품질 측정
   
3. **API별 월간 오류 count**
   - 오류 유형별 분류 및 통계
   - 서비스 개선 우선순위 결정

#### 11.2.4 장애 관리 시스템 확장
현재 verify-main의 Past Incidents는 "데이터를 준비 중입니다." 상태

**추가 필요 정보**:
1. **P1 발생 건수** (Critical - 서비스 완전 중단)
   - 발생 일시, 발생 기준, 보고 주체, 해결 시간
   
2. **P2 발생 건수** (High - 주요 기능 장애)
   - 발생 일시, 발생 기준, 보고 주체, 해결 시간
   
3. **P3 발생 건수** (Medium - 부분적 성능 저하)
   - 발생 일시, 발생 기준, 보고 주체, 해결 시간

**장애 우선순위 기준**:
- **P1**: 전체 서비스 중단, 데이터 손실 위험
- **P2**: 핵심 기능 장애, 성능 심각 저하 (응답시간 >15초)
- **P3**: 부분 기능 장애, 성능 저하 (응답시간 7-15초)

### 11.3 구현 우선순위
1. **Phase 1**: 응답 시간 메타데이터 수집 시스템
2. **Phase 2**: 워치서버 확장 (비정상 응답 전용 로깅)
3. **Phase 3**: 사용량 통계 수집 및 분석
4. **Phase 4**: 장애 관리 시스템 고도화

---

## 12. 추후 개선사항

### 12.1 향상된 기능
- **알림 시스템**: 이메일, Slack 통합
- **대시보드**: 실시간 메트릭 대시보드
- **분석**: 트렌드 분석 및 예측
- **API**: 외부 시스템 연동 API

### 12.2 기술 개선
- **캐싱**: Redis 도입
- **로그 관리**: 중앙집중식 로깅
- **CI/CD**: 자동화된 배포 파이프라인
- **모니터링**: APM 도구 도입

---

**문서 버전**: v1.0  
**최종 업데이트**: 2025-08-28  
**승인자**: [승인자명]  
**다음 리뷰 예정일**: 2025-09-15  
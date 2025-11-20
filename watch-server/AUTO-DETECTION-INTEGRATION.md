# Auto-Incident Detection Integration

## 개요
Watch Server가 헬스체크를 수행할 때마다 자동으로 verify-monitor-api의 자동 인시던트 감지 시스템을 트리거합니다.

## 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│                   Watch Server                          │
│                                                         │
│  1분마다 실행:                                            │
│  ┌──────────────────────────────────────────┐          │
│  │  performHealthChecks()                   │          │
│  │    ├─ Service 1 헬스체크                 │          │
│  │    ├─ Service 2 헬스체크                 │          │
│  │    └─ Service 5 헬스체크                 │          │
│  │                                          │          │
│  │  DB 저장 (watch_server_logs)             │          │
│  │                                          │          │
│  │  Auto-Detection 트리거 (비동기)           │──────┐  │
│  └──────────────────────────────────────────┘      │  │
└─────────────────────────────────────────────────────│───┘
                                                      │
                                                      │ HTTP POST
                                                      │
                                                      ▼
┌──────────────────────────────────────────────────────────┐
│            verify-monitor-api (Port 3001)                │
│                                                          │
│  POST /api/auto-detection/batch-analyze                 │
│    ├─ 최근 헬스체크 데이터 수집 (10회)                    │
│    ├─ 최근 1시간 오류율 계산                              │
│    ├─ 연속 실패 횟수 계산                                 │
│    ├─ 평균 응답 시간 계산                                 │
│    │                                                    │
│    └─ 8개 감지 규칙 평가:                                │
│        ├─ P1: 5회 연속 실패                             │
│        ├─ P2: 3회 연속 실패                             │
│        ├─ P2: 오류율 >50%                               │
│        ├─ P2: 응답 시간 >30초                           │
│        ├─ P3: 평균 응답 시간 >10초                      │
│        └─ ... (총 8개 규칙)                             │
│                                                          │
│  조건 만족 시 → 자동 인시던트 생성                         │
│  Cooldown 체크 → 중복 인시던트 방지                       │
└──────────────────────────────────────────────────────────┘
```

## 설정 방법

### 1. 환경 변수 설정 (watch-server/.env)

```bash
# Auto-Incident Detection 활성화
ENABLE_AUTO_INCIDENT_DETECTION=true

# Backend API URL
MONITOR_API_URL=http://localhost:3001

# API 호출 타임아웃 (5초)
AUTO_DETECTION_TIMEOUT=5000
```

### 2. Auto-Detection 비활성화 (필요 시)

```bash
# watch-server/.env
ENABLE_AUTO_INCIDENT_DETECTION=false
```

## 동작 방식

### 1. 헬스체크 수행 (1분마다)
- Watch Server가 5개 서비스에 대해 헬스체크 수행
- 결과를 `watch_server_logs` 테이블에 저장
- 결과를 `api_response_times` 테이블에 저장
- 결과를 `uptime_records` 테이블에 일일 요약 저장

### 2. Auto-Detection 트리거 (비동기)
- 헬스체크 완료 후 자동으로 `autoDetectionClient.analyzeBatchInBackground()` 호출
- **비동기 처리**: 헬스체크 속도에 영향 없음 (fire and forget)
- **에러 내성**: Auto-detection 실패 시에도 헬스체크 계속 진행

### 3. 인시던트 감지 및 생성
- Backend API가 각 서비스에 대해 8개 감지 규칙 평가
- 조건 만족 시 자동으로 인시던트 생성
- Cooldown 메커니즘으로 중복 인시던트 방지

## 감지 규칙 요약

| Priority | 조건 | Cooldown |
|----------|------|----------|
| P1 (Critical) | 5회 연속 실패 | 30분 |
| P2 (High) | 3회 연속 실패 | 15분 |
| P2 (High) | 오류율 >50% | 30분 |
| P2 (High) | 응답 시간 >30초 | 15분 |
| P3 (Medium) | 평균 응답 시간 >10초 | 20분 |
| P3 (Medium) | 2회 연속 실패 | 45분 |
| P4 (Low) | 1회 실패 | 60분 |
| P4 (Low) | 평균 응답 시간 5-10초 | 30분 |

## API 엔드포인트

### 1. 단일 서비스 분석
```bash
POST http://localhost:3001/api/auto-detection/analyze
Content-Type: application/json

{
  "serviceId": "id-recognition",
  "latestCheckId": 12345  # optional
}
```

### 2. 일괄 서비스 분석 (권장)
```bash
POST http://localhost:3001/api/auto-detection/batch-analyze
Content-Type: application/json

{
  "serviceIds": [
    "id-recognition",
    "face-liveness",
    "id-liveness",
    "face-compare",
    "curp-verifier"
  ]
}
```

### 3. 감지 규칙 조회
```bash
GET http://localhost:3001/api/auto-detection/rules
```

### 4. Cooldown 초기화 (테스트용)
```bash
POST http://localhost:3001/api/auto-detection/clear-cooldowns
```

### 5. 수동 분석 트리거 (테스트용)
```bash
POST http://localhost:3001/api/auto-detection/manual-analysis
Content-Type: application/json

{
  "serviceId": "id-recognition"
}
```

## 테스트 방법

### 1. Watch Server 로그 확인
```bash
cd watch-server
npm run dev
```

로그에서 다음을 확인:
```
✅ Health monitoring started
🔍 Starting health checks...
💾 Health check results saved to database successfully
🤖 Triggering auto-detection analysis...
🤖 Auto-detection triggered for 5 services
```

### 2. Backend API 로그 확인
```bash
cd verify-monitor-api
npm run dev
```

로그에서 다음을 확인:
```
🔍 Auto-detection analysis triggered for service: id-recognition
🚨 Detection rule triggered: Consecutive Failures - High for service id-recognition
✅ Auto-created incident: inc-2025-001 for service id-recognition
```

### 3. 수동 테스트 시나리오

#### 시나리오 1: 서비스 다운 시뮬레이션
1. 서비스 URL을 잘못된 주소로 변경 (헬스체크 실패)
2. Watch Server가 1분마다 헬스체크 수행
3. 3회 연속 실패 시 P2 인시던트 자동 생성 확인
4. 5회 연속 실패 시 P1 인시던트 자동 생성 확인

#### 시나리오 2: Cooldown 테스트
1. P2 인시던트 생성 확인
2. 15분 이내에 동일 조건 발생 → 새 인시던트 생성 안 됨
3. 15분 후 동일 조건 발생 → 새 인시던트 생성됨

#### 시나리오 3: API 직접 호출
```bash
# 수동 분석 트리거
curl -X POST http://localhost:3001/api/auto-detection/manual-analysis \
  -H "Content-Type: application/json" \
  -d '{"serviceId": "id-recognition"}'

# 감지 규칙 조회
curl http://localhost:3001/api/auto-detection/rules

# Cooldown 초기화
curl -X POST http://localhost:3001/api/auto-detection/clear-cooldowns
```

## 성능 고려사항

### 1. 비동기 처리
- Auto-detection 호출은 `analyzeBatchInBackground()`로 비동기 처리
- 헬스체크 완료 시간에 영향 없음 (fire and forget)

### 2. 타임아웃
- 기본 타임아웃: 5초 (단일 분석)
- 일괄 분석: 10초 (자동으로 2배)
- 타임아웃 발생 시 에러 로그 남기고 다음 헬스체크 계속

### 3. 에러 핸들링
- Auto-detection API 실패 시에도 헬스체크는 정상 진행
- 모든 에러는 로그에 기록되지만 프로세스 중단 안 함

### 4. 리소스 사용
- 5개 서비스 × 1분 간격 = 시간당 300회 분석
- 각 분석마다 DB 쿼리 약 3-5회 (최근 10회, 1시간 데이터)
- 평균 응답 시간: <100ms

## 문제 해결

### 1. Auto-detection이 동작하지 않음
```bash
# 로그 확인
cd watch-server
npm run dev | grep "auto-detection"

# 환경 변수 확인
echo $ENABLE_AUTO_INCIDENT_DETECTION  # true 여야 함

# Backend API 연결 확인
curl http://localhost:3001/health
```

### 2. 인시던트가 생성되지 않음
```bash
# 감지 규칙 확인
curl http://localhost:3001/api/auto-detection/rules

# Cooldown 상태 확인 (15-60분 대기 필요)
# Cooldown 초기화 (테스트용)
curl -X POST http://localhost:3001/api/auto-detection/clear-cooldowns

# 수동 분석 실행
curl -X POST http://localhost:3001/api/auto-detection/manual-analysis \
  -H "Content-Type: application/json" \
  -d '{"serviceId": "id-recognition"}'
```

### 3. API 타임아웃
```bash
# 타임아웃 시간 증가 (watch-server/.env)
AUTO_DETECTION_TIMEOUT=10000  # 10초

# Backend API 로그 확인
cd verify-monitor-api
npm run dev | grep "auto-detection"
```

## 비활성화 방법

필요 시 Auto-detection을 비활성화할 수 있습니다:

```bash
# watch-server/.env
ENABLE_AUTO_INCIDENT_DETECTION=false
```

재활성화:
```bash
# watch-server/.env
ENABLE_AUTO_INCIDENT_DETECTION=true

# Watch Server 재시작
cd watch-server
npm run dev
```

## 개발 환경 vs 프로덕션 환경

### 개발 환경
- `ENABLE_AUTO_INCIDENT_DETECTION=true`
- `MONITOR_API_URL=http://localhost:3001`
- 짧은 Cooldown (테스트 용이)

### 프로덕션 환경
- `ENABLE_AUTO_INCIDENT_DETECTION=true`
- `MONITOR_API_URL=https://api.yourdomain.com`
- API 키 인증 추가 권장
- Cooldown 기본값 유지 (중복 알림 방지)

## 향후 개선 사항

1. **API 키 인증**: Internal service call에 API 키 추가
2. **Retry 로직**: Auto-detection API 실패 시 재시도
3. **메트릭 수집**: Auto-detection 성공률, 평균 응답 시간 추적
4. **Webhook 통합**: Incident 생성 시 외부 시스템 알림 (Slack, Email)
5. **Machine Learning**: 이상 패턴 학습 및 예측 알림

## 참고 자료

- Auto-Detection 규칙 상세: `/verify-monitor-api/src/services/auto-incident-detection.ts`
- Watch Server 구현: `/watch-server/src/monitors/health-monitor-simple.ts`
- API 엔드포인트: `/verify-monitor-api/src/controllers/auto-detection-controller.ts`
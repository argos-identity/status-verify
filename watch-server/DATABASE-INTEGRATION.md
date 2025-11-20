# Watch Server Database Integration

## 🎯 개요

Watch Server가 이제 **실제 메트릭스를 PostgreSQL 데이터베이스에 저장하고 조회**합니다. 더 이상 Mock 데이터가 아닌 실제 모니터링 데이터를 사용합니다.

## ✅ 구현된 기능

### 1. **실시간 헬스체크 데이터 저장**
- `WatchServerLog`: 각 API 호출 결과 (응답시간, 상태, 에러)
- `APIResponseTime`: 개별 API 응답시간 (SLA 분석용)
- `APICallLog`: 일별 집계 통계 (성공/실패 횟수, 평균 응답시간)
- `UptimeRecord`: 서비스별 일별 상태 (o/po/mo/nd)

### 2. **실제 메트릭스 계산**
```typescript
// 실제 DB 데이터 기반 계산
- 30일 업타임 퍼센트
- 평균/최소/최대 응답시간
- SLA 준수율 (99.9% 목표)
- 에러율 및 타입별 분류
- 시간대별 성능 트렌드
```

### 3. **자동 서비스 초기화**
- 서버 시작 시 서비스 정보를 DB에 자동 등록
- 기존 서비스는 업데이트, 새 서비스는 생성

### 4. **Graceful Degradation**
- DB 연결 실패 시에도 모니터링 계속 진행
- Fallback 메트릭스 제공으로 시스템 안정성 확보

## 🗄️ 데이터베이스 스키마

### 주요 테이블
1. **services**: 모니터링 대상 서비스 정보
2. **watch_server_logs**: 개별 헬스체크 결과
3. **api_response_times**: API 응답시간 측정값
4. **api_call_logs**: 일별 집계 통계
5. **uptime_records**: 서비스별 일별 업타임 상태

## 🚀 사용법

### 서버 시작
```bash
cd watch-server
npm run dev
```

### 테스트 실행
```bash
# 메트릭스 통합 테스트
npm run test:metrics

# 또는 직접 실행
npm run test:integration
```

### API 엔드포인트 테스트
```bash
# 시스템 상태 확인
curl http://localhost:3008/health

# 수동 헬스체크 실행
curl -X POST http://localhost:3008/api/health-check

# 특정 서비스 메트릭스
curl http://localhost:3008/api/metrics/face-compare?days=30

# 전체 서비스 메트릭스
curl http://localhost:3008/api/metrics?days=7

# 모니터링 상태 확인
curl http://localhost:3008/api/status
```

## 📊 메트릭스 데이터 예시

### 서비스 메트릭스 응답
```json
{
  "serviceId": "face-compare",
  "period": { "days": 30, "start": "2024-01-01", "end": "2024-01-31" },
  "uptime": 99.2,
  "avgResponseTime": 245,
  "minResponseTime": 89,
  "maxResponseTime": 1203,
  "totalRequests": 8640,
  "successfulRequests": 8571,
  "failedRequests": 69
}
```

### SLA 메트릭스 응답
```json
{
  "serviceId": "face-compare",
  "slaTarget": 99.9,
  "currentSLA": 99.2,
  "breaches": 2,
  "responseTimeSLA": 98.8,
  "isBreached": true
}
```

## ⚙️ 환경 변수

```env
DATABASE_URL="postgresql://username:password@localhost:5432/sla_monitor"
LOG_LEVEL="info"
SLA_TARGET="99.9"
REQUEST_TIMEOUT="10000"
```

## 🔧 주요 변경사항

1. **metrics-service-simple.ts**: Mock 데이터 → 실제 DB 쿼리
2. **health-monitor-simple.ts**: DB 저장 로직 추가
3. **service-initializer.ts**: 서비스 자동 초기화
4. **server.ts**: 시작 시 서비스 초기화 실행

## 🎯 다음 단계

1. **Frontend 연동**: verify-main 앱에서 실제 API 데이터 사용
2. **알람 시스템**: SLA 위반 시 자동 알림
3. **대시보드 개선**: 실시간 메트릭스 시각화
4. **성능 최적화**: 대용량 데이터 처리 개선

## 🔍 트러블슈팅

### DB 연결 문제
```bash
# 데이터베이스 상태 확인
curl http://localhost:3008/health

# Prisma 마이그레이션 실행
npm run db:migrate

# Prisma 클라이언트 재생성
npm run db:generate
```

### 로그 확인
```bash
# 실시간 로그 모니터링
tail -f watch-server.log

# 에러 로그만 필터링
grep "ERROR" watch-server.log
```

---

✅ **성공**: Watch Server가 이제 실제 메트릭스를 DB에 저장하고 조회합니다!
📈 **결과**: Frontend 앱들이 실제 모니터링 데이터를 사용할 수 있습니다!
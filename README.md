# status-verify-api

**버전**: 1.0  
**작성일**: 2025-08-28  
**프로젝트**: Verify Api Service Monitoring System
---

## 0. Account
- **Admin URL**: http://serverIP:3006/auth/login?callbackUrl=/incidents/create
- **ID**: admin@argosidentity.com
- **Password**: Admin@123

## 1. 프로젝트 개요

### 1.1 프로젝트명
**Verify Api Monitoring System** - 실시간 서비스 레벨 모니터링 시스템

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
│ • Verify-Incidents  │    │              │    │         │    │ (1분마다       │
│                     │    │              │    │         │    │ 상태 체크)     │
└─────────────────────┘    └──────────────┘    └─────────┘    │              │
                                                              │      ▼       │
                                                              │  Verify      │
                                                              │  Servers     │
                                                              └──────────────┘
```

### 2.2 컴포넌트 구성
1. **Web Pages** (포트 3000, 3006)
   - `verify-main`: 시스템 상태 페이지, 과거 인시던트 표시, 업타임 추적
   - `verify-incidents`: Incident 관리 애플리케이션, 운영팀 전용 관리 도구

2. **Backend API (포트 3003)** 
   - REST API 서버
   - WebSocket 실시간 통신
   - PostgreSQL 데이터 관리

3. **Watch Serve(포트 3008)** (Phase 5)
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

### 4.4 자동 인시던트 감지 시스템 ✨ NEW
- **통합 완료**: Watch Server ↔ Backend API 실시간 연동
- **감지 규칙**: 8개 규칙 (P1/P2/P3/P4 우선순위)
- **Cooldown 메커니즘**: 중복 인시던트 방지 (15-60분)
- **비동기 처리**: 헬스체크 성능 영향 없음
- **활성화 방법**: `ENABLE_AUTO_INCIDENT_DETECTION=true` (.env)
- **상세 문서**: [watch-server/AUTO-DETECTION-INTEGRATION.md](watch-server/AUTO-DETECTION-INTEGRATION.md)

**감지 조건 예시**:
- P1 Critical: 5회 연속 실패 (30분 cooldown)
- P2 High: 3회 연속 실패, 오류율 >50%, 응답 시간 >30초 (15-30분 cooldown)
- P3 Medium: 평균 응답 시간 >10초, 2회 연속 실패 (20-45분 cooldown)
- P4 Low: 1회 실패, 평균 응답 시간 5-10초 (30-60분 cooldown)

---
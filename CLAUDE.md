# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

장애 이력 등록과 장애 목록 관리 전용 시스템. 운영 중인 것은 `verify-incidents`(관리 UI)와 `verify-monitor-api`(REST + Socket.IO), PostgreSQL 뿐이다.

**폐기됨 (2026-08-03)**: `verify-main`(공개 상태 페이지)과 `watch-server`(1분 헬스체크)는 컨테이너에서 내렸다. 소스는 리포에 남아 있지만 빌드/배포하지 않으며, 이들이 쓰던 DB 테이블 5개(`uptime_records`, `api_response_times`, `api_call_logs`, `watch_server_logs`, `system_status`)와 `incident.affected_services` 컬럼도 DROP했다. **자동 장애 감지는 watch-server와 함께 사라졌다 — 장애는 100% 수동 등록이다.**

**Authentication Policy**: Conditional authentication - GET requests to public endpoints allowed without JWT, all POST/PUT/DELETE require JWT tokens.

## Development Commands

### Incident Management UI (verify-incidents, port 3006)
```bash
cd verify-incidents
npm run dev
npm run build
npm run lint
```

### Backend API (verify-monitor-api, port 3003)
```bash
cd verify-monitor-api
npm run dev                 # Start development server
npm run build              # Build for production
npm run test               # Run test suite
npm run test:contract      # Run contract tests
npx prisma migrate deploy  # Apply database migrations
npx prisma db seed         # Seed initial data
npx prisma studio         # Open Prisma Studio
```

## Architecture Overview

### Current Structure
```
/status-verify/
├── verify-incidents/     # 장애 관리 UI (Next.js, port 3006)
├── verify-monitor-api/   # REST + Socket.IO (Express, port 3003)
├── verify-main/          # 폐기 — 빌드하지 않음
├── watch-server/         # 폐기 — 빌드하지 않음
└── PRD.md
```

### Implementation Architecture
- **Web Pages**: One Next.js app (verify-incidents)
- **Backend API**: Node.js + Express + TypeScript + PostgreSQL + Prisma ORM
- **Real-time**: Socket.IO — 장애 협업 이벤트만 (상태 브로드캐스트는 제거됨)
- **Database**: PostgreSQL, 4 tables (`services`, `incident`, `incident_update`, `users`)

### Key Components

#### verify-main (System Status Dashboard)
- `SystemStatus`: Displays overall system health and individual service status
- `PastIncidents`: Shows historical incidents (currently shows "데이터를 준비 중입니다." for empty state)
- Static data in `/src/components/sections/system-status.tsx`

### Status System
Status values are represented as single characters:
- `'o'`: Operational (green)
- `'po'`: Partial Outage (orange/warning)  
- `'mo'`: Major Outage (red/error)
- `'nd'`: No Data (blue/chart-5)
- `'e'`: Empty (transparent)

## Technology Stack

### Frontend (verify-main)
- **Framework**: Next.js 15.3.5 with App Router
- **UI**: React 19, TypeScript
- **Styling**: TailwindCSS v4 with custom theme
- **Components**: Radix UI, Lucide React icons
- **Fonts**: Inter (Google Fonts)

### Custom Design System
- **Colors**: Defined in `globals.css` with CSS custom properties
- **Primary**: Green (#8BC34A) for operational status
- **Status Colors**: Orange (#FF9800), Red (#F44336), Yellow (#FFEB3B)
- **Theme**: Light theme with CSS variables for consistent theming

### Component Organization
```
/src/
├── app/                 # Next.js App Router pages
├── components/
│   ├── sections/        # Page-specific components
│   └── ui/             # Reusable UI components (shadcn/ui style)
├── lib/
│   └── utils.ts        # Utility functions (cn function for class merging)
└── hooks/              # Custom React hooks
```

## Data Migration Strategy

### Current State
The application uses hardcoded mock data that represents the expected API structure:
- Service names and IDs are structured for API integration
- Status data simulates real monitoring data
- Data structures are designed to match planned API responses

### Next Steps (API Integration)
1. Replace hardcoded `servicesData` in SystemStatus with API calls
2. Add WebSocket integration for real-time updates
3. Implement loading states and error handling
4. Add data fetching hooks or context providers

## Development Workflow

### Adding New Services
1. Update service lists in the application:
   - `verify-main/src/components/sections/system-status.tsx`

### Styling Guidelines
- Use Tailwind classes with the custom design system variables
- Follow existing patterns for status color usage
- Maintain consistent spacing and typography
- Use `cn()` utility for conditional styling

### API Integration Readiness
The frontend component is structured to easily accept API data:
- Component props match expected API response structure
- Status enums and data types are consistent
- UI components are separated from data concerns

## Port Configuration
운영 서버(`verify-status.argosidentity.io`, ssh `ubuntu@54.211.121.248`) 실측 기준:

| 서비스 | 호스트 포트 | 컨테이너 내부 |
|---|---|---|
| verify-incidents | 3006 | 3006 |
| Backend API | 3003 | 3003 |
| PostgreSQL | 5432 | 5432 |

폐기: verify-main(3000), Watch Server(3008) — 컨테이너 없음.

컨테이너 간 통신은 Docker 내부 DNS `http://verify-monitor-api:3003/api` 를 사용한다.
HAProxy 는 현재 미사용(각 컨테이너가 호스트 포트에 직접 바인딩).

## Implementation Documentation

### Spec-Driven Development Artifacts
```
specs/001-prd-md/
├── plan.md              # Implementation plan with technical decisions
├── research.md          # Technical research findings  
├── data-model.md        # Database entities and relationships
├── quickstart.md        # Development setup and test scenarios
└── contracts/           # API and WebSocket contracts
    ├── api-spec.yaml    # OpenAPI 3.0 REST API specification
    └── websocket-events.yaml  # AsyncAPI WebSocket events
```

### Key Technical Decisions
- **Database**: PostgreSQL with time-based partitioning for high-volume monitoring data
- **Authentication**: JWT-based with role-based access control (viewer/reporter/admin)
- **Real-time**: Socket.IO with hierarchical rooms for incident collaboration
- **Testing**: Contract-first TDD with real database integration tests
- **Performance**: <200ms API responses, <5s WebSocket notifications, materialized views for SLA calculations

### Recent Changes
- 2025-09-11: Added complete implementation plan with API contracts, data model, and technical architecture
- 2025-09-11: Defined WebSocket events for real-time collaboration and status updates
- 2025-09-11: Created development quickstart guide with test scenarios

## Reference Documentation
- See `PRD.md` for complete product requirements and API specifications
- Architecture diagram available in `arch.jpeg`
- Implementation details in `specs/001-prd-md/plan.md`
- API contracts in `specs/001-prd-md/contracts/`

## HAProxy 설정
- **설치 방식**: Docker 없이 직접 설치
- **설정 파일**: `haproxy-local.cfg` (로컬 시스템용)
- **설치 가이드**: `README-haproxy.md` 참조
- **라우팅**:
  - `/` → verify-main (80)
  - `/api/*` → verify-monitor-api (3001)
  - `/incidents/*` → verify-incidents (3006)
  - `/socket.io/*` → verify-monitor-api (3001)

Last updated: 2025-09-29
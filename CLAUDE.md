# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an SLA monitoring system consisting of one Next.js frontend application and a planned backend API. The system monitors service uptime and displays system status information for services like ID Recognition, Face Liveness, ID Liveness, Face Compare, and Curp Verifier.

**Current Status**: Implementation plan complete. Ready for backend API development with Node.js + Express + TypeScript, PostgreSQL + Prisma, Socket.IO for real-time features. **Authentication Policy**: Conditional authentication - GET requests to public endpoints allowed without JWT, all POST/PUT/DELETE require JWT tokens.

## Development Commands

### Frontend Application (verify-main)
```bash
# Start verify-main on port 3000
cd verify-main && npm run dev

# Build application
npm run build

# Lint code
npm run lint
```

### Backend API (ready for implementation)
```bash
# Backend API server (port 3001)
cd verify-monitor-api
npm run dev                 # Start development server
npm run build              # Build for production
npm run test               # Run test suite
npm run test:contract      # Run contract tests
npx prisma migrate dev     # Apply database migrations
npx prisma db seed         # Seed initial data
npx prisma studio         # Open Prisma Studio

# Watch server (port 3008) 
cd watch-server
npm run dev               # Start monitoring service
npm run test              # Run health check tests
```

## Architecture Overview

### Current Structure
```
/sla-monitor/
├── verify-main/          # System status page (Next.js, port 3000)
├── arch.jpeg            # Architecture diagram
└── PRD.md              # Product Requirements Document
```

### Implementation Architecture
- **Web Pages**: One Next.js app (verify-main)
- **Backend API**: Node.js + Express + TypeScript + PostgreSQL + Prisma ORM
- **Watch Server**: Automated monitoring service with 1-minute health checks
- **Real-time**: Socket.IO for WebSocket-based collaboration and status updates
- **Database**: PostgreSQL with 9 core tables (services, incidents, users, uptime_records, etc.)

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
- verify-main: 3000
- Backend API: 3001
- Watch Server: 3008

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

Last updated: 2025-09-15
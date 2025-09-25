# verify-monitor-api

SLA monitoring system backend API with real-time collaboration features.

## Tech Stack

- **Runtime**: Node.js 18+ with TypeScript 5.x
- **Framework**: Express.js
- **Database**: PostgreSQL 14+ with Prisma ORM
- **Real-time**: Socket.IO for WebSocket communication
- **Authentication**: JWT with bcrypt password hashing
- **Testing**: Jest with supertest for API testing
- **Code Quality**: ESLint, Prettier with strict TypeScript config

## Project Structure

```
verify-monitor-api/
├── src/
│   ├── controllers/     # API route handlers
│   ├── services/        # Business logic layer
│   ├── models/          # Prisma model extensions
│   ├── middleware/      # Express middleware
│   ├── config/          # Configuration files
│   └── app.ts           # Main application entry
├── tests/
│   ├── contract/        # API contract tests
│   ├── integration/     # Integration tests
│   └── unit/            # Unit tests
├── prisma/
│   ├── schema.prisma    # Database schema
│   ├── migrations/      # Database migrations
│   └── seeds/           # Database seed data
└── docs/                # API documentation
```

## Features

- **Service Monitoring**: Track uptime and performance for multiple services
- **Incident Management**: Complete incident workflow with real-time collaboration  
- **SLA Reporting**: Response time tracking and availability metrics
- **Real-time Updates**: WebSocket-based live updates and collaboration
- **Role-based Access**: Three user roles (viewer, reporter, admin)
- **API Documentation**: OpenAPI 3.0 specification with contract tests

## Development

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm 8+

### Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Environment configuration**:
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

3. **Database setup**:
   ```bash
   # Run migrations
   npx prisma migrate deploy
   
   # Generate Prisma client
   npx prisma generate
   
   # Seed development data
   npm run db:seed
   ```

4. **Start development server**:
   ```bash
   npm run dev
   ```

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm run start` - Start production server
- `npm test` - Run all tests
- `npm run test:contract` - Run API contract tests
- `npm run test:integration` - Run integration tests
- `npm run test:unit` - Run unit tests
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `npm run db:migrate` - Run database migrations
- `npm run db:seed` - Seed development data
- `npm run db:studio` - Open Prisma Studio

## Database Schema

### Core Entities

1. **Service** - Monitored system components
2. **UptimeRecord** - Daily status entries per service
3. **Incident** - Problem reports with workflow tracking
4. **IncidentUpdate** - Status changes and comments
5. **User** - System users with role-based access
6. **APIResponseTime** - Individual API call measurements
7. **APICallLog** - Daily aggregated statistics
8. **WatchServerLog** - Monitoring check results
9. **SystemStatus** - Overall system health indicator

### Performance Features

- Time-based partitioning for high-volume tables
- Optimized indexes for time-series queries
- Materialized views for SLA calculations
- Efficient pagination for large datasets

## API Endpoints

- **System Status**: `GET /api/system-status`
- **Services**: `GET /api/services`
- **Uptime Data**: `GET /api/uptime/{serviceId}`
- **Incidents**: Full CRUD at `/api/incidents`
- **SLA Metrics**: `/api/sla/response-times/{serviceId}`, `/api/sla/availability/{serviceId}`
- **Authentication**: `/api/auth/login`, `/api/auth/refresh`

## Real-time Features

WebSocket events for:
- Status updates
- Incident collaboration  
- Real-time field editing
- User presence
- Auto-save functionality

## Testing

The project follows Test-Driven Development (TDD):

1. **Contract Tests** - Validate API specifications
2. **Integration Tests** - Test complete user scenarios
3. **Unit Tests** - Test individual components

Run tests with coverage:
```bash
npm test -- --coverage
```

## Performance Targets

- **API Response Time**: < 200ms average
- **WebSocket Notifications**: < 5 seconds delay
- **Uptime**: 99.9% availability
- **Monitoring Interval**: 1 minute

## Security Features

- JWT-based authentication
- bcrypt password hashing
- Rate limiting
- CORS configuration
- Helmet.js security headers
- Role-based access control (RBAC)
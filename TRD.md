# TRD - Technical Requirements Document (기술 요구사항 문서)

**버전**: 1.0  
**작성일**: 2025-01-11  
**프로젝트**: SLA Monitor System  
**기반 문서**: PRD.md v1.0

---

## 1. 개요 및 목적

### 1.1 문서 목적
본 문서는 SLA Monitor System의 **Backend API 서버**와 **Watch Server** 구현을 위한 상세한 기술 사양을 정의합니다.

### 1.2 시스템 아키텍처
```
┌─────────────────────┐    ┌──────────────┐    ┌─────────┐    ┌──────────────┐
│   Frontend App      │    │  Backend     │    │   DB    │    │   Watch      │
│ • verify-main:80    │◄──►│    API       │◄──►│  Postgre│◄───│   Server     │
│                     │    │   :3001      │    │   SQL   │    │   :3008      │
│                     │    │              │    │         │    │              │
│                     │    │              │    │         │    │ (1분마다     │
└─────────────────────┘    └──────────────┘    └─────────┘    │ 상태 체크)   │
                                                              │      ▼       │
                                                              │  Verify      │
                                                              │  Servers     │
                                                              └──────────────┘
```

### 1.3 구현 대상
- **Backend API Server** (포트 3001)
- **Watch Server** (포트 3008)
- **PostgreSQL Database**
- **Frontend API 연동**

---

## 2. Backend API 서버 구현 사양

### 2.1 프로젝트 구조
```
verify-monitor-api/
├── src/
│   ├── config/
│   │   ├── database.ts         # Prisma 설정
│   │   ├── socket.ts           # Socket.IO 설정
│   │   └── env.ts              # 환경변수 설정
│   ├── controllers/
│   │   ├── systemController.ts # 시스템 상태 API
│   │   ├── uptimeController.ts # 업타임 API
│   │   ├── incidentController.ts # 인시던트 API
│   │   └── slaController.ts    # SLA 리포트 API
│   ├── services/
│   │   ├── systemService.ts    # 비즈니스 로직
│   │   ├── uptimeService.ts
│   │   ├── incidentService.ts
│   │   └── slaService.ts
│   ├── middleware/
│   │   ├── auth.ts             # JWT 인증
│   │   ├── validation.ts       # 요청 검증
│   │   ├── errorHandler.ts     # 에러 처리
│   │   └── rateLimit.ts        # Rate Limiting
│   ├── routes/
│   │   ├── system.ts           # 시스템 라우트
│   │   ├── uptime.ts           # 업타임 라우트
│   │   ├── incidents.ts        # 인시던트 라우트
│   │   └── sla.ts              # SLA 라우트
│   ├── sockets/
│   │   ├── statusHandler.ts    # 상태 업데이트 이벤트
│   │   ├── incidentHandler.ts  # 인시던트 이벤트
│   │   └── collaborationHandler.ts # 멀티유저 편집
│   ├── types/
│   │   ├── api.ts              # API 타입 정의
│   │   ├── database.ts         # DB 타입 정의
│   │   └── socket.ts           # Socket 이벤트 타입
│   ├── utils/
│   │   ├── logger.ts           # 로깅 유틸
│   │   ├── validators.ts       # 데이터 검증
│   │   └── helpers.ts          # 헬퍼 함수
│   └── app.ts                  # Express 앱 설정
├── prisma/
│   ├── schema.prisma           # DB 스키마
│   ├── migrations/             # 마이그레이션 파일
│   └── seeds/                  # 시드 데이터
├── tests/
│   ├── unit/                   # 단위 테스트
│   ├── integration/            # 통합 테스트
│   └── e2e/                    # E2E 테스트
├── docker/
│   ├── Dockerfile              # API 서버 도커파일
│   └── docker-compose.yml      # 개발환경 구성
├── package.json
├── tsconfig.json
└── README.md
```

### 2.2 Express.js + TypeScript 설정

#### package.json 의존성
```json
{
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.7.4",
    "@prisma/client": "^5.7.1",
    "bcrypt": "^5.1.1",
    "jsonwebtoken": "^9.0.2",
    "zod": "^3.22.4",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "express-rate-limit": "^7.1.5",
    "winston": "^3.11.0",
    "dotenv": "^16.3.1",
    "node-cron": "^3.0.3"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/bcrypt": "^5.0.2",
    "@types/jsonwebtoken": "^9.0.5",
    "@types/cors": "^2.8.17",
    "@types/node": "^20.10.5",
    "typescript": "^5.3.3",
    "ts-node": "^10.9.2",
    "nodemon": "^3.0.2",
    "prisma": "^5.7.1",
    "jest": "^29.7.0",
    "@types/jest": "^29.5.8"
  }
}
```

#### app.ts 기본 구조
```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server } from 'socket.io';
import rateLimit from 'express-rate-limit';

import { systemRoutes } from './routes/system';
import { uptimeRoutes } from './routes/uptime';
import { incidentRoutes } from './routes/incidents';
import { slaRoutes } from './routes/sla';
import { errorHandler } from './middleware/errorHandler';
import { setupSocketHandlers } from './sockets';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URLS?.split(',') || ['http://localhost:80', 'http://localhost:3001', 'http://localhost:3005'],
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// Security middleware
app.use(helmet());
app.use(cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 100, // 요청 제한
  message: 'Too many requests from this IP'
});
app.use('/api', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/system', systemRoutes);
app.use('/api/uptime', uptimeRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/sla', slaRoutes);

// WebSocket handlers
setupSocketHandlers(io);

// Error handling
app.use(errorHandler);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Backend API Server running on port ${PORT}`);
});

export { app, io };
```

### 2.3 데이터베이스 스키마 (Prisma)

#### prisma/schema.prisma
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Service {
  id          String   @id @db.VarChar(50)
  name        String   @db.VarChar(100)
  description String?
  endpointUrl String?  @map("endpoint_url") @db.VarChar(255)
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  // Relations
  uptimeRecords    UptimeRecord[]
  apiResponseTimes ApiResponseTime[]
  apiCallLogs      ApiCallLog[]
  watchServerLogs  WatchServerLog[]
  incidentServices IncidentService[]

  @@map("services")
}

model UptimeRecord {
  id           Int      @id @default(autoincrement())
  serviceId    String   @map("service_id") @db.VarChar(50)
  date         DateTime @db.Date
  status       String   @db.VarChar(10) // 'o', 'po', 'mo', 'nd', 'e'
  responseTime Int?     @map("response_time") // ms
  errorMessage String?  @map("error_message")
  createdAt    DateTime @default(now()) @map("created_at")

  // Relations
  service Service @relation(fields: [serviceId], references: [id])

  @@unique([serviceId, date])
  @@index([serviceId, date(sort: Desc)])
  @@map("uptime_records")
}

model ApiResponseTime {
  id         Int      @id @default(autoincrement())
  serviceId  String   @map("service_id") @db.VarChar(50)
  responseTime Int    @map("response_time") // ms
  statusCode Int      @map("status_code")
  endpoint   String?  @db.VarChar(255)
  method     String   @default("GET") @db.VarChar(10)
  timestamp  DateTime @default(now())

  // Relations
  service Service @relation(fields: [serviceId], references: [id])

  @@index([serviceId, timestamp(sort: Desc)])
  @@index([timestamp, statusCode])
  @@map("api_response_times")
}

model ApiCallLog {
  id              Int      @id @default(autoincrement())
  serviceId       String   @map("service_id") @db.VarChar(50)
  date            DateTime @db.Date
  totalCalls      Int      @default(0) @map("total_calls")
  successCalls    Int      @default(0) @map("success_calls")
  errorCalls      Int      @default(0) @map("error_calls")
  avgResponseTime Int?     @map("avg_response_time") // ms
  maxResponseTime Int?     @map("max_response_time") // ms
  minResponseTime Int?     @map("min_response_time") // ms
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  // Relations
  service Service @relation(fields: [serviceId], references: [id])

  @@unique([serviceId, date])
  @@map("api_call_logs")
}

model WatchServerLog {
  id           Int      @id @default(autoincrement())
  serviceId    String   @map("service_id") @db.VarChar(50)
  checkTime    DateTime @default(now()) @map("check_time")
  statusCode   Int?     @map("status_code")
  responseTime Int?     @map("response_time") // ms
  isSuccess    Boolean  @map("is_success")
  errorMessage String?  @map("error_message")
  errorType    String?  @map("error_type") @db.VarChar(50)

  // Relations
  service Service @relation(fields: [serviceId], references: [id])

  @@index([serviceId, checkTime(sort: Desc)])
  @@index([checkTime, isSuccess])
  @@map("watch_server_logs")
}

model Incident {
  id               String    @id @db.VarChar(50)
  title            String    @db.VarChar(255)
  description      String?
  status           String    @db.VarChar(20) // 'investigating', 'identified', 'monitoring', 'resolved'
  severity         String    @db.VarChar(10) // 'low', 'medium', 'high', 'critical'
  priority         String    @db.VarChar(5) // 'P1', 'P2', 'P3'
  reporter         String?   @db.VarChar(100)
  detectionCriteria String? @map("detection_criteria")
  createdAt        DateTime  @default(now()) @map("created_at")
  resolvedAt       DateTime? @map("resolved_at")

  // Relations
  updates          IncidentUpdate[]
  affectedServices IncidentService[]

  @@index([status, createdAt(sort: Desc)])
  @@index([priority, createdAt(sort: Desc)])
  @@map("incidents")
}

model IncidentUpdate {
  id          Int      @id @default(autoincrement())
  incidentId  String   @map("incident_id") @db.VarChar(50)
  status      String   @db.VarChar(20)
  description String
  createdAt   DateTime @default(now()) @map("created_at")

  // Relations
  incident Incident @relation(fields: [incidentId], references: [id])

  @@index([incidentId, createdAt(sort: Desc)])
  @@map("incident_updates")
}

model IncidentService {
  incidentId String @map("incident_id") @db.VarChar(50)
  serviceId  String @map("service_id") @db.VarChar(50)

  // Relations
  incident Incident @relation(fields: [incidentId], references: [id])
  service  Service  @relation(fields: [serviceId], references: [id])

  @@id([incidentId, serviceId])
  @@map("incident_services")
}

model SystemStatus {
  id            Int      @id @default(autoincrement())
  overallStatus String   @map("overall_status") @db.VarChar(20) // 'operational', 'degraded', 'outage'
  message       String?
  createdAt     DateTime @default(now()) @map("created_at")

  @@index([createdAt(sort: Desc)])
  @@map("system_status")
}

model User {
  id        String   @id @default(cuid())
  username  String   @unique @db.VarChar(50)
  email     String   @unique @db.VarChar(100)
  password  String   @db.VarChar(255)
  role      String   @db.VarChar(20) // 'viewer', 'reporter', 'admin'
  isActive  Boolean  @default(true) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at")
  lastLoginAt DateTime? @map("last_login_at")

  @@map("users")
}
```

### 2.4 API 엔드포인트 구현 가이드

#### System Status API (controllers/systemController.ts)
```typescript
import { Request, Response } from 'express';
import { systemService } from '../services/systemService';
import { z } from 'zod';

export const getSystemStatus = async (req: Request, res: Response) => {
  try {
    const systemStatus = await systemService.getOverallStatus();
    const services = await systemService.getAllServicesStatus();
    
    res.json({
      overallStatus: systemStatus.overallStatus,
      lastUpdated: systemStatus.createdAt,
      services: services.map(service => ({
        id: service.id,
        name: service.name,
        status: service.currentStatus,
        uptime: service.uptimePercentage,
        uptimeData: service.last90DaysStatus
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch system status' });
  }
};

export const getServices = async (req: Request, res: Response) => {
  try {
    const services = await systemService.getAllServices();
    
    res.json({
      services: [
        { id: "all-systems", name: "All Systems" },
        ...services.map(service => ({
          id: service.id,
          name: service.name
        }))
      ]
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch services' });
  }
};
```

#### Uptime API (controllers/uptimeController.ts)
```typescript
import { Request, Response } from 'express';
import { uptimeService } from '../services/uptimeService';
import { z } from 'zod';

const uptimeQuerySchema = z.object({
  months: z.string().optional().transform(val => val ? parseInt(val) : 3),
  startDate: z.string().optional()
});

export const getServiceUptime = async (req: Request, res: Response) => {
  try {
    const { serviceId } = req.params;
    const query = uptimeQuerySchema.parse(req.query);
    
    const service = await uptimeService.getService(serviceId);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }
    
    const months = await uptimeService.getMonthlyUptime(serviceId, query.months, query.startDate);
    
    res.json({
      service: {
        id: service.id,
        name: service.name
      },
      months: months.map(month => ({
        name: month.name,
        uptime: month.uptime,
        days: month.days
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch uptime data' });
  }
};
```

#### Incident API (controllers/incidentController.ts)
```typescript
import { Request, Response } from 'express';
import { incidentService } from '../services/incidentService';
import { z } from 'zod';

const createIncidentSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  priority: z.enum(['P1', 'P2', 'P3']),
  affectedServices: z.array(z.string()),
  reporter: z.string().optional(),
  detectionCriteria: z.string().optional()
});

export const createIncident = async (req: Request, res: Response) => {
  try {
    const data = createIncidentSchema.parse(req.body);
    const incident = await incidentService.createIncident(data);
    
    // WebSocket 이벤트 발송
    req.app.get('io').emit('incident-created', { incident });
    
    res.status(201).json({ incident });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create incident' });
  }
};

export const updateIncidentStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, description } = req.body;
    
    const update = await incidentService.addIncidentUpdate(id, status, description);
    
    // WebSocket 이벤트 발송
    req.app.get('io').emit('incident-updated', { 
      incidentId: id, 
      update 
    });
    
    res.json({ update });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update incident' });
  }
};

export const getPastIncidents = async (req: Request, res: Response) => {
  try {
    const { days = 30, page = 1, limit = 10 } = req.query;
    
    const result = await incidentService.getPastIncidentsByDays(
      parseInt(days as string),
      parseInt(page as string),
      parseInt(limit as string)
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch past incidents' });
  }
};
```

### 2.5 WebSocket 이벤트 핸들러

#### sockets/statusHandler.ts
```typescript
import { Server, Socket } from 'socket.io';
import { systemService } from '../services/systemService';

export const setupStatusHandlers = (io: Server, socket: Socket) => {
  // 시스템 상태 업데이트 룸 참가
  socket.on('join-room', async ({ room }) => {
    await socket.join(room);
    console.log(`Socket ${socket.id} joined room: ${room}`);
  });

  // 룸 떠나기
  socket.on('leave-room', ({ room }) => {
    socket.leave(room);
    console.log(`Socket ${socket.id} left room: ${room}`);
  });
};

// 시스템 상태 변경 시 브로드캐스트
export const broadcastStatusUpdate = (io: Server, serviceId: string, status: string) => {
  io.to('system-status').emit('status-update', {
    serviceId,
    status,
    timestamp: new Date().toISOString()
  });
};

// 업타임 데이터 변경 시 브로드캐스트
export const broadcastUptimeUpdate = (io: Server, serviceId: string, date: string, status: string) => {
  io.to('uptime').emit('uptime-updated', {
    serviceId,
    date,
    status
  });
};
```

#### sockets/collaborationHandler.ts (verify-incidents 멀티유저 편집)
```typescript
import { Server, Socket } from 'socket.io';

interface EditingUser {
  userId: string;
  userName: string;
  incidentId: string;
  field?: string;
  timestamp: Date;
}

const activeEditors = new Map<string, EditingUser[]>();

export const setupCollaborationHandlers = (io: Server, socket: Socket) => {
  // 인시던트 편집 시작
  socket.on('incident-editing', ({ incidentId, userId, userName, isEditing, field }) => {
    const roomName = `incident-${incidentId}`;
    
    if (isEditing) {
      // 편집 시작
      const editors = activeEditors.get(incidentId) || [];
      const newEditor: EditingUser = {
        userId,
        userName,
        incidentId,
        field,
        timestamp: new Date()
      };
      
      // 기존 편집자 제거 후 새로 추가
      const filteredEditors = editors.filter(e => e.userId !== userId);
      activeEditors.set(incidentId, [...filteredEditors, newEditor]);
      
      socket.join(roomName);
    } else {
      // 편집 종료
      const editors = activeEditors.get(incidentId) || [];
      const filteredEditors = editors.filter(e => e.userId !== userId);
      activeEditors.set(incidentId, filteredEditors);
      
      socket.leave(roomName);
    }
    
    // 다른 사용자들에게 편집 상태 알림
    socket.to(roomName).emit('incident-editing', {
      incidentId,
      userId,
      userName,
      isEditing,
      field
    });
  });

  // 자동 저장
  socket.on('auto-save', ({ incidentId, data }) => {
    const roomName = `incident-${incidentId}`;
    
    // 다른 사용자들에게 자동 저장 알림
    socket.to(roomName).emit('auto-save', {
      incidentId,
      data,
      timestamp: new Date().toISOString()
    });
  });

  // 댓글 추가
  socket.on('incident-comment', ({ incidentId, comment }) => {
    const roomName = `incident-${incidentId}`;
    
    // 모든 사용자에게 댓글 브로드캐스트
    io.to(roomName).emit('incident-comment', {
      incidentId,
      comment: {
        ...comment,
        timestamp: new Date().toISOString()
      }
    });
  });

  // 연결 해제 시 편집 상태 정리
  socket.on('disconnect', () => {
    for (const [incidentId, editors] of activeEditors.entries()) {
      const filteredEditors = editors.filter(e => e.userId !== socket.id);
      activeEditors.set(incidentId, filteredEditors);
      
      // 편집 중이던 사용자가 연결 해제됨을 알림
      const roomName = `incident-${incidentId}`;
      socket.to(roomName).emit('user-left', {
        room: roomName,
        userId: socket.id
      });
    }
  });
};
```

### 2.6 인증/인가 시스템

#### middleware/auth.ts
```typescript
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: 'viewer' | 'reporter' | 'admin';
  };
}

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    
    req.user = user as AuthRequest['user'];
    next();
  });
};

export const requireRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

// 인시던트 생성/수정 권한 (Reporter 이상)
export const requireReporter = requireRole(['reporter', 'admin']);

// 인시던트 삭제 권한 (Admin만)
export const requireAdmin = requireRole(['admin']);

// 시스템 설정 권한 (Admin만)
export const requireSystemAdmin = requireRole(['admin']);
```

---

## 3. Watch Server 구현 사양

### 3.1 프로젝트 구조
```
verify-watch-server/
├── src/
│   ├── config/
│   │   ├── database.ts         # Prisma 클라이언트
│   │   ├── services.ts         # 모니터링 대상 서비스 목록
│   │   └── env.ts              # 환경변수
│   ├── monitors/
│   │   ├── healthChecker.ts    # 헬스체크 로직
│   │   ├── metricsCollector.ts # 메트릭 수집
│   │   └── responseAnalyzer.ts # 응답 분석
│   ├── schedulers/
│   │   ├── uptimeScheduler.ts  # 업타임 체크 스케줄러
│   │   ├── metricsScheduler.ts # 메트릭 수집 스케줄러
│   │   └── cleanupScheduler.ts # 오래된 데이터 정리
│   ├── services/
│   │   ├── notificationService.ts # 알림 서비스
│   │   ├── alertService.ts     # 장애 감지 및 알림
│   │   └── apiClient.ts        # Backend API 클라이언트
│   ├── types/
│   │   ├── monitoring.ts       # 모니터링 타입
│   │   └── metrics.ts          # 메트릭 타입
│   ├── utils/
│   │   ├── logger.ts           # 로깅
│   │   ├── httpClient.ts       # HTTP 클라이언트
│   │   └── calculations.ts     # 통계 계산
│   └── app.ts                  # 메인 애플리케이션
├── docker/
│   └── Dockerfile              # Watch Server 도커파일
├── package.json
├── tsconfig.json
└── README.md
```

### 3.2 스케줄링 시스템

#### schedulers/uptimeScheduler.ts
```typescript
import cron from 'node-cron';
import { healthChecker } from '../monitors/healthChecker';
import { metricsCollector } from '../monitors/metricsCollector';
import { alertService } from '../services/alertService';
import { logger } from '../utils/logger';

export class UptimeScheduler {
  private isRunning = false;

  // 1분마다 실행
  start() {
    cron.schedule('* * * * *', async () => {
      if (this.isRunning) {
        logger.warn('Previous health check still running, skipping...');
        return;
      }

      this.isRunning = true;
      
      try {
        await this.performHealthChecks();
      } catch (error) {
        logger.error('Health check failed:', error);
      } finally {
        this.isRunning = false;
      }
    });

    logger.info('Uptime scheduler started - running every minute');
  }

  private async performHealthChecks() {
    const services = await this.getMonitoringServices();
    
    const checkPromises = services.map(async (service) => {
      try {
        const result = await healthChecker.checkService(service);
        await metricsCollector.recordHealthCheck(result);
        
        // 장애 감지 및 알림
        if (!result.isSuccess) {
          await alertService.handleServiceFailure(service, result);
        }
        
        return result;
      } catch (error) {
        logger.error(`Health check failed for ${service.id}:`, error);
        return null;
      }
    });

    const results = await Promise.all(checkPromises);
    const successCount = results.filter(r => r?.isSuccess).length;
    
    logger.info(`Health checks completed: ${successCount}/${services.length} services healthy`);
  }

  private async getMonitoringServices() {
    // 모니터링 대상 서비스 목록 조회
    return [
      { id: 'id-recognition', name: 'ID Recognition', endpoint: 'https://api.verify.com/id-recognition/health' },
      { id: 'face-liveness', name: 'Face Liveness', endpoint: 'https://api.verify.com/face-liveness/health' },
      { id: 'id-liveness', name: 'ID Liveness', endpoint: 'https://api.verify.com/id-liveness/health' },
      { id: 'face-compare', name: 'Face Compare', endpoint: 'https://api.verify.com/face-compare/health' },
      { id: 'curp-verifier', name: 'Curp Verifier', endpoint: 'https://api.verify.com/curp-verifier/health' }
    ];
  }
}
```

### 3.3 헬스체크 로직

#### monitors/healthChecker.ts
```typescript
import axios, { AxiosResponse } from 'axios';
import { logger } from '../utils/logger';

export interface HealthCheckResult {
  serviceId: string;
  serviceName: string;
  isSuccess: boolean;
  responseTime: number; // ms
  statusCode: number | null;
  errorMessage: string | null;
  errorType: string | null;
  timestamp: Date;
}

export interface ServiceConfig {
  id: string;
  name: string;
  endpoint: string;
  timeout?: number;
  expectedStatusCode?: number;
}

class HealthChecker {
  private readonly DEFAULT_TIMEOUT = 7000; // 7초
  private readonly DEFAULT_EXPECTED_STATUS = 200;

  async checkService(service: ServiceConfig): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const timestamp = new Date();

    try {
      const response = await this.makeRequest(service);
      const responseTime = Date.now() - startTime;
      
      const isSuccess = this.isResponseHealthy(response, service);
      
      return {
        serviceId: service.id,
        serviceName: service.name,
        isSuccess,
        responseTime,
        statusCode: response.status,
        errorMessage: isSuccess ? null : `Unexpected status: ${response.status}`,
        errorType: isSuccess ? null : 'http_error',
        timestamp
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        serviceId: service.id,
        serviceName: service.name,
        isSuccess: false,
        responseTime,
        statusCode: null,
        errorMessage: this.getErrorMessage(error),
        errorType: this.getErrorType(error),
        timestamp
      };
    }
  }

  private async makeRequest(service: ServiceConfig): Promise<AxiosResponse> {
    const timeout = service.timeout || this.DEFAULT_TIMEOUT;
    
    return await axios.get(service.endpoint, {
      timeout,
      validateStatus: () => true, // 모든 상태 코드 허용
      headers: {
        'User-Agent': 'SLA-Monitor-Watch-Server/1.0'
      }
    });
  }

  private isResponseHealthy(response: AxiosResponse, service: ServiceConfig): boolean {
    const expectedStatus = service.expectedStatusCode || this.DEFAULT_EXPECTED_STATUS;
    return response.status === expectedStatus;
  }

  private getErrorMessage(error: any): string {
    if (error.code === 'ECONNABORTED') {
      return `Request timeout after ${error.config?.timeout || this.DEFAULT_TIMEOUT}ms`;
    }
    if (error.code === 'ECONNREFUSED') {
      return 'Connection refused';
    }
    if (error.code === 'ENOTFOUND') {
      return 'DNS resolution failed';
    }
    return error.message || 'Unknown error';
  }

  private getErrorType(error: any): string {
    if (error.code === 'ECONNABORTED') return 'timeout';
    if (error.code === 'ECONNREFUSED') return 'connection_error';
    if (error.code === 'ENOTFOUND') return 'dns_error';
    if (error.response) return 'http_error';
    return 'unknown_error';
  }
}

export const healthChecker = new HealthChecker();
```

### 3.4 메트릭 수집 전략

#### monitors/metricsCollector.ts
```typescript
import { PrismaClient } from '@prisma/client';
import { HealthCheckResult } from './healthChecker';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

class MetricsCollector {
  // 헬스체크 결과 기록
  async recordHealthCheck(result: HealthCheckResult) {
    try {
      // 1. Watch Server Log 기록 (모든 체크 결과)
      await prisma.watchServerLog.create({
        data: {
          serviceId: result.serviceId,
          checkTime: result.timestamp,
          statusCode: result.statusCode,
          responseTime: result.responseTime,
          isSuccess: result.isSuccess,
          errorMessage: result.errorMessage,
          errorType: result.errorType
        }
      });

      // 2. 실시간 API 응답 시간 기록 (성공한 경우만)
      if (result.isSuccess && result.statusCode && result.responseTime) {
        await prisma.apiResponseTime.create({
          data: {
            serviceId: result.serviceId,
            responseTime: result.responseTime,
            statusCode: result.statusCode,
            endpoint: '/health',
            method: 'GET',
            timestamp: result.timestamp
          }
        });
      }

      // 3. 일별 업타임 레코드 업데이트
      await this.updateDailyUptimeRecord(result);

      // 4. 일별 API 호출 로그 업데이트
      await this.updateDailyApiCallLog(result);

    } catch (error) {
      logger.error(`Failed to record metrics for ${result.serviceId}:`, error);
    }
  }

  private async updateDailyUptimeRecord(result: HealthCheckResult) {
    const today = new Date(result.timestamp);
    today.setHours(0, 0, 0, 0);

    // 오늘 날짜의 기존 레코드 조회
    const existingRecord = await prisma.uptimeRecord.findUnique({
      where: {
        serviceId_date: {
          serviceId: result.serviceId,
          date: today
        }
      }
    });

    if (existingRecord) {
      // 기존 레코드 업데이트 (가장 심각한 상태로)
      const currentStatus = this.mapHealthCheckToStatus(result);
      const worstStatus = this.getWorstStatus(existingRecord.status, currentStatus);
      
      await prisma.uptimeRecord.update({
        where: {
          serviceId_date: {
            serviceId: result.serviceId,
            date: today
          }
        },
        data: {
          status: worstStatus,
          responseTime: result.responseTime,
          errorMessage: result.isSuccess ? null : result.errorMessage
        }
      });
    } else {
      // 새 레코드 생성
      await prisma.uptimeRecord.create({
        data: {
          serviceId: result.serviceId,
          date: today,
          status: this.mapHealthCheckToStatus(result),
          responseTime: result.responseTime,
          errorMessage: result.isSuccess ? null : result.errorMessage
        }
      });
    }
  }

  private async updateDailyApiCallLog(result: HealthCheckResult) {
    const today = new Date(result.timestamp);
    today.setHours(0, 0, 0, 0);

    // 일별 집계 업데이트 (UPSERT)
    await prisma.apiCallLog.upsert({
      where: {
        serviceId_date: {
          serviceId: result.serviceId,
          date: today
        }
      },
      update: {
        totalCalls: { increment: 1 },
        successCalls: { increment: result.isSuccess ? 1 : 0 },
        errorCalls: { increment: result.isSuccess ? 0 : 1 },
        // 응답 시간 통계는 별도 계산 필요
        updatedAt: new Date()
      },
      create: {
        serviceId: result.serviceId,
        date: today,
        totalCalls: 1,
        successCalls: result.isSuccess ? 1 : 0,
        errorCalls: result.isSuccess ? 0 : 1,
        avgResponseTime: result.responseTime,
        maxResponseTime: result.responseTime,
        minResponseTime: result.responseTime
      }
    });

    // 응답 시간 통계 재계산 (성공한 요청만)
    if (result.isSuccess) {
      await this.recalculateResponseTimeStats(result.serviceId, today);
    }
  }

  private async recalculateResponseTimeStats(serviceId: string, date: Date) {
    // 오늘의 모든 성공한 응답 시간 조회
    const startOfDay = new Date(date);
    const endOfDay = new Date(date);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const responseTimes = await prisma.apiResponseTime.findMany({
      where: {
        serviceId,
        timestamp: {
          gte: startOfDay,
          lt: endOfDay
        },
        statusCode: 200
      },
      select: {
        responseTime: true
      }
    });

    if (responseTimes.length > 0) {
      const times = responseTimes.map(r => r.responseTime);
      const avgResponseTime = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
      const maxResponseTime = Math.max(...times);
      const minResponseTime = Math.min(...times);

      await prisma.apiCallLog.update({
        where: {
          serviceId_date: {
            serviceId,
            date
          }
        },
        data: {
          avgResponseTime,
          maxResponseTime,
          minResponseTime
        }
      });
    }
  }

  private mapHealthCheckToStatus(result: HealthCheckResult): string {
    if (result.isSuccess) {
      return 'o'; // operational
    }
    
    if (result.errorType === 'timeout' || result.responseTime > 7000) {
      return 'mo'; // major outage
    }
    
    if (result.responseTime > 3000) {
      return 'po'; // partial outage
    }
    
    return 'mo'; // major outage (기본값)
  }

  private getWorstStatus(current: string, newStatus: string): string {
    const statusPriority = { 'o': 0, 'po': 1, 'mo': 2, 'nd': 3 };
    const currentPriority = statusPriority[current as keyof typeof statusPriority] ?? 3;
    const newPriority = statusPriority[newStatus as keyof typeof statusPriority] ?? 3;
    
    return currentPriority >= newPriority ? current : newStatus;
  }
}

export const metricsCollector = new MetricsCollector();
```

---

## 4. 프론트엔드 API 연동 가이드

### 4.1 API 클라이언트 구조

#### lib/api-client.ts
```typescript
import axios, { AxiosInstance, AxiosResponse } from 'axios';

interface ApiConfig {
  baseURL: string;
  timeout: number;
}

class ApiClient {
  private client: AxiosInstance;

  constructor(config: ApiConfig) {
    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // 요청 인터셉터
    this.client.interceptors.request.use(
      (config) => {
        // JWT 토큰 추가
        const token = localStorage.getItem('authToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // 응답 인터셉터
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // 토큰 만료 시 로그아웃 처리
          localStorage.removeItem('authToken');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  // System API
  async getSystemStatus() {
    const response = await this.client.get('/api/system-status');
    return response.data;
  }

  async getServices() {
    const response = await this.client.get('/api/services');
    return response.data;
  }

  // Uptime API
  async getServiceUptime(serviceId: string, months = 3, startDate?: string) {
    const params = new URLSearchParams({ months: months.toString() });
    if (startDate) params.append('startDate', startDate);
    
    const response = await this.client.get(`/api/uptime/${serviceId}?${params}`);
    return response.data;
  }

  // Incident API
  async getIncidents() {
    const response = await this.client.get('/api/incidents');
    return response.data;
  }

  async getPastIncidents(days = 30, page = 1, limit = 10) {
    const params = new URLSearchParams({
      days: days.toString(),
      page: page.toString(),
      limit: limit.toString()
    });
    
    const response = await this.client.get(`/api/incidents/past?${params}`);
    return response.data;
  }

  async createIncident(data: CreateIncidentData) {
    const response = await this.client.post('/api/incidents', data);
    return response.data;
  }

  async updateIncident(id: string, data: UpdateIncidentData) {
    const response = await this.client.put(`/api/incidents/${id}`, data);
    return response.data;
  }

  async addIncidentUpdate(id: string, status: string, description: string) {
    const response = await this.client.post(`/api/incidents/${id}/updates`, {
      status,
      description
    });
    return response.data;
  }
}

// 인스턴스 생성
export const apiClient = new ApiClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  timeout: 10000
});

// TypeScript 타입 정의
export interface CreateIncidentData {
  title: string;
  description?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  priority: 'P1' | 'P2' | 'P3';
  affectedServices: string[];
  reporter?: string;
  detectionCriteria?: string;
}

export interface UpdateIncidentData {
  title?: string;
  description?: string;
  status?: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  severity?: 'low' | 'medium' | 'high' | 'critical';
}
```

### 4.2 상태 관리 패턴

#### hooks/use-system-status.ts
```typescript
import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import { useSocket } from './use-socket';

export interface SystemStatus {
  overallStatus: 'operational' | 'degraded' | 'outage';
  lastUpdated: string;
  services: Service[];
}

export interface Service {
  id: string;
  name: string;
  status: 'operational' | 'degraded' | 'outage';
  uptime: string;
  uptimeData: string[];
}

export const useSystemStatus = () => {
  const [data, setData] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const socket = useSocket();

  useEffect(() => {
    const fetchSystemStatus = async () => {
      try {
        setLoading(true);
        const response = await apiClient.getSystemStatus();
        setData(response);
        setError(null);
      } catch (err) {
        setError('Failed to fetch system status');
        console.error('System status fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSystemStatus();
  }, []);

  // WebSocket 실시간 업데이트
  useEffect(() => {
    if (!socket) return;

    // 시스템 상태 룸 참가
    socket.emit('join-room', { room: 'system-status' });

    // 상태 업데이트 리스너
    const handleStatusUpdate = ({ serviceId, status, timestamp }: any) => {
      setData(prev => {
        if (!prev) return prev;
        
        return {
          ...prev,
          lastUpdated: timestamp,
          services: prev.services.map(service =>
            service.id === serviceId
              ? { ...service, status }
              : service
          )
        };
      });
    };

    socket.on('status-update', handleStatusUpdate);

    return () => {
      socket.off('status-update', handleStatusUpdate);
      socket.emit('leave-room', { room: 'system-status' });
    };
  }, [socket]);

  return { data, loading, error, refetch: () => window.location.reload() };
};
```

#### hooks/use-socket.ts
```typescript
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export const useSocket = () => {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const socketInstance = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001', {
      transports: ['websocket'],
      autoConnect: true
    });

    socketInstance.on('connect', () => {
      console.log('Socket connected:', socketInstance.id);
    });

    socketInstance.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    socketInstance.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  return socket;
};
```

### 4.3 실시간 업데이트 구현

#### verify-main SystemStatus 컴포넌트 수정
```typescript
// src/components/sections/system-status.tsx
import React from 'react';
import { useSystemStatus } from '@/hooks/use-system-status';

// 기존 하드코딩된 데이터 제거
// const servicesData = [...];

const SystemStatus = () => {
  const { data: systemStatus, loading, error } = useSystemStatus();

  if (loading) {
    return (
      <div className="max-w-[850px] mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-12">
        <div className="animate-pulse">
          <div className="bg-gray-200 h-16 rounded-sm mb-5"></div>
          <div className="bg-gray-200 h-64 rounded-sm"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-[850px] mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-12">
        <div className="bg-red-50 border border-red-200 rounded-sm p-4">
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!systemStatus) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'operational': return 'bg-primary';
      case 'degraded': return 'bg-yellow-500';
      case 'outage': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'operational': return 'All Systems Operational';
      case 'degraded': return 'Degraded Performance';
      case 'outage': return 'Service Outage';
      default: return 'Unknown Status';
    }
  };

  return (
    <div className="max-w-[850px] mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-12">
      <div className={`text-primary-foreground text-center py-4 rounded-sm mb-5 ${getStatusColor(systemStatus.overallStatus)}`}>
        <h2 className="text-2xl font-bold">
          Verify {getStatusText(systemStatus.overallStatus)}
        </h2>
      </div>

      <div className="text-right text-xs text-muted mb-3 pr-1">
        Uptime over the past 90 days. 
        <a href="http://localhost:3001" className="text-link-blue hover:underline ml-1">
          View historical uptime.
        </a>
      </div>
      
      <div className="bg-card border border-border rounded-sm">
        {systemStatus.services.map((service, index) => (
          <ServiceStatusCard
            key={service.id}
            name={service.name}
            status={service.status}
            uptimePercentage={service.uptime}
            uptimeData={service.uptimeData}
            isLast={index === systemStatus.services.length - 1}
          />
        ))}
      </div>
    </div>
  );
};

// ServiceStatusCard 컴포넌트도 API 데이터에 맞게 수정
interface ServiceStatusCardProps {
  name: string;
  status: string;
  uptimePercentage: string;
  uptimeData: string[];
  isLast?: boolean;
}

const ServiceStatusCard: React.FC<ServiceStatusCardProps> = ({ 
  name, 
  status, 
  uptimePercentage, 
  uptimeData, 
  isLast 
}) => {
  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'operational': return 'Operational';
      case 'degraded': return 'Degraded';
      case 'outage': return 'Outage';
      default: return 'Unknown';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'operational': return 'text-primary';
      case 'degraded': return 'text-yellow-600';
      case 'outage': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className={`px-6 py-5 ${!isLast ? 'border-b border-border' : ''}`}>
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-medium text-foreground">{name}</h3>
        <p className={`text-sm font-medium ${getStatusColor(status)}`}>
          {getStatusDisplay(status)}
        </p>
      </div>
      <div className="flex items-center gap-px">
        {uptimeData.map((statusCode, index) => (
          <UptimeBar key={`${name}-bar-${index}`} status={statusCode as any} />
        ))}
      </div>
      <div className="flex justify-between items-center mt-2 text-xs text-muted">
        <span>90 days ago</span>
        <span className="font-medium text-foreground">{uptimePercentage}% uptime</span>
        <span>Today</span>
      </div>
    </div>
  );
};

export default SystemStatus;
```

### 4.4 에러 처리 전략

#### lib/error-handler.ts
```typescript
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const handleApiError = (error: any): ApiError => {
  if (error.response) {
    // 서버에서 응답이 온 경우
    const { status, data } = error.response;
    return new ApiError(
      data.message || data.error || 'API request failed',
      status,
      data.code
    );
  } else if (error.request) {
    // 요청이 전송되었지만 응답을 받지 못한 경우
    return new ApiError('Network error - no response received', 0, 'NETWORK_ERROR');
  } else {
    // 기타 에러
    return new ApiError(error.message || 'Unknown error occurred', 0, 'UNKNOWN_ERROR');
  }
};

export const getErrorMessage = (error: ApiError): string => {
  switch (error.code) {
    case 'NETWORK_ERROR':
      return 'Network connection failed. Please check your internet connection.';
    case 'VALIDATION_ERROR':
      return 'Invalid data provided. Please check your input.';
    case 'UNAUTHORIZED':
      return 'Authentication required. Please log in.';
    case 'FORBIDDEN':
      return 'Access denied. Insufficient permissions.';
    case 'NOT_FOUND':
      return 'Requested resource not found.';
    case 'SERVER_ERROR':
      return 'Server error occurred. Please try again later.';
    default:
      return error.message || 'An unexpected error occurred.';
  }
};
```

---

## 5. 데이터베이스 설계

### 5.1 ERD 및 관계 정의
```
┌─────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  services   │    │  uptime_records  │    │ api_response_    │
│             │◄───┤                  │    │ times            │
│ • id (PK)   │    │ • service_id(FK) │    │ • service_id(FK) │
│ • name      │    │ • date           │    │ • response_time  │
│ • endpoint  │    │ • status         │    │ • status_code    │
└─────────────┘    │ • response_time  │    │ • timestamp      │
       ▲           └──────────────────┘    └──────────────────┘
       │           
       │           ┌──────────────────┐    ┌──────────────────┐
       │           │ api_call_logs    │    │ watch_server_    │
       └───────────┤                  │    │ logs             │
                   │ • service_id(FK) │    │ • service_id(FK) │
                   │ • date           │    │ • check_time     │
                   │ • total_calls    │    │ • is_success     │
                   └──────────────────┘    └──────────────────┘

┌─────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ incidents   │    │ incident_updates │    │ incident_        │
│             │────┤                  │    │ services         │
│ • id (PK)   │    │ • incident_id(FK)│◄───┤ • incident_id(FK)│
│ • title     │    │ • status         │    │ • service_id(FK) │
│ • status    │    │ • description    │    │                  │
│ • priority  │    │ • created_at     │    │                  │
└─────────────┘    └──────────────────┘    └──────────────────┘
                                                  │
                                                  ▼
                                           ┌─────────────┐
                                           │  services   │
                                           │             │
                                           └─────────────┘
```

### 5.2 인덱스 전략
```sql
-- 성능 최적화를 위한 인덱스
CREATE INDEX idx_uptime_service_date ON uptime_records(service_id, date DESC);
CREATE INDEX idx_api_response_times_service_time ON api_response_times(service_id, timestamp DESC);
CREATE INDEX idx_api_response_times_status ON api_response_times(status_code, timestamp DESC);
CREATE INDEX idx_api_call_logs_service_date ON api_call_logs(service_id, date DESC);
CREATE INDEX idx_watch_server_logs_service_time ON watch_server_logs(service_id, check_time DESC);
CREATE INDEX idx_watch_server_logs_success ON watch_server_logs(is_success, check_time DESC);

-- 인시던트 관련 인덱스
CREATE INDEX idx_incidents_status ON incidents(status, created_at DESC);
CREATE INDEX idx_incidents_priority ON incidents(priority, created_at DESC);
CREATE INDEX idx_incident_updates_incident ON incident_updates(incident_id, created_at DESC);

-- 시스템 상태 인덱스
CREATE INDEX idx_system_status_created ON system_status(created_at DESC);

-- 사용자 관련 인덱스
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_active ON users(is_active);
```

### 5.3 마이그레이션 전략

#### prisma/migrations/001_initial_schema.sql
```sql
-- 초기 스키마 생성
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Services 테이블
CREATE TABLE services (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    endpoint_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 초기 서비스 데이터 삽입
INSERT INTO services (id, name, description, endpoint_url) VALUES
('id-recognition', 'ID Recognition', 'Identity Document Recognition Service', 'https://api.verify.com/id-recognition'),
('face-liveness', 'Face Liveness', 'Face Liveness Detection Service', 'https://api.verify.com/face-liveness'),
('id-liveness', 'ID Liveness', 'ID Document Liveness Service', 'https://api.verify.com/id-liveness'),
('face-compare', 'Face Compare', 'Face Comparison Service', 'https://api.verify.com/face-compare'),
('curp-verifier', 'Curp Verifier', 'CURP Verification Service', 'https://api.verify.com/curp-verifier');

-- 나머지 테이블들...
-- (전체 스키마는 prisma/schema.prisma에서 자동 생성됨)
```

#### 시드 데이터 생성 (prisma/seeds/index.ts)
```typescript
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // 서비스 데이터 (이미 마이그레이션에서 생성됨)
  
  // 기본 사용자 생성
  const hashedPassword = await bcrypt.hash('admin123', 10);
  
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@verify.com',
      password: hashedPassword,
      role: 'admin'
    }
  });

  await prisma.user.upsert({
    where: { username: 'reporter' },
    update: {},
    create: {
      username: 'reporter',
      email: 'reporter@verify.com',
      password: await bcrypt.hash('reporter123', 10),
      role: 'reporter'
    }
  });

  // 초기 시스템 상태
  await prisma.systemStatus.create({
    data: {
      overallStatus: 'operational',
      message: 'All systems operational'
    }
  });

  // 샘플 업타임 데이터 생성 (최근 30일)
  const services = await prisma.service.findMany();
  const today = new Date();
  
  for (const service of services) {
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      // 대부분 정상 상태, 가끔 장애
      const random = Math.random();
      let status = 'o'; // operational
      
      if (random < 0.02) status = 'mo'; // 2% major outage
      else if (random < 0.05) status = 'po'; // 3% partial outage
      
      await prisma.uptimeRecord.create({
        data: {
          serviceId: service.id,
          date,
          status,
          responseTime: Math.floor(Math.random() * 2000) + 500, // 500-2500ms
        }
      });
    }
  }

  console.log('Seed data created successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

---

## 6. 보안 및 성능 요구사항

### 6.1 JWT 인증 구현

#### services/authService.ts
```typescript
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const REFRESH_TOKEN_EXPIRES_IN = '7d';

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    username: string;
    email: string;
    role: string;
  };
}

class AuthService {
  async login(credentials: LoginCredentials): Promise<AuthTokens> {
    const user = await prisma.user.findUnique({
      where: { username: credentials.username }
    });

    if (!user || !user.isActive) {
      throw new Error('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(credentials.password, user.password);
    if (!isPasswordValid) {
      throw new Error('Invalid credentials');
    }

    // 로그인 시간 업데이트
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    // JWT 토큰 생성
    const accessToken = jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        role: user.role 
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      { id: user.id },
      JWT_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    };
  }

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    try {
      const decoded = jwt.verify(refreshToken, JWT_SECRET) as any;
      const user = await prisma.user.findUnique({
        where: { id: decoded.id }
      });

      if (!user || !user.isActive) {
        throw new Error('Invalid refresh token');
      }

      // 새 토큰 생성
      const accessToken = jwt.sign(
        { 
          id: user.id, 
          username: user.username, 
          role: user.role 
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      const newRefreshToken = jwt.sign(
        { id: user.id },
        JWT_SECRET,
        { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
      );

      return {
        accessToken,
        refreshToken: newRefreshToken,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      };
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  async logout(userId: string): Promise<void> {
    // 필요시 토큰 블랙리스트 구현
    // 현재는 클라이언트에서 토큰 삭제로 처리
  }
}

export const authService = new AuthService();
```

### 6.2 Rate Limiting

#### middleware/rateLimit.ts
```typescript
import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

// 일반 API 요청 제한
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 100, // IP당 15분에 100회
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// 로그인 요청 제한 (더 엄격)
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 5, // IP당 15분에 5회
  message: {
    error: 'Too many login attempts, please try again later.',
    retryAfter: '15 minutes'
  },
  skipSuccessfulRequests: true // 성공한 요청은 카운트에서 제외
});

// 인시던트 생성 제한
export const incidentCreationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1분
  max: 10, // 1분에 10개
  message: {
    error: 'Too many incidents created, please slow down.',
    retryAfter: '1 minute'
  }
});

// WebSocket 연결 제한
export const socketConnectionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1분
  max: 30, // 1분에 30회 연결
  message: {
    error: 'Too many socket connections, please try again later.',
    retryAfter: '1 minute'
  }
});
```

### 6.3 캐싱 전략

#### middleware/cache.ts
```typescript
import { Request, Response, NextFunction } from 'express';

interface CacheOptions {
  duration: number; // seconds
  varyBy?: string[]; // 캐시 키 구분 기준
}

// 메모리 캐시 (프로덕션에서는 Redis 사용 권장)
const cache = new Map<string, { data: any; expiry: number }>();

export const cacheMiddleware = (options: CacheOptions) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // 캐시 키 생성
    const baseKey = `${req.method}:${req.path}`;
    const varyKeys = options.varyBy?.map(key => req.query[key] || req.params[key]).join(':') || '';
    const cacheKey = varyKeys ? `${baseKey}:${varyKeys}` : baseKey;

    // 캐시 확인
    const cached = cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached.data);
    }

    // 응답 캐싱
    const originalJson = res.json;
    res.json = function(data: any) {
      cache.set(cacheKey, {
        data,
        expiry: Date.now() + options.duration * 1000
      });
      res.setHeader('X-Cache', 'MISS');
      return originalJson.call(this, data);
    };

    next();
  };
};

// 캐시 무효화
export const invalidateCache = (pattern: string) => {
  for (const key of cache.keys()) {
    if (key.includes(pattern)) {
      cache.delete(key);
    }
  }
};

// 사용 예시
export const systemStatusCache = cacheMiddleware({ 
  duration: 60, // 1분 캐싱
  varyBy: ['serviceId'] 
});

export const uptimeDataCache = cacheMiddleware({ 
  duration: 300, // 5분 캐싱
  varyBy: ['serviceId', 'months', 'startDate'] 
});
```

### 6.4 모니터링 및 로깅

#### utils/logger.ts
```typescript
import winston from 'winston';

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'verify-monitor-api' },
  transports: [
    // 콘솔 출력
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    
    // 파일 출력
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log' 
    })
  ]
});

// 프로덕션 환경에서는 파일 로깅만
if (process.env.NODE_ENV === 'production') {
  logger.clear();
  logger.add(new winston.transports.File({ 
    filename: 'logs/error.log', 
    level: 'error' 
  }));
  logger.add(new winston.transports.File({ 
    filename: 'logs/combined.log' 
  }));
}

// 요청 로깅 미들웨어
export const requestLogger = (req: any, res: any, next: any) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP Request', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
  });
  
  next();
};
```

---

## 7. 개발 환경 설정

### 7.1 Docker Compose 구성

#### docker-compose.yml
```yaml
version: '3.8'

services:
  # PostgreSQL 데이터베이스
  postgres:
    image: postgres:14-alpine
    container_name: sla-monitor-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: sla_monitor
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password123
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./docker/postgres-init:/docker-entrypoint-initdb.d
    networks:
      - sla-monitor-network

  # Redis (캐싱용 - 선택사항)
  redis:
    image: redis:7-alpine
    container_name: sla-monitor-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - sla-monitor-network

  # Backend API 서버
  api-server:
    build:
      context: ./verify-monitor-api
      dockerfile: docker/Dockerfile
    container_name: verify-monitor-api
    restart: unless-stopped
    ports:
      - "3001:3001"
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://postgres:password123@postgres:5432/sla_monitor
      REDIS_URL: redis://redis:6379
      JWT_SECRET: your-super-secret-jwt-key-here
      PORT: 3001
    depends_on:
      - postgres
      - redis
    volumes:
      - ./verify-monitor-api:/app
      - /app/node_modules
      - ./logs:/app/logs
    networks:
      - sla-monitor-network

  # Watch Server
  watch-server:
    build:
      context: ./watch-server
      dockerfile: docker/Dockerfile
    container_name: sla-monitor-watch
    restart: unless-stopped
    ports:
      - "3008:3008"
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://postgres:password123@postgres:5432/sla_monitor
      API_SERVER_URL: http://api-server:3001
      PORT: 3008
    depends_on:
      - postgres
      - api-server
    volumes:
      - ./watch-server:/app
      - /app/node_modules
      - ./logs:/app/logs
    networks:
      - sla-monitor-network

  # pgAdmin (데이터베이스 관리용 - 선택사항)
  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: sla-monitor-pgadmin
    restart: unless-stopped
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@verify.com
      PGADMIN_DEFAULT_PASSWORD: admin123
    ports:
      - "5050:80"
    depends_on:
      - postgres
    networks:
      - sla-monitor-network

volumes:
  postgres_data:
  redis_data:

networks:
  sla-monitor-network:
    driver: bridge
```

### 7.2 환경 변수 관리

#### .env.example
```bash
# Database
DATABASE_URL="postgresql://postgres:password123@localhost:5432/sla_monitor"

# Redis (optional)
REDIS_URL="redis://localhost:6379"

# JWT
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
JWT_EXPIRES_IN="24h"

# Server
PORT=3001
NODE_ENV=development

# CORS
CLIENT_URLS="http://localhost:80,http://localhost:3001,http://localhost:3005"

# Logging
LOG_LEVEL=info

# Watch Server
WATCH_SERVER_PORT=3008
HEALTH_CHECK_INTERVAL="* * * * *"  # 1분마다
HEALTH_CHECK_TIMEOUT=7000  # 7초

# Monitoring Services (Watch Server용)
ID_RECOGNITION_ENDPOINT="https://api.verify.com/id-recognition/health"
FACE_LIVENESS_ENDPOINT="https://api.verify.com/face-liveness/health"
ID_LIVENESS_ENDPOINT="https://api.verify.com/id-liveness/health"
FACE_COMPARE_ENDPOINT="https://api.verify.com/face-compare/health"
CURP_VERIFIER_ENDPOINT="https://api.verify.com/curp-verifier/health"

# Email Notifications (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=notifications@verify.com
SMTP_PASS=your-email-password

# Slack Notifications (optional)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

### 7.3 CI/CD 파이프라인

#### .github/workflows/ci.yml
```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_DB: sla_monitor_test
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install Backend Dependencies
      working-directory: ./verify-monitor-api
      run: npm ci
    
    - name: Install Watch Server Dependencies
      working-directory: ./watch-server
      run: npm ci
    
    - name: Run Database Migration
      working-directory: ./verify-monitor-api
      run: |
        npx prisma migrate deploy
        npx prisma db seed
      env:
        DATABASE_URL: postgresql://postgres:postgres@localhost:5432/sla_monitor_test
    
    - name: Run Backend Tests
      working-directory: ./verify-monitor-api
      run: npm test
      env:
        DATABASE_URL: postgresql://postgres:postgres@localhost:5432/sla_monitor_test
        JWT_SECRET: test-secret
    
    - name: Run Watch Server Tests
      working-directory: ./watch-server
      run: npm test
      env:
        DATABASE_URL: postgresql://postgres:postgres@localhost:5432/sla_monitor_test
    
    - name: Run Frontend Tests
      working-directory: ./verify-main
      run: |
        npm ci
        npm run build
        npm run lint
    
    - name: Check TypeScript
      run: |
        cd verify-monitor-api && npx tsc --noEmit
        cd ../watch-server && npx tsc --noEmit

  build:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Build Docker Images
      run: |
        docker build -t verify-monitor-api:latest ./verify-monitor-api
        docker build -t watch-server:latest ./watch-server
    
    - name: Run Security Scan
      run: |
        docker run --rm -v "$PWD":/app securecodewarrior/docker-image-scanner:latest /app
```

---

## 8. 테스트 전략

### 8.1 단위 테스트

#### tests/unit/services/systemService.test.ts
```typescript
import { systemService } from '../../../src/services/systemService';
import { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended';

jest.mock('@prisma/client');

const prismaMock = mockDeep<PrismaClient>();

describe('SystemService', () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  describe('getOverallStatus', () => {
    it('should return the latest system status', async () => {
      const mockSystemStatus = {
        id: 1,
        overallStatus: 'operational',
        message: 'All systems operational',
        createdAt: new Date()
      };

      prismaMock.systemStatus.findFirst.mockResolvedValue(mockSystemStatus);

      const result = await systemService.getOverallStatus();

      expect(result).toEqual(mockSystemStatus);
      expect(prismaMock.systemStatus.findFirst).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' }
      });
    });

    it('should return default status when no status exists', async () => {
      prismaMock.systemStatus.findFirst.mockResolvedValue(null);

      const result = await systemService.getOverallStatus();

      expect(result.overallStatus).toBe('operational');
      expect(result.message).toBe('System status unknown');
    });
  });

  describe('getAllServicesStatus', () => {
    it('should return services with current status and uptime data', async () => {
      const mockServices = [
        { id: 'id-recognition', name: 'ID Recognition' },
        { id: 'face-liveness', name: 'Face Liveness' }
      ];

      const mockUptimeRecords = [
        { serviceId: 'id-recognition', status: 'o', date: new Date() },
        { serviceId: 'face-liveness', status: 'po', date: new Date() }
      ];

      prismaMock.service.findMany.mockResolvedValue(mockServices);
      prismaMock.uptimeRecord.findMany.mockResolvedValue(mockUptimeRecords);

      const result = await systemService.getAllServicesStatus();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('id-recognition');
      expect(result[0].currentStatus).toBe('operational');
      expect(result[1].currentStatus).toBe('degraded');
    });
  });
});
```

### 8.2 통합 테스트

#### tests/integration/api/system.test.ts
```typescript
import request from 'supertest';
import { app } from '../../../src/app';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('/api/system-status', () => {
  beforeAll(async () => {
    // 테스트 데이터 설정
    await prisma.service.createMany({
      data: [
        { id: 'test-service-1', name: 'Test Service 1' },
        { id: 'test-service-2', name: 'Test Service 2' }
      ]
    });

    await prisma.systemStatus.create({
      data: {
        overallStatus: 'operational',
        message: 'Test status'
      }
    });
  });

  afterAll(async () => {
    // 테스트 데이터 정리
    await prisma.service.deleteMany({
      where: { id: { in: ['test-service-1', 'test-service-2'] } }
    });
    await prisma.systemStatus.deleteMany();
    await prisma.$disconnect();
  });

  it('GET /api/system-status should return system status', async () => {
    const response = await request(app)
      .get('/api/system-status')
      .expect(200);

    expect(response.body).toHaveProperty('overallStatus', 'operational');
    expect(response.body).toHaveProperty('services');
    expect(Array.isArray(response.body.services)).toBe(true);
  });

  it('GET /api/services should return services list', async () => {
    const response = await request(app)
      .get('/api/services')
      .expect(200);

    expect(response.body).toHaveProperty('services');
    expect(response.body.services).toContainEqual({
      id: 'all-systems',
      name: 'All Systems'
    });
  });
});
```

### 8.3 E2E 테스트

#### tests/e2e/health-monitoring.test.ts
```typescript
import { PrismaClient } from '@prisma/client';
import { healthChecker } from '../../watch-server/src/monitors/healthChecker';
import { metricsCollector } from '../../watch-server/src/monitors/metricsCollector';

const prisma = new PrismaClient();

describe('Health Monitoring E2E', () => {
  it('should monitor service health and update database', async () => {
    // Mock 서비스 설정
    const mockService = {
      id: 'test-service',
      name: 'Test Service',
      endpoint: 'http://httpbin.org/status/200'
    };

    // 헬스체크 실행
    const result = await healthChecker.checkService(mockService);

    expect(result.isSuccess).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.responseTime).toBeGreaterThan(0);

    // 메트릭 기록
    await metricsCollector.recordHealthCheck(result);

    // 데이터베이스 확인
    const watchLog = await prisma.watchServerLog.findFirst({
      where: { serviceId: mockService.id },
      orderBy: { checkTime: 'desc' }
    });

    expect(watchLog).toBeTruthy();
    expect(watchLog?.isSuccess).toBe(true);

    const uptimeRecord = await prisma.uptimeRecord.findFirst({
      where: { serviceId: mockService.id },
      orderBy: { date: 'desc' }
    });

    expect(uptimeRecord).toBeTruthy();
    expect(uptimeRecord?.status).toBe('o');
  }, 10000);

  it('should handle service failures correctly', async () => {
    const mockService = {
      id: 'test-service-fail',
      name: 'Test Service Fail',
      endpoint: 'http://httpbin.org/status/500'
    };

    const result = await healthChecker.checkService(mockService);

    expect(result.isSuccess).toBe(false);
    expect(result.statusCode).toBe(500);
    expect(result.errorType).toBe('http_error');

    await metricsCollector.recordHealthCheck(result);

    const watchLog = await prisma.watchServerLog.findFirst({
      where: { serviceId: mockService.id },
      orderBy: { checkTime: 'desc' }
    });

    expect(watchLog?.isSuccess).toBe(false);
    expect(watchLog?.errorType).toBe('http_error');
  }, 10000);
});
```

---

## 9. 배포 가이드

### 9.1 프로덕션 환경 구성

#### docker/production/docker-compose.prod.yml
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:14-alpine
    restart: always
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_prod_data:/var/lib/postgresql/data
    networks:
      - sla-monitor-prod
    # 외부 포트 노출 안함 (보안)

  redis:
    image: redis:7-alpine
    restart: always
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_prod_data:/data
    networks:
      - sla-monitor-prod

  api-server:
    image: verify-monitor-api:${VERSION}
    restart: always
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      JWT_SECRET: ${JWT_SECRET}
      PORT: 3001
    depends_on:
      - postgres
      - redis
    networks:
      - sla-monitor-prod
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  watch-server:
    image: watch-server:${VERSION}
    restart: always
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      API_SERVER_URL: http://api-server:3001
      PORT: 3008
    depends_on:
      - postgres
      - api-server
    networks:
      - sla-monitor-prod

  nginx:
    image: nginx:alpine
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/ssl/certs
    depends_on:
      - api-server
    networks:
      - sla-monitor-prod

volumes:
  postgres_prod_data:
  redis_prod_data:

networks:
  sla-monitor-prod:
    driver: bridge
```

### 9.2 Nginx 설정

#### docker/production/nginx.conf
```nginx
events {
    worker_connections 1024;
}

http {
    upstream api_backend {
        server api-server:3001;
    }

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=login:10m rate=1r/s;

    server {
        listen 80;
        server_name api.verify.com;
        
        # Redirect HTTP to HTTPS
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name api.verify.com;

        # SSL Configuration
        ssl_certificate /etc/ssl/certs/fullchain.pem;
        ssl_certificate_key /etc/ssl/certs/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;

        # Security headers
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header X-XSS-Protection "1; mode=block";
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";

        # API routes
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            
            proxy_pass http://api_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # WebSocket support
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }

        # Login endpoint (stricter rate limiting)
        location /api/auth/login {
            limit_req zone=login burst=5 nodelay;
            
            proxy_pass http://api_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Health check
        location /health {
            proxy_pass http://api_backend;
            access_log off;
        }
    }
}
```

### 9.3 스케일링 전략

#### docker/scaling/docker-compose.scale.yml
```yaml
version: '3.8'

services:
  api-server:
    deploy:
      replicas: 3
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
        reservations:
          memory: 256M
          cpus: '0.25'
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3

  watch-server:
    deploy:
      replicas: 2
      resources:
        limits:
          memory: 256M
          cpus: '0.25'
        reservations:
          memory: 128M
          cpus: '0.1'

  postgres:
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '1.0'
        reservations:
          memory: 512M
          cpus: '0.5'

  redis:
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: '0.25'
        reservations:
          memory: 128M
          cpus: '0.1'
```

---

## 10. 코드 예제 및 템플릿

### 10.1 API 엔드포인트 예제

#### controllers/templateController.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { templateService } from '../services/templateService';
import { logger } from '../utils/logger';

// 요청 스키마 정의
const createTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  data: z.record(z.any())
});

const updateTemplateSchema = createTemplateSchema.partial();

export class TemplateController {
  // GET /api/templates
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const { page = 1, limit = 10, search } = req.query;
      
      const result = await templateService.findMany({
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        search: search as string
      });

      res.json({
        data: result.data,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / result.limit)
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/templates/:id
  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const template = await templateService.findById(id);

      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }

      res.json({ data: template });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/templates
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = createTemplateSchema.parse(req.body);
      const template = await templateService.create(data);

      logger.info('Template created', { templateId: template.id, userId: req.user?.id });

      res.status(201).json({ data: template });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: 'Validation failed', 
          details: error.errors 
        });
      }
      next(error);
    }
  }

  // PUT /api/templates/:id
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const data = updateTemplateSchema.parse(req.body);

      const template = await templateService.update(id, data);

      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }

      logger.info('Template updated', { templateId: id, userId: req.user?.id });

      res.json({ data: template });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: 'Validation failed', 
          details: error.errors 
        });
      }
      next(error);
    }
  }

  // DELETE /api/templates/:id
  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const deleted = await templateService.delete(id);

      if (!deleted) {
        return res.status(404).json({ error: 'Template not found' });
      }

      logger.info('Template deleted', { templateId: id, userId: req.user?.id });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}

export const templateController = new TemplateController();
```

### 10.2 WebSocket 핸들러 예제

#### sockets/templateHandler.ts
```typescript
import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger';

interface TemplateUpdateEvent {
  templateId: string;
  data: any;
  userId: string;
  timestamp: string;
}

export const setupTemplateHandlers = (io: Server, socket: Socket) => {
  // 템플릿 룸 참가
  socket.on('join-template', async ({ templateId }: { templateId: string }) => {
    await socket.join(`template-${templateId}`);
    
    logger.info('User joined template room', {
      socketId: socket.id,
      templateId,
      userId: socket.data.userId
    });

    // 현재 접속자 수 브로드캐스트
    const room = io.sockets.adapter.rooms.get(`template-${templateId}`);
    const userCount = room ? room.size : 0;
    
    io.to(`template-${templateId}`).emit('user-count-updated', { 
      templateId, 
      userCount 
    });
  });

  // 템플릿 룸 떠나기
  socket.on('leave-template', ({ templateId }: { templateId: string }) => {
    socket.leave(`template-${templateId}`);
    
    logger.info('User left template room', {
      socketId: socket.id,
      templateId,
      userId: socket.data.userId
    });

    // 현재 접속자 수 업데이트
    const room = io.sockets.adapter.rooms.get(`template-${templateId}`);
    const userCount = room ? room.size : 0;
    
    io.to(`template-${templateId}`).emit('user-count-updated', { 
      templateId, 
      userCount 
    });
  });

  // 템플릿 실시간 업데이트
  socket.on('template-update', (event: TemplateUpdateEvent) => {
    const roomName = `template-${event.templateId}`;
    
    // 발신자 제외하고 브로드캐스트
    socket.to(roomName).emit('template-updated', {
      ...event,
      timestamp: new Date().toISOString()
    });

    logger.info('Template update broadcasted', {
      templateId: event.templateId,
      userId: event.userId,
      roomSize: io.sockets.adapter.rooms.get(roomName)?.size || 0
    });
  });

  // 연결 해제 처리
  socket.on('disconnect', () => {
    logger.info('Socket disconnected', {
      socketId: socket.id,
      userId: socket.data.userId
    });
  });
};
```

### 10.3 Prisma 스키마 예제

#### prisma/schema.example.prisma
```prisma
// 새 모델 추가 시 참고용 템플릿

model Template {
  id          String   @id @default(cuid())
  name        String   @db.VarChar(100)
  description String?
  data        Json     // 동적 데이터 저장
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  createdBy   String   @map("created_by") @db.VarChar(50)

  // Relations
  creator User @relation(fields: [createdBy], references: [id])
  
  // Indexes
  @@index([createdBy])
  @@index([isActive, createdAt])
  @@map("templates")
}

// Many-to-Many 관계 예제
model TemplateCategory {
  templateId String @map("template_id")
  categoryId String @map("category_id")
  assignedAt DateTime @default(now()) @map("assigned_at")

  template Template @relation(fields: [templateId], references: [id])
  category Category @relation(fields: [categoryId], references: [id])

  @@id([templateId, categoryId])
  @@map("template_categories")
}

// 열거형 사용 예제
enum NotificationStatus {
  PENDING
  SENT
  FAILED
  
  @@map("notification_status")
}

model Notification {
  id        String             @id @default(cuid())
  status    NotificationStatus @default(PENDING)
  message   String
  sentAt    DateTime?          @map("sent_at")
  createdAt DateTime           @default(now()) @map("created_at")

  @@map("notifications")
}
```

---

## 11. 마무리

이 TRD 문서는 PRD.md를 기반으로 한 완전한 기술 구현 가이드입니다. 

### 구현 우선순위
1. **Backend API 서버** (1-2주)
2. **데이터베이스 설정 및 마이그레이션** (3일)
3. **프론트엔드 API 연동** (1주)
4. **Watch Server** (3-5일)
5. **배포 및 모니터링** (2-3일)

### 주요 고려사항
- **보안**: JWT 인증, Rate Limiting, HTTPS 필수
- **성능**: 캐싱, 인덱싱, 커넥션 풀링
- **확장성**: Docker, 로드밸런싱, 수평 확장
- **모니터링**: 로깅, 헬스체크, 알림 시스템

이 문서를 따라 구현하면 PRD.md에서 요구하는 모든 기능을 완전히 구현할 수 있습니다.
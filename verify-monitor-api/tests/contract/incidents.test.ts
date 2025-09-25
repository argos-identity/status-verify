import request from 'supertest';
import { Express } from 'express';
import { prisma } from '../setup';

let app: Express;

describe('Contract Test: /api/incidents endpoints', () => {
  beforeAll(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      app = require('../../src/app').default;
    } catch (error) {
      console.log('App not implemented yet - tests will fail as expected (TDD)');
    }
  });

  beforeEach(async () => {
    // Create test users with different roles
    await prisma.user.createMany({
      data: [
        {
          id: 'user-viewer',
          username: 'viewer',
          email: 'viewer@example.com',
          password_hash: '$2b$12$hash-for-password123', // bcrypt hash of "password123"
          role: 'viewer',
        },
        {
          id: 'user-reporter',
          username: 'reporter',
          email: 'reporter@example.com',
          password_hash: '$2b$12$hash-for-password123',
          role: 'reporter',
        },
        {
          id: 'user-admin',
          username: 'admin',
          email: 'admin@example.com',
          password_hash: '$2b$12$hash-for-password123',
          role: 'admin',
        },
      ],
    });

    // Create test services
    await prisma.service.createMany({
      data: [
        {
          id: 'id-recognition',
          name: 'ID Recognition',
        },
        {
          id: 'face-liveness',
          name: 'Face Liveness',
        },
      ],
    });

    // Create test incidents
    await prisma.incident.createMany({
      data: [
        {
          id: 'inc-2025-001',
          title: '서비스 응답 지연',
          description: 'ID Recognition 서비스에서 응답 시간이 평균 15초 이상 지연되고 있습니다.',
          status: 'investigating',
          severity: 'high',
          priority: 'P2',
          affected_services: ['id-recognition'],
          reporter: '모니터링 시스템',
          detection_criteria: '연속 3회 7초 초과',
        },
        {
          id: 'inc-2025-002',
          title: '인증 시스템 장애',
          description: 'Face Liveness 인증 시스템에서 502 에러가 발생하고 있습니다.',
          status: 'identified',
          severity: 'critical',
          priority: 'P1',
          affected_services: ['face-liveness'],
          reporter: '운영팀',
        },
        {
          id: 'inc-2025-003',
          title: '성능 저하',
          description: '전반적인 시스템 성능이 저하되고 있습니다.',
          status: 'resolved',
          severity: 'medium',
          priority: 'P3',
          affected_services: ['id-recognition', 'face-liveness'],
          resolved_at: new Date(),
        },
      ],
    });
  });

  describe('GET /api/incidents', () => {
    it('should return incidents list with authentication', async () => {
      if (!app) {
        expect(app).toBeDefined();
        return;
      }

      // First login to get JWT token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'reporter',
          password: 'password123',
        })
        .expect(200);

      const token = loginResponse.body.accessToken;

      // Then get incidents
      const response = await request(app)
        .get('/api/incidents')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Verify response structure
      expect(response.body).toHaveProperty('incidents');
      expect(response.body).toHaveProperty('pagination');

      expect(Array.isArray(response.body.incidents)).toBe(true);
      expect(response.body.incidents.length).toBe(3);

      // Verify incident structure
      response.body.incidents.forEach((incident: any) => {
        expect(incident).toHaveProperty('id');
        expect(incident).toHaveProperty('title');
        expect(incident).toHaveProperty('status');
        expect(incident).toHaveProperty('severity');
        expect(incident).toHaveProperty('priority');
        expect(incident).toHaveProperty('createdAt');

        // Verify enum values
        expect(['investigating', 'identified', 'monitoring', 'resolved']).toContain(incident.status);
        expect(['low', 'medium', 'high', 'critical']).toContain(incident.severity);
        expect(['P1', 'P2', 'P3']).toContain(incident.priority);
      });

      // Verify pagination structure
      expect(response.body.pagination).toHaveProperty('page');
      expect(response.body.pagination).toHaveProperty('limit');
      expect(response.body.pagination).toHaveProperty('total');
    });

    it('should require authentication', async () => {
      if (!app) {
        expect(app).toBeDefined();
        return;
      }

      const response = await request(app)
        .get('/api/incidents')
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
    });

    it('should support filtering by status', async () => {
      if (!app) {
        expect(app).toBeDefined();
        return;
      }

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'reporter', password: 'password123' })
        .expect(200);

      const response = await request(app)
        .get('/api/incidents?status=investigating')
        .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
        .expect(200);

      expect(response.body.incidents.length).toBe(1);
      expect(response.body.incidents[0].status).toBe('investigating');
    });

    it('should support pagination', async () => {
      if (!app) {
        expect(app).toBeDefined();
        return;
      }

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'reporter', password: 'password123' })
        .expect(200);

      const response = await request(app)
        .get('/api/incidents?limit=2&offset=1')
        .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
        .expect(200);

      expect(response.body.incidents.length).toBeLessThanOrEqual(2);
      expect(response.body.pagination.limit).toBe(2);
    });
  });

  describe('POST /api/incidents', () => {
    it('should create incident with reporter role', async () => {
      if (!app) {
        expect(app).toBeDefined();
        return;
      }

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'reporter', password: 'password123' })
        .expect(200);

      const newIncident = {
        title: '새로운 장애 보고',
        description: '테스트 장애입니다.',
        severity: 'medium',
        priority: 'P3',
        affected_services: ['id-recognition'],
        reporter: '테스터',
        detection_criteria: '수동 테스트',
      };

      const response = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
        .send(newIncident)
        .expect(201);

      // Verify response structure
      expect(response.body).toHaveProperty('incident');
      const incident = response.body.incident;

      expect(incident.id).toMatch(/^inc-\d{4}-\d{3}$/);
      expect(incident.title).toBe(newIncident.title);
      expect(incident.status).toBe('investigating'); // Default initial status
      expect(incident.severity).toBe(newIncident.severity);
      expect(incident.priority).toBe(newIncident.priority);
      expect(incident.affected_services).toEqual(newIncident.affected_services);
    });

    it('should reject creation with viewer role', async () => {
      if (!app) {
        expect(app).toBeDefined();
        return;
      }

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'viewer', password: 'password123' })
        .expect(200);

      const response = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
        .send({
          title: 'Test incident',
          severity: 'low',
          priority: 'P3',
          affected_services: ['id-recognition'],
        })
        .expect(403);

      expect(response.body).toHaveProperty('error');
    });

    it('should validate required fields', async () => {
      if (!app) {
        expect(app).toBeDefined();
        return;
      }

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'reporter', password: 'password123' })
        .expect(200);

      // Missing required fields
      const response = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
        .send({
          title: 'Test incident',
          // Missing severity, priority, affected_services
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('details');
    });

    it('should validate affected services exist', async () => {
      if (!app) {
        expect(app).toBeDefined();
        return;
      }

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'reporter', password: 'password123' })
        .expect(200);

      const response = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
        .send({
          title: 'Test incident',
          severity: 'low',
          priority: 'P3',
          affected_services: ['non-existent-service'],
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/incidents/{incidentId}', () => {
    it('should return incident details with updates', async () => {
      if (!app) {
        expect(app).toBeDefined();
        return;
      }

      // Create incident update
      await prisma.incidentUpdate.create({
        data: {
          incident_id: 'inc-2025-001',
          status: 'identified',
          description: '원인을 데이터베이스 연결 풀 부족으로 식별했습니다.',
          user_id: 'user-reporter',
        },
      });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'reporter', password: 'password123' })
        .expect(200);

      const response = await request(app)
        .get('/api/incidents/inc-2025-001')
        .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
        .expect(200);

      // Verify incident details
      expect(response.body.incident.id).toBe('inc-2025-001');
      expect(response.body.incident.title).toBe('서비스 응답 지연');

      // Verify updates are included
      expect(response.body).toHaveProperty('updates');
      expect(Array.isArray(response.body.updates)).toBe(true);
      expect(response.body.updates.length).toBe(1);
      
      const update = response.body.updates[0];
      expect(update.status).toBe('identified');
      expect(update.description).toContain('데이터베이스 연결');
    });

    it('should return 404 for non-existent incident', async () => {
      if (!app) {
        expect(app).toBeDefined();
        return;
      }

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'reporter', password: 'password123' })
        .expect(200);

      const response = await request(app)
        .get('/api/incidents/inc-9999-999')
        .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/incidents/{incidentId}', () => {
    it('should update incident with reporter role', async () => {
      if (!app) {
        expect(app).toBeDefined();
        return;
      }

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'reporter', password: 'password123' })
        .expect(200);

      const updateData = {
        status: 'identified',
        description: '원인을 데이터베이스 연결 풀 부족으로 식별했습니다.',
      };

      const response = await request(app)
        .put('/api/incidents/inc-2025-001')
        .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.incident.status).toBe('identified');
    });

    it('should follow status workflow validation', async () => {
      if (!app) {
        expect(app).toBeDefined();
        return;
      }

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'reporter', password: 'password123' })
        .expect(200);

      // Try to skip workflow steps (investigating -> resolved)
      const response = await request(app)
        .put('/api/incidents/inc-2025-001')
        .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
        .send({
          status: 'resolved',
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /api/incidents/{incidentId}', () => {
    it('should delete incident with admin role', async () => {
      if (!app) {
        expect(app).toBeDefined();
        return;
      }

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'password123' })
        .expect(200);

      const response = await request(app)
        .delete('/api/incidents/inc-2025-003')
        .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reject deletion with reporter role', async () => {
      if (!app) {
        expect(app).toBeDefined();
        return;
      }

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'reporter', password: 'password123' })
        .expect(200);

      const response = await request(app)
        .delete('/api/incidents/inc-2025-001')
        .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
        .expect(403);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/incidents/{incidentId}/updates', () => {
    it('should add incident update', async () => {
      if (!app) {
        expect(app).toBeDefined();
        return;
      }

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'reporter', password: 'password123' })
        .expect(200);

      const updateData = {
        status: 'monitoring',
        description: '연결 풀 크기 증가 후 모니터링 중입니다.',
      };

      const response = await request(app)
        .post('/api/incidents/inc-2025-002/updates')
        .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
        .send(updateData)
        .expect(201);

      expect(response.body.update.status).toBe('monitoring');
      expect(response.body.update.description).toContain('모니터링');
      expect(response.body.update.user_id).toBe('user-reporter');
    });

    it('should validate minimum description length', async () => {
      if (!app) {
        expect(app).toBeDefined();
        return;
      }

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'reporter', password: 'password123' })
        .expect(200);

      const response = await request(app)
        .post('/api/incidents/inc-2025-001/updates')
        .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
        .send({
          description: '짧음', // Less than 10 characters
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  it('should respond within 200ms for all endpoints (performance requirement)', async () => {
    if (!app) {
      expect(app).toBeDefined();
      return;
    }

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ username: 'reporter', password: 'password123' })
      .expect(200);

    const token = loginResponse.body.accessToken;

    // Test GET /api/incidents
    let startTime = Date.now();
    await request(app)
      .get('/api/incidents')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Date.now() - startTime).toBeLessThan(200);

    // Test GET /api/incidents/{id}
    startTime = Date.now();
    await request(app)
      .get('/api/incidents/inc-2025-001')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Date.now() - startTime).toBeLessThan(200);
  });
});
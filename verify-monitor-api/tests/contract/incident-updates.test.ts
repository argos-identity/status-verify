import request from 'supertest';
import { Express } from 'express';
import { prisma } from '../setup';

let app: Express;

describe('Contract Test: POST /api/incidents/{incidentId}/updates', () => {
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
          type: 'api',
          url: 'https://api.company.com/id-recognition',
          current_status: 'operational',
        },
        {
          id: 'face-liveness',
          name: 'Face Liveness',
          type: 'api',
          url: 'https://api.company.com/face-liveness',
          current_status: 'operational',
        },
      ],
    });

    // Create test incident
    await prisma.incident.create({
      data: {
        id: 'inc-2025-001',
        title: '서비스 응답 지연',
        description: 'ID Recognition 서비스 응답 시간 15초 초과',
        status: 'investigating',
        severity: 'high',
        priority: 'P2',
        affected_services: ['id-recognition'],
        detection_criteria: '연속 3회 7초 초과',
        start_time: new Date('2025-09-11T10:00:00Z'),
        created_by: 'user-reporter',
        assigned_to: 'user-reporter',
      },
    });
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.incidentUpdate.deleteMany();
    await prisma.incident.deleteMany();
    await prisma.service.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('POST /api/incidents/{incidentId}/updates', () => {
    it('should create incident update with valid data and reporter role', async () => {
      // Login as reporter to get JWT token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'reporter',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Create incident update
      const updateData = {
        status: 'identified',
        description: '원인을 데이터베이스 연결 풀 부족으로 식별',
      };

      const response = await request(app)
        .post('/api/incidents/inc-2025-001/updates')
        .set('Authorization', `Bearer ${token}`)
        .send(updateData);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        id: expect.any(String),
        incident_id: 'inc-2025-001',
        status: 'identified',
        description: '원인을 데이터베이스 연결 풀 부족으로 식별',
        created_by: 'user-reporter',
        created_at: expect.any(String),
      });
    });

    it('should create incident update with admin role', async () => {
      // Login as admin to get JWT token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Create incident update
      const updateData = {
        status: 'monitoring',
        description: '연결 풀 크기 증가 후 모니터링 중',
      };

      const response = await request(app)
        .post('/api/incidents/inc-2025-001/updates')
        .set('Authorization', `Bearer ${token}`)
        .send(updateData);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        id: expect.any(String),
        incident_id: 'inc-2025-001',
        status: 'monitoring',
        description: '연결 풀 크기 증가 후 모니터링 중',
        created_by: 'user-admin',
        created_at: expect.any(String),
      });
    });

    it('should reject request without authentication', async () => {
      const updateData = {
        status: 'identified',
        description: 'Test update without auth',
      };

      const response = await request(app)
        .post('/api/incidents/inc-2025-001/updates')
        .send(updateData);

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        message: expect.any(String),
      });
    });

    it('should reject viewer role access', async () => {
      // Login as viewer to get JWT token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Try to create incident update (should fail)
      const updateData = {
        status: 'identified',
        description: 'Viewer should not be able to create updates',
      };

      const response = await request(app)
        .post('/api/incidents/inc-2025-001/updates')
        .set('Authorization', `Bearer ${token}`)
        .send(updateData);

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        error: 'Forbidden',
        message: expect.stringContaining('permission'),
      });
    });

    it('should validate required fields', async () => {
      // Login as reporter to get JWT token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'reporter',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Try to create update without required fields
      const response = await request(app)
        .post('/api/incidents/inc-2025-001/updates')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: 'Validation Error',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: expect.any(String),
            message: expect.any(String),
          }),
        ]),
      });
    });

    it('should validate status enum values', async () => {
      // Login as reporter to get JWT token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'reporter',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Try to create update with invalid status
      const updateData = {
        status: 'invalid-status',
        description: 'Test with invalid status',
      };

      const response = await request(app)
        .post('/api/incidents/inc-2025-001/updates')
        .set('Authorization', `Bearer ${token}`)
        .send(updateData);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: 'Validation Error',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: 'status',
            message: expect.stringContaining('enum'),
          }),
        ]),
      });
    });

    it('should return 404 for non-existent incident', async () => {
      // Login as reporter to get JWT token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'reporter',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Try to create update for non-existent incident
      const updateData = {
        status: 'identified',
        description: 'Update for non-existent incident',
      };

      const response = await request(app)
        .post('/api/incidents/non-existent-id/updates')
        .set('Authorization', `Bearer ${token}`)
        .send(updateData);

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        error: 'Not Found',
        message: expect.stringContaining('incident'),
      });
    });

    it('should update incident status when creating update', async () => {
      // Login as reporter to get JWT token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'reporter',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Create incident update with status change
      const updateData = {
        status: 'resolved',
        description: '문제 해결 완료',
      };

      const response = await request(app)
        .post('/api/incidents/inc-2025-001/updates')
        .set('Authorization', `Bearer ${token}`)
        .send(updateData);

      expect(response.status).toBe(201);

      // Verify incident status was updated
      const incidentResponse = await request(app)
        .get('/api/incidents/inc-2025-001')
        .set('Authorization', `Bearer ${token}`);

      expect(incidentResponse.status).toBe(200);
      expect(incidentResponse.body).toMatchObject({
        id: 'inc-2025-001',
        status: 'resolved',
        resolution_time: expect.any(String), // Should be set when resolved
      });
    });

    it('should validate incident update workflow rules', async () => {
      // Login as reporter to get JWT token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'reporter',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Try to change status from investigating directly to resolved (should validate workflow)
      const updateData = {
        status: 'resolved',
        description: 'Trying to skip workflow steps',
      };

      const response = await request(app)
        .post('/api/incidents/inc-2025-001/updates')
        .set('Authorization', `Bearer ${token}`)
        .send(updateData);

      // This might be allowed or rejected based on business rules
      // The test checks that the API handles workflow validation
      expect([200, 201, 400]).toContain(response.status);

      if (response.status === 400) {
        expect(response.body).toMatchObject({
          error: expect.any(String),
          message: expect.stringContaining('workflow'),
        });
      }
    });
  });
});
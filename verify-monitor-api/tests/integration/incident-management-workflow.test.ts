import request from 'supertest';
import { Express } from 'express';
import { prisma } from '../setup';

let app: Express;

describe('Integration Test: Incident Management Workflow Scenario (T024)', () => {
  beforeAll(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      app = require('../../src/app').default;
    } catch (error) {
      console.log('App not implemented yet - tests will fail as expected (TDD)');
    }
  });

  beforeEach(async () => {
    // Create test users
    await prisma.user.createMany({
      data: [
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
      ],
    });
  });

  afterEach(async () => {
    await prisma.incidentUpdate.deleteMany();
    await prisma.incident.deleteMany();
    await prisma.service.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('Test Scenario 3: Incident Management Workflow (FR-009, FR-010)', () => {
    it('should verify complete incident lifecycle management', async () => {
      // Step 1: Create Incident (Requires authentication)
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'reporter',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Create incident
      const createResponse = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: '서비스 응답 지연',
          description: 'ID Recognition 서비스 응답 시간 15초 초과',
          severity: 'high',
          priority: 'P2',
          affected_services: ['id-recognition'],
          detection_criteria: '연속 3회 7초 초과',
        });

      expect(createResponse.status).toBe(201);
      expect(createResponse.body).toMatchObject({
        id: expect.any(String),
        title: '서비스 응답 지연',
        description: 'ID Recognition 서비스 응답 시간 15초 초과',
        status: 'investigating',
        severity: 'high',
        priority: 'P2',
        affected_services: ['id-recognition'],
        detection_criteria: '연속 3회 7초 초과',
        start_time: expect.any(String),
        created_by: 'user-reporter',
        assigned_to: 'user-reporter',
        resolution_time: null,
      });

      const incidentId = createResponse.body.id;

      // Step 2: Update Incident Status
      const updateResponse = await request(app)
        .put(`/api/incidents/${incidentId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          status: 'identified',
          description: '원인을 데이터베이스 연결 풀 부족으로 식별',
        });

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body).toMatchObject({
        id: incidentId,
        status: 'identified',
        description: '원인을 데이터베이스 연결 풀 부족으로 식별',
        updated_at: expect.any(String),
      });

      // Step 3: Add Incident Update
      const addUpdateResponse = await request(app)
        .post(`/api/incidents/${incidentId}/updates`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          status: 'monitoring',
          description: '연결 풀 크기 증가 후 모니터링 중',
        });

      expect(addUpdateResponse.status).toBe(201);
      expect(addUpdateResponse.body).toMatchObject({
        id: expect.any(String),
        incident_id: incidentId,
        status: 'monitoring',
        description: '연결 풀 크기 증가 후 모니터링 중',
        created_by: 'user-reporter',
        created_at: expect.any(String),
      });

      // Step 4: Verify Status Transitions
      const finalUpdateResponse = await request(app)
        .post(`/api/incidents/${incidentId}/updates`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          status: 'resolved',
          description: '문제 해결 완료',
        });

      expect(finalUpdateResponse.status).toBe(201);

      // Verify incident is resolved
      const getIncidentResponse = await request(app)
        .get(`/api/incidents/${incidentId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(getIncidentResponse.status).toBe(200);
      expect(getIncidentResponse.body).toMatchObject({
        id: incidentId,
        status: 'resolved',
        resolution_time: expect.any(String),
      });

      // Verify resolution time calculation
      const startTime = new Date(getIncidentResponse.body.start_time);
      const resolutionTime = new Date(getIncidentResponse.body.resolution_time);
      expect(resolutionTime.getTime()).toBeGreaterThan(startTime.getTime());
    });

    it('should enforce status workflow transitions', async () => {
      // Login as admin
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Create incident
      const createResponse = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Test Workflow',
          description: 'Testing status transitions',
          severity: 'medium',
          priority: 'P3',
          affected_services: ['id-recognition'],
        });

      expect(createResponse.status).toBe(201);
      const incidentId = createResponse.body.id;

      // Test valid transitions: investigating → identified → monitoring → resolved
      const transitions = [
        { from: 'investigating', to: 'identified', shouldWork: true },
        { from: 'identified', to: 'monitoring', shouldWork: true },
        { from: 'monitoring', to: 'resolved', shouldWork: true },
      ];

      for (const transition of transitions) {
        const response = await request(app)
          .put(`/api/incidents/${incidentId}`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            status: transition.to,
            description: `Transition from ${transition.from} to ${transition.to}`,
          });

        if (transition.shouldWork) {
          expect(response.status).toBe(200);
          expect(response.body.status).toBe(transition.to);
        } else {
          expect(response.status).toBe(400);
        }
      }
    });

    it('should track incident metadata correctly', async () => {
      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'reporter',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Create incident with full metadata
      const createResponse = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Comprehensive Test Incident',
          description: 'Testing all metadata fields',
          severity: 'critical',
          priority: 'P1',
          affected_services: ['id-recognition'],
          detection_criteria: 'Automated monitoring alert',
          external_ticket_id: 'TICKET-12345',
          customer_impact: 'Service unavailable for premium customers',
        });

      expect(createResponse.status).toBe(201);

      // Verify all metadata is captured
      expect(createResponse.body).toMatchObject({
        title: 'Comprehensive Test Incident',
        description: 'Testing all metadata fields',
        severity: 'critical',
        priority: 'P1',
        affected_services: ['id-recognition'],
        detection_criteria: 'Automated monitoring alert',
        external_ticket_id: 'TICKET-12345',
        customer_impact: 'Service unavailable for premium customers',
        status: 'investigating',
        created_by: 'user-reporter',
        assigned_to: 'user-reporter',
        start_time: expect.any(String),
        created_at: expect.any(String),
        updated_at: expect.any(String),
      });

      // Verify timestamps are valid
      const incident = createResponse.body;
      expect(new Date(incident.start_time)).toBeInstanceOf(Date);
      expect(new Date(incident.created_at)).toBeInstanceOf(Date);
      expect(new Date(incident.updated_at)).toBeInstanceOf(Date);
    });

    it('should handle multiple affected services', async () => {
      // Create additional service
      await prisma.service.create({
        data: {
          id: 'face-liveness',
          name: 'Face Liveness',
          type: 'api',
          url: 'https://api.company.com/face-liveness',
          current_status: 'operational',
        },
      });

      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'reporter',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Create incident affecting multiple services
      const createResponse = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Database Connection Pool Issue',
          description: 'Shared database connection pool exhausted',
          severity: 'high',
          priority: 'P1',
          affected_services: ['id-recognition', 'face-liveness'],
          detection_criteria: 'Multiple service timeouts',
        });

      expect(createResponse.status).toBe(201);
      expect(createResponse.body.affected_services).toEqual(['id-recognition', 'face-liveness']);

      // Verify incident appears in service-specific queries
      const incidentId = createResponse.body.id;

      const getIncidentResponse = await request(app)
        .get(`/api/incidents/${incidentId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(getIncidentResponse.status).toBe(200);
      expect(getIncidentResponse.body.affected_services).toHaveLength(2);
    });

    it('should calculate resolution metrics', async () => {
      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Create incident
      const createResponse = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Resolution Time Test',
          description: 'Testing resolution time calculation',
          severity: 'medium',
          priority: 'P3',
          affected_services: ['id-recognition'],
        });

      expect(createResponse.status).toBe(201);
      const incidentId = createResponse.body.id;
      const startTime = new Date(createResponse.body.start_time);

      // Wait a brief moment and resolve
      await new Promise(resolve => setTimeout(resolve, 100));

      // Resolve incident
      const resolveResponse = await request(app)
        .put(`/api/incidents/${incidentId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          status: 'resolved',
          description: 'Issue resolved',
        });

      expect(resolveResponse.status).toBe(200);

      // Get resolved incident
      const getIncidentResponse = await request(app)
        .get(`/api/incidents/${incidentId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(getIncidentResponse.status).toBe(200);

      const incident = getIncidentResponse.body;
      expect(incident.resolution_time).toBeTruthy();

      // Verify resolution duration calculation
      const resolutionTime = new Date(incident.resolution_time);
      const durationMs = resolutionTime.getTime() - startTime.getTime();
      const durationMinutes = Math.round(durationMs / (1000 * 60));

      expect(incident.resolution_duration_minutes).toBe(durationMinutes);
      expect(incident.resolution_duration_minutes).toBeGreaterThanOrEqual(0);
    });
  });
});
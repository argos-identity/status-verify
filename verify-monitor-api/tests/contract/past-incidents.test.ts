import request from 'supertest';
import { Express } from 'express';
import { prisma } from '../setup';

let app: Express;

describe('Contract Test: GET /api/incidents/past', () => {
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
          id: 'user-viewer',
          username: 'viewer',
          email: 'viewer@example.com',
          password_hash: '$2b$12$hash-for-password123',
          role: 'viewer',
        },
        {
          id: 'user-reporter',
          username: 'reporter',
          email: 'reporter@example.com',
          password_hash: '$2b$12$hash-for-password123',
          role: 'reporter',
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

    // Create test incidents with different statuses and dates
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    await prisma.incident.createMany({
      data: [
        // Resolved incidents (should appear in past incidents)
        {
          id: 'inc-2025-001',
          title: '서비스 응답 지연 - 해결됨',
          description: 'ID Recognition 서비스 응답 시간 지연',
          status: 'resolved',
          severity: 'high',
          priority: 'P2',
          affected_services: ['id-recognition'],
          detection_criteria: '연속 3회 7초 초과',
          start_time: oneWeekAgo,
          resolution_time: new Date(oneWeekAgo.getTime() + 2 * 60 * 60 * 1000), // 2 hours later
          created_by: 'user-reporter',
          assigned_to: 'user-reporter',
        },
        {
          id: 'inc-2025-002',
          title: 'Face Liveness API 오류 - 해결됨',
          description: '얼굴 인식 서비스 500 에러 발생',
          status: 'resolved',
          severity: 'critical',
          priority: 'P1',
          affected_services: ['face-liveness'],
          detection_criteria: '에러율 5% 초과',
          start_time: oneMonthAgo,
          resolution_time: new Date(oneMonthAgo.getTime() + 30 * 60 * 1000), // 30 minutes later
          created_by: 'user-reporter',
          assigned_to: 'user-reporter',
        },
        {
          id: 'inc-2025-003',
          title: '데이터베이스 연결 이슈 - 해결됨',
          description: '데이터베이스 연결 풀 부족',
          status: 'resolved',
          severity: 'medium',
          priority: 'P3',
          affected_services: ['id-recognition', 'face-liveness'],
          detection_criteria: '연결 실패율 1% 초과',
          start_time: threeMonthsAgo,
          resolution_time: new Date(threeMonthsAgo.getTime() + 4 * 60 * 60 * 1000), // 4 hours later
          created_by: 'user-reporter',
          assigned_to: 'user-reporter',
        },
        // Active incidents (should NOT appear in past incidents)
        {
          id: 'inc-2025-004',
          title: '현재 진행중인 이슈',
          description: '현재 조사중인 이슈',
          status: 'investigating',
          severity: 'low',
          priority: 'P4',
          affected_services: ['id-recognition'],
          detection_criteria: '응답 시간 증가',
          start_time: new Date(now.getTime() - 60 * 60 * 1000), // 1 hour ago
          created_by: 'user-reporter',
          assigned_to: 'user-reporter',
        },
        {
          id: 'inc-2025-005',
          title: '식별된 이슈',
          description: '원인 식별 완료',
          status: 'identified',
          severity: 'medium',
          priority: 'P3',
          affected_services: ['face-liveness'],
          detection_criteria: '성능 저하',
          start_time: new Date(now.getTime() - 30 * 60 * 1000), // 30 minutes ago
          created_by: 'user-reporter',
          assigned_to: 'user-reporter',
        },
      ],
    });
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.incident.deleteMany();
    await prisma.service.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('GET /api/incidents/past', () => {
    it('should return all resolved incidents by default', async () => {
      // Login to get JWT token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      const response = await request(app)
        .get('/api/incidents/past')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        incidents: expect.arrayContaining([
          expect.objectContaining({
            id: 'inc-2025-001',
            status: 'resolved',
            resolution_time: expect.any(String),
          }),
          expect.objectContaining({
            id: 'inc-2025-002',
            status: 'resolved',
            resolution_time: expect.any(String),
          }),
          expect.objectContaining({
            id: 'inc-2025-003',
            status: 'resolved',
            resolution_time: expect.any(String),
          }),
        ]),
        total: 3,
        page: 1,
        limit: 50,
      });

      // Verify no active incidents are returned
      const incidentIds = response.body.incidents.map((inc: any) => inc.id);
      expect(incidentIds).not.toContain('inc-2025-004');
      expect(incidentIds).not.toContain('inc-2025-005');
    });

    it('should filter incidents by date range', async () => {
      // Login to get JWT token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Get incidents from last 2 months
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

      const response = await request(app)
        .get('/api/incidents/past')
        .query({
          startDate: twoMonthsAgo.toISOString().split('T')[0],
        })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.incidents).toHaveLength(2); // Should exclude 3-month-old incident

      const incidentIds = response.body.incidents.map((inc: any) => inc.id);
      expect(incidentIds).toContain('inc-2025-001');
      expect(incidentIds).toContain('inc-2025-002');
      expect(incidentIds).not.toContain('inc-2025-003'); // Too old
    });

    it('should filter incidents by end date', async () => {
      // Login to get JWT token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Get incidents up to 2 weeks ago
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

      const response = await request(app)
        .get('/api/incidents/past')
        .query({
          endDate: twoWeeksAgo.toISOString().split('T')[0],
        })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.incidents).toHaveLength(2); // Should exclude recent incident

      const incidentIds = response.body.incidents.map((inc: any) => inc.id);
      expect(incidentIds).toContain('inc-2025-002');
      expect(incidentIds).toContain('inc-2025-003');
      expect(incidentIds).not.toContain('inc-2025-001'); // Too recent
    });

    it('should filter incidents by service', async () => {
      // Login to get JWT token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      const response = await request(app)
        .get('/api/incidents/past')
        .query({
          service: 'face-liveness',
        })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);

      // Should return incidents that affected face-liveness service
      const expectedIncidents = response.body.incidents.filter((inc: any) =>
        inc.affected_services.includes('face-liveness')
      );
      expect(expectedIncidents.length).toBeGreaterThan(0);
    });

    it('should filter incidents by severity', async () => {
      // Login to get JWT token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      const response = await request(app)
        .get('/api/incidents/past')
        .query({
          severity: 'critical',
        })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.incidents).toHaveLength(1);
      expect(response.body.incidents[0]).toMatchObject({
        id: 'inc-2025-002',
        severity: 'critical',
      });
    });

    it('should support pagination', async () => {
      // Login to get JWT token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      const response = await request(app)
        .get('/api/incidents/past')
        .query({
          page: 1,
          limit: 2,
        })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        incidents: expect.any(Array),
        total: 3,
        page: 1,
        limit: 2,
        totalPages: 2,
      });
      expect(response.body.incidents).toHaveLength(2);
    });

    it('should sort incidents by resolution_time desc by default', async () => {
      // Login to get JWT token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      const response = await request(app)
        .get('/api/incidents/past')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.incidents).toHaveLength(3);

      // Verify sorting (most recent resolution first)
      const incidents = response.body.incidents;
      expect(incidents[0].id).toBe('inc-2025-001'); // Most recent resolution
      expect(incidents[1].id).toBe('inc-2025-002'); // Middle
      expect(incidents[2].id).toBe('inc-2025-003'); // Oldest resolution
    });

    it('should support custom sorting', async () => {
      // Login to get JWT token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      const response = await request(app)
        .get('/api/incidents/past')
        .query({
          sortBy: 'severity',
          sortOrder: 'asc',
        })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.incidents).toHaveLength(3);

      // Verify sorting by severity (critical, high, medium)
      const severities = response.body.incidents.map((inc: any) => inc.severity);
      expect(severities).toEqual(['critical', 'high', 'medium']);
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/incidents/past');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        message: expect.any(String),
      });
    });

    it('should include incident resolution metrics', async () => {
      // Login to get JWT token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      const response = await request(app)
        .get('/api/incidents/past')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);

      // Verify each incident has resolution metrics
      response.body.incidents.forEach((incident: any) => {
        expect(incident).toMatchObject({
          id: expect.any(String),
          title: expect.any(String),
          status: 'resolved',
          severity: expect.any(String),
          priority: expect.any(String),
          affected_services: expect.any(Array),
          start_time: expect.any(String),
          resolution_time: expect.any(String),
          resolution_duration_minutes: expect.any(Number),
          created_by: expect.any(String),
          assigned_to: expect.any(String),
        });

        // Verify resolution time is after start time
        const startTime = new Date(incident.start_time);
        const resolutionTime = new Date(incident.resolution_time);
        expect(resolutionTime.getTime()).toBeGreaterThan(startTime.getTime());

        // Verify resolution duration is positive
        expect(incident.resolution_duration_minutes).toBeGreaterThan(0);
      });
    });

    it('should validate date format', async () => {
      // Login to get JWT token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      const response = await request(app)
        .get('/api/incidents/past')
        .query({
          startDate: 'invalid-date',
        })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: 'Validation Error',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: 'startDate',
            message: expect.stringContaining('date'),
          }),
        ]),
      });
    });

    it('should validate pagination parameters', async () => {
      // Login to get JWT token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      const response = await request(app)
        .get('/api/incidents/past')
        .query({
          page: 0, // Invalid page number
          limit: 1000, // Too large limit
        })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: 'Validation Error',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: expect.stringMatching(/page|limit/),
            message: expect.any(String),
          }),
        ]),
      });
    });
  });
});
import request from 'supertest';
import { Express } from 'express';
import { prisma } from '../setup';

let app: Express;

describe('Contract Test: GET /api/sla/response-times/{serviceId}', () => {
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

    // Create test API response time data
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    await prisma.aPIResponseTime.createMany({
      data: [
        // Recent response times for ID Recognition
        {
          id: 'rt-001',
          service_id: 'id-recognition',
          endpoint: '/verify',
          method: 'POST',
          response_time_ms: 150,
          timestamp: now,
          status_code: 200,
        },
        {
          id: 'rt-002',
          service_id: 'id-recognition',
          endpoint: '/verify',
          method: 'POST',
          response_time_ms: 180,
          timestamp: new Date(now.getTime() - 60 * 60 * 1000), // 1 hour ago
          status_code: 200,
        },
        {
          id: 'rt-003',
          service_id: 'id-recognition',
          endpoint: '/verify',
          method: 'POST',
          response_time_ms: 220,
          timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
          status_code: 200,
        },
        {
          id: 'rt-004',
          service_id: 'id-recognition',
          endpoint: '/health',
          method: 'GET',
          response_time_ms: 50,
          timestamp: oneDayAgo,
          status_code: 200,
        },
        {
          id: 'rt-005',
          service_id: 'id-recognition',
          endpoint: '/verify',
          method: 'POST',
          response_time_ms: 300,
          timestamp: oneWeekAgo,
          status_code: 200,
        },
        {
          id: 'rt-006',
          service_id: 'id-recognition',
          endpoint: '/verify',
          method: 'POST',
          response_time_ms: 250,
          timestamp: oneMonthAgo,
          status_code: 200,
        },
        // Response times for Face Liveness
        {
          id: 'rt-007',
          service_id: 'face-liveness',
          endpoint: '/detect',
          method: 'POST',
          response_time_ms: 120,
          timestamp: now,
          status_code: 200,
        },
        {
          id: 'rt-008',
          service_id: 'face-liveness',
          endpoint: '/detect',
          method: 'POST',
          response_time_ms: 140,
          timestamp: oneDayAgo,
          status_code: 200,
        },
        // Error responses (should be included in analysis)
        {
          id: 'rt-009',
          service_id: 'id-recognition',
          endpoint: '/verify',
          method: 'POST',
          response_time_ms: 5000, // Timeout
          timestamp: new Date(now.getTime() - 3 * 60 * 60 * 1000), // 3 hours ago
          status_code: 500,
        },
      ],
    });
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.aPIResponseTime.deleteMany();
    await prisma.service.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('GET /api/sla/response-times/{serviceId}', () => {
    it('should return response time metrics for valid service', async () => {
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
        .get('/api/sla/response-times/id-recognition')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        service_id: 'id-recognition',
        service_name: 'ID Recognition',
        metrics: {
          average_response_time_ms: expect.any(Number),
          median_response_time_ms: expect.any(Number),
          p95_response_time_ms: expect.any(Number),
          p99_response_time_ms: expect.any(Number),
          min_response_time_ms: expect.any(Number),
          max_response_time_ms: expect.any(Number),
          total_requests: expect.any(Number),
          error_rate_percentage: expect.any(Number),
        },
        time_range: {
          start_date: expect.any(String),
          end_date: expect.any(String),
          duration_days: expect.any(Number),
        },
        hourly_breakdown: expect.any(Array),
        endpoint_breakdown: expect.any(Array),
      });

      // Verify metrics are reasonable
      expect(response.body.metrics.average_response_time_ms).toBeGreaterThan(0);
      expect(response.body.metrics.average_response_time_ms).toBeLessThan(10000);
      expect(response.body.metrics.total_requests).toBeGreaterThan(0);
      expect(response.body.metrics.error_rate_percentage).toBeGreaterThanOrEqual(0);
      expect(response.body.metrics.error_rate_percentage).toBeLessThanOrEqual(100);
    });

    it('should support custom time range', async () => {
      // Login to get JWT token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Get last 7 days
      const response = await request(app)
        .get('/api/sla/response-times/id-recognition')
        .query({
          days: 7,
        })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.time_range.duration_days).toBe(7);

      // Get specific date range
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 3);
      const endDate = new Date();

      const response2 = await request(app)
        .get('/api/sla/response-times/id-recognition')
        .query({
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
        })
        .set('Authorization', `Bearer ${token}`);

      expect(response2.status).toBe(200);
      expect(response2.body.time_range.duration_days).toBe(3);
    });

    it('should filter by endpoint', async () => {
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
        .get('/api/sla/response-times/id-recognition')
        .query({
          endpoint: '/verify',
        })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);

      // Should only include data for /verify endpoint
      expect(response.body.endpoint_breakdown).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            endpoint: '/verify',
            method: 'POST',
            average_response_time_ms: expect.any(Number),
            request_count: expect.any(Number),
          }),
        ])
      );

      // Should not include /health endpoint data
      const healthEndpoint = response.body.endpoint_breakdown.find(
        (ep: any) => ep.endpoint === '/health'
      );
      expect(healthEndpoint).toBeUndefined();
    });

    it('should provide hourly breakdown', async () => {
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
        .get('/api/sla/response-times/id-recognition')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.hourly_breakdown).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            hour: expect.any(String), // ISO datetime for hour
            average_response_time_ms: expect.any(Number),
            request_count: expect.any(Number),
            error_count: expect.any(Number),
          }),
        ])
      );

      // Verify data is sorted by hour
      const hours = response.body.hourly_breakdown.map((h: any) => h.hour);
      const sortedHours = [...hours].sort();
      expect(hours).toEqual(sortedHours);
    });

    it('should provide endpoint breakdown', async () => {
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
        .get('/api/sla/response-times/id-recognition')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.endpoint_breakdown).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            endpoint: expect.any(String),
            method: expect.any(String),
            average_response_time_ms: expect.any(Number),
            request_count: expect.any(Number),
            error_rate_percentage: expect.any(Number),
          }),
        ])
      );

      // Should include both /verify and /health endpoints
      const endpoints = response.body.endpoint_breakdown.map((ep: any) => ep.endpoint);
      expect(endpoints).toContain('/verify');
      expect(endpoints).toContain('/health');
    });

    it('should calculate percentiles correctly', async () => {
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
        .get('/api/sla/response-times/id-recognition')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);

      const metrics = response.body.metrics;

      // Verify percentile order
      expect(metrics.min_response_time_ms).toBeLessThanOrEqual(metrics.median_response_time_ms);
      expect(metrics.median_response_time_ms).toBeLessThanOrEqual(metrics.average_response_time_ms);
      expect(metrics.average_response_time_ms).toBeLessThanOrEqual(metrics.p95_response_time_ms);
      expect(metrics.p95_response_time_ms).toBeLessThanOrEqual(metrics.p99_response_time_ms);
      expect(metrics.p99_response_time_ms).toBeLessThanOrEqual(metrics.max_response_time_ms);
    });

    it('should calculate error rate correctly', async () => {
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
        .get('/api/sla/response-times/id-recognition')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);

      // With 1 error out of 6 total requests for id-recognition = 16.67%
      expect(response.body.metrics.error_rate_percentage).toBeGreaterThan(10);
      expect(response.body.metrics.error_rate_percentage).toBeLessThan(25);
    });

    it('should return 404 for non-existent service', async () => {
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
        .get('/api/sla/response-times/non-existent-service')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        error: 'Not Found',
        message: expect.stringContaining('service'),
      });
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/sla/response-times/id-recognition');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        message: expect.any(String),
      });
    });

    it('should validate query parameters', async () => {
      // Login to get JWT token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Invalid days parameter
      const response1 = await request(app)
        .get('/api/sla/response-times/id-recognition')
        .query({
          days: -1,
        })
        .set('Authorization', `Bearer ${token}`);

      expect(response1.status).toBe(400);
      expect(response1.body).toMatchObject({
        error: 'Validation Error',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: 'days',
            message: expect.any(String),
          }),
        ]),
      });

      // Invalid date format
      const response2 = await request(app)
        .get('/api/sla/response-times/id-recognition')
        .query({
          startDate: 'invalid-date',
        })
        .set('Authorization', `Bearer ${token}`);

      expect(response2.status).toBe(400);
      expect(response2.body).toMatchObject({
        error: 'Validation Error',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: 'startDate',
            message: expect.stringContaining('date'),
          }),
        ]),
      });
    });

    it('should handle empty data gracefully', async () => {
      // Clear all response time data
      await prisma.aPIResponseTime.deleteMany();

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
        .get('/api/sla/response-times/id-recognition')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        service_id: 'id-recognition',
        service_name: 'ID Recognition',
        metrics: {
          average_response_time_ms: 0,
          median_response_time_ms: 0,
          p95_response_time_ms: 0,
          p99_response_time_ms: 0,
          min_response_time_ms: 0,
          max_response_time_ms: 0,
          total_requests: 0,
          error_rate_percentage: 0,
        },
        hourly_breakdown: [],
        endpoint_breakdown: [],
      });
    });

    it('should support aggregation by method', async () => {
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
        .get('/api/sla/response-times/id-recognition')
        .query({
          method: 'POST',
        })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);

      // Should only include POST requests
      response.body.endpoint_breakdown.forEach((endpoint: any) => {
        expect(endpoint.method).toBe('POST');
      });
    });

    it('should meet SLA target validation (<200ms average)', async () => {
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
        .get('/api/sla/response-times/id-recognition')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);

      // Include SLA compliance indicator
      expect(response.body).toMatchObject({
        sla_compliance: {
          target_response_time_ms: 200,
          is_compliant: expect.any(Boolean),
          compliance_percentage: expect.any(Number),
        },
      });

      // Verify compliance calculation
      const isCompliant = response.body.metrics.average_response_time_ms < 200;
      expect(response.body.sla_compliance.is_compliant).toBe(isCompliant);
    });
  });
});
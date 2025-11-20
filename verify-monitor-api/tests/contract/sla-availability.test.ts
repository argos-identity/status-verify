import request from 'supertest';
import { Express } from 'express';
import { prisma } from '../setup';

let app: Express;

describe('Contract Test: GET /api/sla/availability/{serviceId}', () => {
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

    // Create test uptime records with various statuses
    const now = new Date();
    const records = [];

    // Generate 90 days of uptime data
    for (let i = 0; i < 90; i++) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);

      // Create mostly operational days with some partial outages and major outages
      let status = 'operational';
      let uptime_percentage = 100.0;

      if (i % 30 === 0) {
        // Major outage every 30 days
        status = 'major_outage';
        uptime_percentage = 25.0;
      } else if (i % 15 === 0) {
        // Partial outage every 15 days
        status = 'partial_outage';
        uptime_percentage = 85.0;
      } else if (i % 7 === 0) {
        // Minor degradation every 7 days
        status = 'operational';
        uptime_percentage = 95.0;
      }

      records.push({
        id: `uptime-${i}-id-rec`,
        service_id: 'id-recognition',
        date: date,
        status: status,
        uptime_percentage: uptime_percentage,
        downtime_minutes: Math.round((100 - uptime_percentage) * 14.4), // 1440 minutes per day
        incident_count: status === 'operational' ? 0 : (status === 'partial_outage' ? 1 : 3),
      });

      // Different pattern for face-liveness (better availability)
      let faceStatus = 'operational';
      let faceUptime = 100.0;

      if (i % 45 === 0) {
        // Major outage every 45 days (less frequent)
        faceStatus = 'major_outage';
        faceUptime = 30.0;
      } else if (i % 20 === 0) {
        // Partial outage every 20 days
        faceStatus = 'partial_outage';
        faceUptime = 90.0;
      }

      records.push({
        id: `uptime-${i}-face-live`,
        service_id: 'face-liveness',
        date: date,
        status: faceStatus,
        uptime_percentage: faceUptime,
        downtime_minutes: Math.round((100 - faceUptime) * 14.4),
        incident_count: faceStatus === 'operational' ? 0 : (faceStatus === 'partial_outage' ? 1 : 2),
      });
    }

    await prisma.uptimeRecord.createMany({ data: records });
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.uptimeRecord.deleteMany();
    await prisma.service.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('GET /api/sla/availability/{serviceId}', () => {
    it('should return availability metrics for valid service', async () => {
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
        .get('/api/sla/availability/id-recognition')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        service_id: 'id-recognition',
        service_name: 'ID Recognition',
        metrics: {
          overall_availability_percentage: expect.any(Number),
          uptime_percentage_30d: expect.any(Number),
          uptime_percentage_7d: expect.any(Number),
          uptime_percentage_24h: expect.any(Number),
          total_downtime_minutes: expect.any(Number),
          total_incidents: expect.any(Number),
          mttr_minutes: expect.any(Number), // Mean Time To Recovery
          mtbf_hours: expect.any(Number), // Mean Time Between Failures
        },
        time_range: {
          start_date: expect.any(String),
          end_date: expect.any(String),
          total_days: expect.any(Number),
        },
        daily_breakdown: expect.any(Array),
        monthly_summary: expect.any(Array),
        sla_compliance: {
          target_availability_percentage: 99.9,
          is_compliant: expect.any(Boolean),
          breach_days: expect.any(Number),
          compliance_percentage: expect.any(Number),
        },
      });

      // Verify metrics are within reasonable ranges
      expect(response.body.metrics.overall_availability_percentage).toBeGreaterThanOrEqual(0);
      expect(response.body.metrics.overall_availability_percentage).toBeLessThanOrEqual(100);
      expect(response.body.metrics.total_downtime_minutes).toBeGreaterThanOrEqual(0);
      expect(response.body.metrics.total_incidents).toBeGreaterThanOrEqual(0);
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

      // Get last 30 days
      const response = await request(app)
        .get('/api/sla/availability/id-recognition')
        .query({
          days: 30,
        })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.time_range.total_days).toBe(30);
      expect(response.body.daily_breakdown).toHaveLength(30);

      // Get specific date range
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      const endDate = new Date();

      const response2 = await request(app)
        .get('/api/sla/availability/id-recognition')
        .query({
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
        })
        .set('Authorization', `Bearer ${token}`);

      expect(response2.status).toBe(200);
      expect(response2.body.time_range.total_days).toBe(7);
    });

    it('should provide daily breakdown', async () => {
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
        .get('/api/sla/availability/id-recognition')
        .query({
          days: 7,
        })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.daily_breakdown).toHaveLength(7);

      response.body.daily_breakdown.forEach((day: any) => {
        expect(day).toMatchObject({
          date: expect.any(String),
          status: expect.stringMatching(/^(operational|partial_outage|major_outage)$/),
          uptime_percentage: expect.any(Number),
          downtime_minutes: expect.any(Number),
          incident_count: expect.any(Number),
        });

        // Verify data consistency
        expect(day.uptime_percentage).toBeGreaterThanOrEqual(0);
        expect(day.uptime_percentage).toBeLessThanOrEqual(100);
        expect(day.downtime_minutes).toBeGreaterThanOrEqual(0);
        expect(day.downtime_minutes).toBeLessThanOrEqual(1440); // 24 hours
        expect(day.incident_count).toBeGreaterThanOrEqual(0);
      });

      // Verify data is sorted by date (newest first)
      const dates = response.body.daily_breakdown.map((day: any) => new Date(day.date));
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i-1].getTime()).toBeGreaterThanOrEqual(dates[i].getTime());
      }
    });

    it('should provide monthly summary', async () => {
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
        .get('/api/sla/availability/id-recognition')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.monthly_summary).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            month: expect.any(String), // YYYY-MM format
            availability_percentage: expect.any(Number),
            total_downtime_minutes: expect.any(Number),
            incident_count: expect.any(Number),
            operational_days: expect.any(Number),
            partial_outage_days: expect.any(Number),
            major_outage_days: expect.any(Number),
            sla_breach_days: expect.any(Number),
          }),
        ])
      );

      // Verify monthly data consistency
      response.body.monthly_summary.forEach((month: any) => {
        expect(month.availability_percentage).toBeGreaterThanOrEqual(0);
        expect(month.availability_percentage).toBeLessThanOrEqual(100);
        expect(month.total_downtime_minutes).toBeGreaterThanOrEqual(0);
        expect(month.incident_count).toBeGreaterThanOrEqual(0);

        const totalDays = month.operational_days + month.partial_outage_days + month.major_outage_days;
        expect(totalDays).toBeGreaterThan(0);
        expect(totalDays).toBeLessThanOrEqual(31); // Max days in a month
      });
    });

    it('should calculate SLA compliance correctly', async () => {
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
        .get('/api/sla/availability/id-recognition')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);

      const slaCompliance = response.body.sla_compliance;
      expect(slaCompliance.target_availability_percentage).toBe(99.9);
      expect(slaCompliance.is_compliant).toBe(
        response.body.metrics.overall_availability_percentage >= 99.9
      );
      expect(slaCompliance.breach_days).toBeGreaterThanOrEqual(0);
      expect(slaCompliance.compliance_percentage).toBeGreaterThanOrEqual(0);
      expect(slaCompliance.compliance_percentage).toBeLessThanOrEqual(100);
    });

    it('should support custom SLA target', async () => {
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
        .get('/api/sla/availability/id-recognition')
        .query({
          slaTarget: 95.0,
        })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.sla_compliance.target_availability_percentage).toBe(95.0);
      expect(response.body.sla_compliance.is_compliant).toBe(
        response.body.metrics.overall_availability_percentage >= 95.0
      );
    });

    it('should calculate MTTR and MTBF metrics', async () => {
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
        .get('/api/sla/availability/id-recognition')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);

      // Mean Time To Recovery should be reasonable
      expect(response.body.metrics.mttr_minutes).toBeGreaterThanOrEqual(0);
      expect(response.body.metrics.mttr_minutes).toBeLessThan(24 * 60); // Less than 24 hours

      // Mean Time Between Failures should be reasonable
      expect(response.body.metrics.mtbf_hours).toBeGreaterThanOrEqual(0);
      expect(response.body.metrics.mtbf_hours).toBeLessThan(90 * 24); // Less than 90 days
    });

    it('should compare services availability', async () => {
      // Login to get JWT token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Get availability for both services
      const idRecResponse = await request(app)
        .get('/api/sla/availability/id-recognition')
        .set('Authorization', `Bearer ${token}`);

      const faceLiveResponse = await request(app)
        .get('/api/sla/availability/face-liveness')
        .set('Authorization', `Bearer ${token}`);

      expect(idRecResponse.status).toBe(200);
      expect(faceLiveResponse.status).toBe(200);

      // Face Liveness should have better availability (configured with fewer outages)
      expect(faceLiveResponse.body.metrics.overall_availability_percentage)
        .toBeGreaterThan(idRecResponse.body.metrics.overall_availability_percentage);
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
        .get('/api/sla/availability/non-existent-service')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        error: 'Not Found',
        message: expect.stringContaining('service'),
      });
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/sla/availability/id-recognition');

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
        .get('/api/sla/availability/id-recognition')
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

      // Invalid SLA target
      const response2 = await request(app)
        .get('/api/sla/availability/id-recognition')
        .query({
          slaTarget: 150, // Over 100%
        })
        .set('Authorization', `Bearer ${token}`);

      expect(response2.status).toBe(400);
      expect(response2.body).toMatchObject({
        error: 'Validation Error',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: 'slaTarget',
            message: expect.any(String),
          }),
        ]),
      });
    });

    it('should handle empty data gracefully', async () => {
      // Clear all uptime data
      await prisma.uptimeRecord.deleteMany();

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
        .get('/api/sla/availability/id-recognition')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        service_id: 'id-recognition',
        service_name: 'ID Recognition',
        metrics: {
          overall_availability_percentage: 0,
          uptime_percentage_30d: 0,
          uptime_percentage_7d: 0,
          uptime_percentage_24h: 0,
          total_downtime_minutes: 0,
          total_incidents: 0,
          mttr_minutes: 0,
          mtbf_hours: 0,
        },
        daily_breakdown: [],
        monthly_summary: [],
        sla_compliance: {
          target_availability_percentage: 99.9,
          is_compliant: false,
          breach_days: 0,
          compliance_percentage: 0,
        },
      });
    });

    it('should provide time period summaries', async () => {
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
        .get('/api/sla/availability/id-recognition')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);

      // Verify all time period metrics are present and reasonable
      const metrics = response.body.metrics;

      // 24h should be >= 7d, 7d should be >= 30d in most cases
      // (unless recent outages are worse than historical average)
      expect(metrics.uptime_percentage_24h).toBeGreaterThanOrEqual(0);
      expect(metrics.uptime_percentage_7d).toBeGreaterThanOrEqual(0);
      expect(metrics.uptime_percentage_30d).toBeGreaterThanOrEqual(0);
      expect(metrics.overall_availability_percentage).toBeGreaterThanOrEqual(0);
    });

    it('should support quarterly and yearly aggregation', async () => {
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
        .get('/api/sla/availability/id-recognition')
        .query({
          aggregation: 'quarterly',
        })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('quarterly_summary');

      if (response.body.quarterly_summary.length > 0) {
        response.body.quarterly_summary.forEach((quarter: any) => {
          expect(quarter).toMatchObject({
            quarter: expect.any(String), // Q1-2025 format
            availability_percentage: expect.any(Number),
            total_downtime_minutes: expect.any(Number),
            incident_count: expect.any(Number),
          });
        });
      }
    });
  });
});
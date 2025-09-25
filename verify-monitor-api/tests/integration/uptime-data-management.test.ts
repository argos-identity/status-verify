import request from 'supertest';
import { Express } from 'express';
import { prisma } from '../setup';

let app: Express;

describe('Integration Test: Uptime Data Management Scenario (T023)', () => {
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

    // Create comprehensive uptime data for 90 days
    const uptimeRecords = [];
    const now = new Date();

    for (let i = 0; i < 90; i++) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);

      // ID Recognition - varying patterns with monthly trends
      let idRecStatus = 'operational';
      let idRecUptime = 100.0;

      if (i % 30 === 0) {
        // Major outage every 30 days
        idRecStatus = 'major_outage';
        idRecUptime = 20.0;
      } else if (i % 15 === 0) {
        // Partial outage every 15 days
        idRecStatus = 'partial_outage';
        idRecUptime = 85.0;
      } else if (i % 7 === 0) {
        // Minor degradation every 7 days
        idRecUptime = 95.0;
      }

      uptimeRecords.push({
        id: `uptime-${i}-id-rec`,
        service_id: 'id-recognition',
        date: date,
        status: idRecStatus,
        uptime_percentage: idRecUptime,
        downtime_minutes: Math.round((100 - idRecUptime) * 14.4),
        incident_count: idRecStatus === 'operational' ? 0 : (idRecStatus === 'partial_outage' ? 1 : 3),
      });

      // Face Liveness - better reliability pattern
      let faceStatus = 'operational';
      let faceUptime = 100.0;

      if (i % 45 === 0) {
        // Major outage every 45 days
        faceStatus = 'major_outage';
        faceUptime = 30.0;
      } else if (i % 20 === 0) {
        // Partial outage every 20 days
        faceStatus = 'partial_outage';
        faceUptime = 90.0;
      }

      uptimeRecords.push({
        id: `uptime-${i}-face-live`,
        service_id: 'face-liveness',
        date: date,
        status: faceStatus,
        uptime_percentage: faceUptime,
        downtime_minutes: Math.round((100 - faceUptime) * 14.4),
        incident_count: faceStatus === 'operational' ? 0 : (faceStatus === 'partial_outage' ? 1 : 2),
      });
    }

    await prisma.uptimeRecord.createMany({ data: uptimeRecords });
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.uptimeRecord.deleteMany();
    await prisma.service.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('Test Scenario 2: Uptime Data Management (FR-015, FR-017)', () => {
    it('should verify service-specific uptime tracking and visualization', async () => {
      // Step 1: GET Uptime Data
      // Login first
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Get 3 months of uptime data for ID Recognition
      const uptimeResponse = await request(app)
        .get('/api/uptime/id-recognition')
        .query({ months: 3 })
        .set('Authorization', `Bearer ${token}`);

      expect(uptimeResponse.status).toBe(200);

      // Verify response structure matches expected format
      expect(uptimeResponse.body).toMatchObject({
        service: {
          id: 'id-recognition',
          name: 'ID Recognition',
        },
        time_range: {
          months: 3,
          start_date: expect.any(String),
          end_date: expect.any(String),
          total_days: expect.any(Number),
        },
        overall_metrics: {
          average_uptime_percentage: expect.any(Number),
          total_downtime_minutes: expect.any(Number),
          total_incidents: expect.any(Number),
        },
        monthly_data: expect.arrayContaining([
          expect.objectContaining({
            month: expect.any(String), // YYYY-MM format
            uptime_percentage: expect.any(Number),
            daily_status: expect.any(Array), // Array of 30-31 status codes
            incident_count: expect.any(Number),
            downtime_minutes: expect.any(Number),
          }),
        ]),
        daily_breakdown: expect.any(Array),
      });

      // Verify we got exactly 3 months of data
      expect(uptimeResponse.body.monthly_data).toHaveLength(3);
      expect(uptimeResponse.body.time_range.total_days).toBeGreaterThanOrEqual(88); // ~3 months
      expect(uptimeResponse.body.time_range.total_days).toBeLessThanOrEqual(93);
    });

    it('should verify uptime visualization data format', async () => {
      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Get uptime data
      const uptimeResponse = await request(app)
        .get('/api/uptime/id-recognition')
        .query({ months: 3 })
        .set('Authorization', `Bearer ${token}`);

      expect(uptimeResponse.status).toBe(200);

      // Verify monthly data structure for frontend visualization
      uptimeResponse.body.monthly_data.forEach((month: any) => {
        expect(month).toMatchObject({
          month: expect.stringMatching(/^\d{4}-\d{2}$/), // YYYY-MM format
          uptime_percentage: expect.any(Number),
          daily_status: expect.any(Array),
          incident_count: expect.any(Number),
          downtime_minutes: expect.any(Number),
          days_in_month: expect.any(Number),
        });

        // Verify daily status array structure
        expect(month.daily_status).toHaveLength(month.days_in_month);

        month.daily_status.forEach((day: any, index: number) => {
          expect(day).toMatchObject({
            day: index + 1,
            status: expect.stringMatching(/^(o|po|mo|nd|e)$/), // For frontend grid
            status_full: expect.stringMatching(/^(operational|partial_outage|major_outage|no_data|empty)$/),
            uptime_percentage: expect.any(Number),
            date: expect.any(String), // ISO date
          });

          // Verify status code mapping
          switch (day.status_full) {
            case 'operational':
              expect(day.status).toBe('o');
              break;
            case 'partial_outage':
              expect(day.status).toBe('po');
              break;
            case 'major_outage':
              expect(day.status).toBe('mo');
              break;
            case 'no_data':
              expect(day.status).toBe('nd');
              break;
            case 'empty':
              expect(day.status).toBe('e');
              break;
          }

          // Verify uptime percentage is valid
          expect(day.uptime_percentage).toBeGreaterThanOrEqual(0);
          expect(day.uptime_percentage).toBeLessThanOrEqual(100);
        });

        // Verify uptime percentage calculation
        expect(month.uptime_percentage).toBeGreaterThanOrEqual(0);
        expect(month.uptime_percentage).toBeLessThanOrEqual(100);
      });
    });

    it('should test historical navigation through uptime data', async () => {
      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Test different time ranges for navigation

      // Get 1 month data
      const oneMonthResponse = await request(app)
        .get('/api/uptime/id-recognition')
        .query({ months: 1 })
        .set('Authorization', `Bearer ${token}`);

      expect(oneMonthResponse.status).toBe(200);
      expect(oneMonthResponse.body.monthly_data).toHaveLength(1);

      // Get 6 months data
      const sixMonthResponse = await request(app)
        .get('/api/uptime/id-recognition')
        .query({ months: 6 })
        .set('Authorization', `Bearer ${token}`);

      expect(sixMonthResponse.status).toBe(200);
      // Should have up to 3 months (limited by our test data)
      expect(sixMonthResponse.body.monthly_data.length).toBeLessThanOrEqual(3);

      // Test specific date range navigation
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 60); // 2 months ago
      const endDate = new Date();
      endDate.setDate(endDate.getDate() - 30); // 1 month ago

      const rangeResponse = await request(app)
        .get('/api/uptime/id-recognition')
        .query({
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
        })
        .set('Authorization', `Bearer ${token}`);

      expect(rangeResponse.status).toBe(200);
      expect(rangeResponse.body.time_range.total_days).toBeGreaterThanOrEqual(28);
      expect(rangeResponse.body.time_range.total_days).toBeLessThanOrEqual(31);
    });

    it('should calculate monthly uptime percentages correctly', async () => {
      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Get uptime data
      const uptimeResponse = await request(app)
        .get('/api/uptime/id-recognition')
        .query({ months: 3 })
        .set('Authorization', `Bearer ${token}`);

      expect(uptimeResponse.status).toBe(200);

      // Verify monthly uptime calculation accuracy
      uptimeResponse.body.monthly_data.forEach((month: any) => {
        const dailyUptimes = month.daily_status.map((day: any) => day.uptime_percentage);
        const calculatedAverage = dailyUptimes.reduce((sum: number, uptime: number) => sum + uptime, 0) / dailyUptimes.length;

        // Monthly uptime should be close to average of daily uptimes
        expect(Math.abs(month.uptime_percentage - calculatedAverage)).toBeLessThan(1.0);

        // Verify consistency with test data patterns
        // Based on our test data generation logic
        const majorOutageDays = month.daily_status.filter((day: any) => day.status === 'mo').length;
        const partialOutageDays = month.daily_status.filter((day: any) => day.status === 'po').length;
        const operationalDays = month.daily_status.filter((day: any) => day.status === 'o').length;

        expect(majorOutageDays + partialOutageDays + operationalDays).toBe(month.days_in_month);
      });

      // Verify overall metrics calculation
      const allDailyRecords = uptimeResponse.body.daily_breakdown;
      const overallAverage = allDailyRecords.reduce((sum: number, day: any) => sum + day.uptime_percentage, 0) / allDailyRecords.length;

      expect(Math.abs(uptimeResponse.body.overall_metrics.average_uptime_percentage - overallAverage)).toBeLessThan(1.0);
    });

    it('should verify frontend integration compatibility (verify-uptime app)', async () => {
      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Get service list for dropdown
      const servicesResponse = await request(app)
        .get('/api/services')
        .set('Authorization', `Bearer ${token}`);

      expect(servicesResponse.status).toBe(200);
      expect(servicesResponse.body.services).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'id-recognition',
            name: 'ID Recognition',
          }),
          expect.objectContaining({
            id: 'face-liveness',
            name: 'Face Liveness',
          }),
        ])
      );

      // Get uptime data in format expected by UptimeDisplay component
      const uptimeResponse = await request(app)
        .get('/api/uptime/id-recognition')
        .query({ months: 3 })
        .set('Authorization', `Bearer ${token}`);

      expect(uptimeResponse.status).toBe(200);

      // Verify format matches verify-uptime/src/components/sections/uptime-display.tsx
      expect(uptimeResponse.body).toMatchObject({
        service: {
          id: 'id-recognition',
          name: 'ID Recognition',
        },
        monthly_data: expect.arrayContaining([
          expect.objectContaining({
            month: expect.any(String),
            uptime_percentage: expect.any(Number),
            daily_status: expect.arrayContaining([
              expect.objectContaining({
                day: expect.any(Number),
                status: expect.stringMatching(/^(o|po|mo|nd|e)$/), // Single character for grid
                uptime_percentage: expect.any(Number),
                date: expect.any(String),
              }),
            ]),
          }),
        ]),
      });

      // Verify monthly grid structure (30-31 days per month)
      uptimeResponse.body.monthly_data.forEach((month: any) => {
        expect(month.daily_status.length).toBeGreaterThanOrEqual(28);
        expect(month.daily_status.length).toBeLessThanOrEqual(31);

        // Verify day sequence is correct (1, 2, 3, ..., 28-31)
        month.daily_status.forEach((day: any, index: number) => {
          expect(day.day).toBe(index + 1);
        });
      });
    });

    it('should compare multiple services uptime patterns', async () => {
      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Get uptime data for both services
      const idRecResponse = await request(app)
        .get('/api/uptime/id-recognition')
        .query({ months: 3 })
        .set('Authorization', `Bearer ${token}`);

      const faceLiveResponse = await request(app)
        .get('/api/uptime/face-liveness')
        .query({ months: 3 })
        .set('Authorization', `Bearer ${token}`);

      expect(idRecResponse.status).toBe(200);
      expect(faceLiveResponse.status).toBe(200);

      // Compare overall reliability
      const idRecUptime = idRecResponse.body.overall_metrics.average_uptime_percentage;
      const faceLiveUptime = faceLiveResponse.body.overall_metrics.average_uptime_percentage;

      // Based on our test data, Face Liveness should be more reliable
      expect(faceLiveUptime).toBeGreaterThan(idRecUptime);

      // Compare incident patterns
      const idRecIncidents = idRecResponse.body.overall_metrics.total_incidents;
      const faceLiveIncidents = faceLiveResponse.body.overall_metrics.total_incidents;

      expect(faceLiveIncidents).toBeLessThan(idRecIncidents);

      // Verify service-specific patterns are reflected in monthly data
      idRecResponse.body.monthly_data.forEach((month: any) => {
        // ID Recognition should have more frequent issues
        const problemDays = month.daily_status.filter((day: any) => day.status !== 'o').length;
        expect(month.incident_count).toBeGreaterThanOrEqual(0);
      });

      faceLiveResponse.body.monthly_data.forEach((month: any) => {
        // Face Liveness should be more stable
        const operationalDays = month.daily_status.filter((day: any) => day.status === 'o').length;
        expect(operationalDays).toBeGreaterThan(month.days_in_month * 0.8); // >80% operational days
      });
    });

    it('should handle edge cases and data gaps', async () => {
      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Test service with no uptime data
      await prisma.service.create({
        data: {
          id: 'new-service',
          name: 'New Service',
          type: 'api',
          url: 'https://api.company.com/new-service',
          current_status: 'operational',
        },
      });

      const newServiceResponse = await request(app)
        .get('/api/uptime/new-service')
        .query({ months: 1 })
        .set('Authorization', `Bearer ${token}`);

      expect(newServiceResponse.status).toBe(200);
      expect(newServiceResponse.body).toMatchObject({
        service: {
          id: 'new-service',
          name: 'New Service',
        },
        overall_metrics: {
          average_uptime_percentage: 0,
          total_downtime_minutes: 0,
          total_incidents: 0,
        },
        monthly_data: expect.arrayContaining([
          expect.objectContaining({
            uptime_percentage: 0,
            daily_status: expect.arrayContaining([
              expect.objectContaining({
                status: 'nd', // no_data
                status_full: 'no_data',
              }),
            ]),
          }),
        ]),
      });

      // Test invalid service ID
      const invalidResponse = await request(app)
        .get('/api/uptime/non-existent-service')
        .query({ months: 1 })
        .set('Authorization', `Bearer ${token}`);

      expect(invalidResponse.status).toBe(404);

      // Test invalid date range
      const invalidDateResponse = await request(app)
        .get('/api/uptime/id-recognition')
        .query({
          startDate: '2025-13-01', // Invalid month
          endDate: '2025-01-01',
        })
        .set('Authorization', `Bearer ${token}`);

      expect(invalidDateResponse.status).toBe(400);
    });

    it('should validate performance for large datasets', async () => {
      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Test performance with maximum months (12)
      const startTime = Date.now();

      const largeDataResponse = await request(app)
        .get('/api/uptime/id-recognition')
        .query({ months: 12 })
        .set('Authorization', `Bearer ${token}`);

      const responseTime = Date.now() - startTime;

      expect(largeDataResponse.status).toBe(200);

      // Should still meet <200ms requirement even with large dataset
      expect(responseTime).toBeLessThan(200);

      // Verify we handle the limited data gracefully (we only have 90 days)
      expect(largeDataResponse.body.monthly_data.length).toBeLessThanOrEqual(3);
      expect(largeDataResponse.body.time_range.total_days).toBeLessThanOrEqual(90);

      console.log(`Uptime API response time for 12 months: ${responseTime}ms`);
    });

    it('should verify daily status indicators display properly', async () => {
      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Get uptime data
      const uptimeResponse = await request(app)
        .get('/api/uptime/id-recognition')
        .query({ months: 3 })
        .set('Authorization', `Bearer ${token}`);

      expect(uptimeResponse.status).toBe(200);

      // Verify all status types are represented in our test data
      const allStatuses = uptimeResponse.body.daily_breakdown.map((day: any) => day.status);
      const uniqueStatuses = [...new Set(allStatuses)];

      // Should have operational ('o'), partial outage ('po'), and major outage ('mo')
      expect(uniqueStatuses).toContain('o');
      expect(uniqueStatuses).toContain('po');
      expect(uniqueStatuses).toContain('mo');

      // Verify status distribution matches our test pattern
      const operationalDays = allStatuses.filter(s => s === 'o').length;
      const partialOutageDays = allStatuses.filter(s => s === 'po').length;
      const majorOutageDays = allStatuses.filter(s => s === 'mo').length;

      // Most days should be operational
      expect(operationalDays).toBeGreaterThan(partialOutageDays + majorOutageDays);

      // Should have some outages (based on our test pattern)
      expect(partialOutageDays + majorOutageDays).toBeGreaterThan(0);

      console.log(`Status distribution - Operational: ${operationalDays}, Partial: ${partialOutageDays}, Major: ${majorOutageDays}`);
    });
  });
});
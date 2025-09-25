import request from 'supertest';
import { Express } from 'express';
import { prisma } from '../setup';

let app: Express;

describe('Contract Test: GET /api/uptime/{serviceId}', () => {
  beforeAll(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      app = require('../../src/app').default;
    } catch (error) {
      console.log('App not implemented yet - tests will fail as expected (TDD)');
    }
  });

  beforeEach(async () => {
    // Create test service
    await prisma.service.create({
      data: {
        id: 'id-recognition',
        name: 'ID Recognition',
        description: 'Identity document verification service',
        endpoint_url: 'https://api.company.com/id-recognition/health',
      },
    });

    // Create 90 days of uptime data for testing
    const uptimeData = [];
    const today = new Date();
    
    for (let i = 0; i < 90; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      
      // Create varied status pattern for testing
      let status: 'o' | 'po' | 'mo' | 'nd' | 'e';
      let responseTime: number | null = null;
      let errorMessage: string | null = null;

      if (i < 5) {
        // Recent 5 days - operational
        status = 'o';
        responseTime = 150 + Math.floor(Math.random() * 100);
      } else if (i < 10) {
        // Days 5-10 - partial outage
        status = 'po';
        responseTime = 800 + Math.floor(Math.random() * 200);
      } else if (i < 12) {
        // Days 10-12 - major outage
        status = 'mo';
        errorMessage = 'Service unavailable';
      } else if (i < 15) {
        // Days 12-15 - no data
        status = 'nd';
      } else {
        // Older days - mostly operational with occasional issues
        const rand = Math.random();
        if (rand < 0.9) {
          status = 'o';
          responseTime = 120 + Math.floor(Math.random() * 80);
        } else if (rand < 0.95) {
          status = 'po';
          responseTime = 600 + Math.floor(Math.random() * 400);
        } else {
          status = 'mo';
          errorMessage = 'Temporary outage';
        }
      }

      uptimeData.push({
        service_id: 'id-recognition',
        date,
        status,
        response_time: responseTime,
        error_message: errorMessage,
      });
    }

    await prisma.uptimeRecord.createMany({
      data: uptimeData,
    });
  });

  it('should return uptime data with correct structure (default 3 months)', async () => {
    if (!app) {
      expect(app).toBeDefined();
      return;
    }

    const response = await request(app)
      .get('/api/uptime/id-recognition')
      .expect(200);

    // Verify response structure matches OpenAPI contract
    expect(response.body).toHaveProperty('service');
    expect(response.body).toHaveProperty('months');

    // Verify service info
    expect(response.body.service.id).toBe('id-recognition');
    expect(response.body.service.name).toBe('ID Recognition');

    // Verify months array
    expect(Array.isArray(response.body.months)).toBe(true);
    expect(response.body.months.length).toBe(3); // Default 3 months

    // Verify each month structure
    response.body.months.forEach((month: any) => {
      expect(month).toHaveProperty('name');
      expect(month).toHaveProperty('uptime');
      expect(month).toHaveProperty('days');

      // Verify month name format
      expect(month.name).toMatch(/^[A-Za-z]+ \d{4}$/);

      // Verify uptime percentage format
      expect(typeof month.uptime).toBe('string');
      expect(month.uptime).toMatch(/^\d+\.\d{2}$/);

      // Verify days array
      expect(Array.isArray(month.days)).toBe(true);
      expect(month.days.length).toBeGreaterThan(20); // At least 28-31 days
      expect(month.days.length).toBeLessThanOrEqual(31);

      // Verify each day status
      month.days.forEach((dayStatus: string) => {
        expect(['o', 'po', 'mo', 'nd', 'e']).toContain(dayStatus);
      });
    });
  });

  it('should support custom months parameter', async () => {
    if (!app) {
      expect(app).toBeDefined();
      return;
    }

    const response = await request(app)
      .get('/api/uptime/id-recognition?months=6')
      .expect(200);

    expect(response.body.months.length).toBe(6);
  });

  it('should support startDate parameter', async () => {
    if (!app) {
      expect(app).toBeDefined();
      return;
    }

    const startDate = '2025-06-01';
    const response = await request(app)
      .get(`/api/uptime/id-recognition?startDate=${startDate}`)
      .expect(200);

    // Should return 3 months starting from June 2025
    const monthNames = response.body.months.map((m: any) => m.name);
    expect(monthNames[0]).toContain('June 2025');
  });

  it('should validate months parameter range', async () => {
    if (!app) {
      expect(app).toBeDefined();
      return;
    }

    // Test minimum (1 month)
    await request(app)
      .get('/api/uptime/id-recognition?months=1')
      .expect(200);

    // Test maximum (12 months)
    await request(app)
      .get('/api/uptime/id-recognition?months=12')
      .expect(200);

    // Test invalid values
    await request(app)
      .get('/api/uptime/id-recognition?months=0')
      .expect(400);

    await request(app)
      .get('/api/uptime/id-recognition?months=13')
      .expect(400);
  });

  it('should return 404 for non-existent service', async () => {
    if (!app) {
      expect(app).toBeDefined();
      return;
    }

    const response = await request(app)
      .get('/api/uptime/non-existent-service')
      .expect(404);

    expect(response.body).toHaveProperty('error');
    expect(response.body).toHaveProperty('message');
  });

  it('should calculate uptime percentages correctly', async () => {
    if (!app) {
      expect(app).toBeDefined();
      return;
    }

    const response = await request(app)
      .get('/api/uptime/id-recognition')
      .expect(200);

    const currentMonth = response.body.months[0];
    
    // Count operational days in current month
    const operationalDays = currentMonth.days.filter((day: string) => day === 'o').length;
    const totalDays = currentMonth.days.length;
    const expectedUptime = (operationalDays / totalDays) * 100;

    const actualUptime = parseFloat(currentMonth.uptime);
    
    // Allow small floating point differences
    expect(Math.abs(actualUptime - expectedUptime)).toBeLessThan(0.01);
  });

  it('should handle service with no uptime data', async () => {
    if (!app) {
      expect(app).toBeDefined();
      return;
    }

    // Create service with no uptime records
    await prisma.service.create({
      data: {
        id: 'new-service',
        name: 'New Service',
      },
    });

    const response = await request(app)
      .get('/api/uptime/new-service')
      .expect(200);

    expect(response.body.service.id).toBe('new-service');
    expect(response.body.months.length).toBe(3);

    // All days should be 'e' (empty) when no data
    response.body.months.forEach((month: any) => {
      month.days.forEach((day: string) => {
        expect(day).toBe('e');
      });
      expect(month.uptime).toBe('0.00');
    });
  });

  it('should return proper status codes based on uptime data', async () => {
    if (!app) {
      expect(app).toBeDefined();
      return;
    }

    const response = await request(app)
      .get('/api/uptime/id-recognition')
      .expect(200);

    const currentMonth = response.body.months[0];
    
    // Based on our test data pattern
    const statusCounts = currentMonth.days.reduce((acc: any, status: string) => {
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    // Should have operational days from recent 5 days
    expect(statusCounts.o).toBeGreaterThan(0);
    
    // Should have partial outages from days 5-10
    expect(statusCounts.po).toBeGreaterThan(0);
  });

  it('should return 500 on database error', async () => {
    if (!app) {
      expect(app).toBeDefined();
      return;
    }

    await prisma.$disconnect();

    const response = await request(app)
      .get('/api/uptime/id-recognition')
      .expect(500);

    expect(response.body).toHaveProperty('error');
    expect(response.body).toHaveProperty('message');

    await prisma.$connect();
  });

  it('should respond within 200ms (performance requirement)', async () => {
    if (!app) {
      expect(app).toBeDefined();
      return;
    }

    const startTime = Date.now();
    await request(app).get('/api/uptime/id-recognition').expect(200);
    const endTime = Date.now();

    const responseTime = endTime - startTime;
    expect(responseTime).toBeLessThan(200);
  });

  it('should handle empty status correctly in days array', async () => {
    if (!app) {
      expect(app).toBeDefined();
      return;
    }

    // Clean existing data and create service with gaps
    await prisma.uptimeRecord.deleteMany();
    
    const today = new Date();
    
    // Create data only for every other day
    for (let i = 0; i < 10; i += 2) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      
      await prisma.uptimeRecord.create({
        data: {
          service_id: 'id-recognition',
          date,
          status: 'o',
          response_time: 150,
        },
      });
    }

    const response = await request(app)
      .get('/api/uptime/id-recognition')
      .expect(200);

    const currentMonth = response.body.months[0];
    
    // Should have both 'o' (operational) and 'e' (empty/no data) days
    const hasOperational = currentMonth.days.some((day: string) => day === 'o');
    const hasEmpty = currentMonth.days.some((day: string) => day === 'e');
    
    expect(hasOperational).toBe(true);
    expect(hasEmpty).toBe(true);
  });
});
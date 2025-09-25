import request from 'supertest';
import { Express } from 'express';
import { prisma } from '../setup';

// This will be imported when app is implemented
let app: Express;

describe('Contract Test: GET /api/system-status', () => {
  beforeAll(() => {
    // This WILL FAIL until we implement the app
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      app = require('../../src/app').default;
    } catch (error) {
      console.log('App not implemented yet - tests will fail as expected (TDD)');
    }
  });

  beforeEach(async () => {
    // Seed test data for system status
    await prisma.service.createMany({
      data: [
        {
          id: 'id-recognition',
          name: 'ID Recognition',
          description: 'Identity document verification service',
          endpoint_url: 'https://api.company.com/id-recognition/health',
        },
        {
          id: 'face-liveness',
          name: 'Face Liveness',
          description: 'Face liveness detection service',
          endpoint_url: 'https://api.company.com/face-liveness/health',
        },
        {
          id: 'id-liveness',
          name: 'ID Liveness',
          description: 'ID document liveness verification',
          endpoint_url: 'https://api.company.com/id-liveness/health',
        },
        {
          id: 'face-compare',
          name: 'Face Compare',
          description: 'Facial comparison verification',
          endpoint_url: 'https://api.company.com/face-compare/health',
        },
        {
          id: 'curp-verifier',
          name: 'Curp Verifier',
          description: 'CURP document verification service',
          endpoint_url: 'https://api.company.com/curp-verifier/health',
        },
      ],
    });

    // Create uptime records for the services
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    await prisma.uptimeRecord.createMany({
      data: [
        {
          service_id: 'id-recognition',
          date: today,
          status: 'o', // operational
          response_time: 150,
        },
        {
          service_id: 'id-recognition',
          date: yesterday,
          status: 'o',
          response_time: 200,
        },
        {
          service_id: 'face-liveness',
          date: today,
          status: 'po', // partial outage
          response_time: 800,
        },
        {
          service_id: 'face-liveness',
          date: yesterday,
          status: 'o',
          response_time: 250,
        },
        {
          service_id: 'id-liveness',
          date: today,
          status: 'o',
          response_time: 120,
        },
        {
          service_id: 'face-compare',
          date: today,
          status: 'mo', // major outage
          response_time: null,
          error_message: 'Service unavailable',
        },
        {
          service_id: 'curp-verifier',
          date: today,
          status: 'o',
          response_time: 180,
        },
      ],
    });

    // Create system status record
    await prisma.systemStatus.create({
      data: {
        overall_status: 'degraded', // Because we have partial and major outages
        message: 'Some services are experiencing issues',
      },
    });
  });

  it('should return system status with correct structure', async () => {
    if (!app) {
      // This test MUST FAIL initially (TDD RED phase)
      expect(app).toBeDefined();
      return;
    }

    const response = await request(app).get('/api/system-status').expect(200);

    // Verify response structure matches OpenAPI contract
    expect(response.body).toHaveProperty('overallStatus');
    expect(response.body).toHaveProperty('lastUpdated');
    expect(response.body).toHaveProperty('services');

    // Verify overall status
    expect(response.body.overallStatus).toBe('degraded');

    // Verify services array structure
    expect(Array.isArray(response.body.services)).toBe(true);
    expect(response.body.services.length).toBe(5);

    // Verify each service has required fields
    response.body.services.forEach((service: any) => {
      expect(service).toHaveProperty('id');
      expect(service).toHaveProperty('name');
      expect(service).toHaveProperty('status');
      expect(service).toHaveProperty('uptime');
      expect(service).toHaveProperty('uptimeData');

      // Verify status is valid enum value
      expect(['operational', 'degraded', 'outage']).toContain(service.status);

      // Verify uptime is string percentage
      expect(typeof service.uptime).toBe('string');
      expect(service.uptime).toMatch(/^\d+\.\d{2}$/);

      // Verify uptimeData is array of 90 status codes
      expect(Array.isArray(service.uptimeData)).toBe(true);
      expect(service.uptimeData.length).toBe(90);
      
      service.uptimeData.forEach((status: string) => {
        expect(['o', 'po', 'mo', 'nd', 'e']).toContain(status);
      });
    });

    // Verify specific service statuses based on our test data
    const idRecognitionService = response.body.services.find((s: any) => s.id === 'id-recognition');
    expect(idRecognitionService.status).toBe('operational');

    const faceLivenessService = response.body.services.find((s: any) => s.id === 'face-liveness');
    expect(faceLivenessService.status).toBe('degraded');

    const faceCompareService = response.body.services.find((s: any) => s.id === 'face-compare');
    expect(faceCompareService.status).toBe('outage');

    // Verify lastUpdated is recent ISO date
    const lastUpdated = new Date(response.body.lastUpdated);
    const now = new Date();
    const diffMs = Math.abs(now.getTime() - lastUpdated.getTime());
    expect(diffMs).toBeLessThan(60000); // Within 1 minute
  });

  it('should handle empty database gracefully', async () => {
    if (!app) {
      expect(app).toBeDefined();
      return;
    }

    // Clean all data
    await prisma.$executeRaw`TRUNCATE TABLE "system_status", "uptime_records", "services" RESTART IDENTITY CASCADE;`;

    const response = await request(app).get('/api/system-status').expect(200);

    expect(response.body.overallStatus).toBe('operational'); // Default when no data
    expect(response.body.services).toEqual([]);
  });

  it('should return 500 on database error', async () => {
    if (!app) {
      expect(app).toBeDefined();
      return;
    }

    // Mock database error by disconnecting
    await prisma.$disconnect();

    const response = await request(app).get('/api/system-status').expect(500);

    expect(response.body).toHaveProperty('error');
    expect(response.body).toHaveProperty('message');

    // Reconnect for cleanup
    await prisma.$connect();
  });

  it('should calculate uptime percentages correctly', async () => {
    if (!app) {
      expect(app).toBeDefined();
      return;
    }

    const response = await request(app).get('/api/system-status').expect(200);

    // ID Recognition should have 100% uptime (2/2 operational days)
    const idRecognitionService = response.body.services.find((s: any) => s.id === 'id-recognition');
    expect(parseFloat(idRecognitionService.uptime)).toBeGreaterThan(95);

    // Face Liveness should have lower uptime (1 operational, 1 partial outage)
    const faceLivenessService = response.body.services.find((s: any) => s.id === 'face-liveness');
    expect(parseFloat(faceLivenessService.uptime)).toBeLessThan(100);
  });

  it('should respond within 200ms (performance requirement)', async () => {
    if (!app) {
      expect(app).toBeDefined();
      return;
    }

    const startTime = Date.now();
    await request(app).get('/api/system-status').expect(200);
    const endTime = Date.now();

    const responseTime = endTime - startTime;
    expect(responseTime).toBeLessThan(200);
  });
});
import request from 'supertest';
import { Express } from 'express';
import { prisma } from '../setup';

let app: Express;

describe('Contract Test: GET /api/services', () => {
  beforeAll(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      app = require('../../src/app').default;
    } catch (error) {
      console.log('App not implemented yet - tests will fail as expected (TDD)');
    }
  });

  beforeEach(async () => {
    // Seed test services data
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
  });

  it('should return all services with correct structure', async () => {
    if (!app) {
      expect(app).toBeDefined();
      return;
    }

    const response = await request(app).get('/api/services').expect(200);

    // Verify response structure matches OpenAPI contract
    expect(response.body).toHaveProperty('services');
    expect(Array.isArray(response.body.services)).toBe(true);
    expect(response.body.services.length).toBe(5);

    // Verify each service has all required fields
    response.body.services.forEach((service: any) => {
      expect(service).toHaveProperty('id');
      expect(service).toHaveProperty('name');
      expect(service).toHaveProperty('description');
      expect(service).toHaveProperty('endpoint_url');
      expect(service).toHaveProperty('created_at');
      expect(service).toHaveProperty('updated_at');

      // Verify field types
      expect(typeof service.id).toBe('string');
      expect(typeof service.name).toBe('string');
      expect(typeof service.description).toBe('string');
      expect(typeof service.endpoint_url).toBe('string');
      expect(typeof service.created_at).toBe('string');
      expect(typeof service.updated_at).toBe('string');

      // Verify ID format (kebab-case)
      expect(service.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);

      // Verify endpoint_url is valid URL
      expect(service.endpoint_url).toMatch(/^https?:\/\/.+/);

      // Verify timestamps are valid ISO dates
      expect(() => new Date(service.created_at)).not.toThrow();
      expect(() => new Date(service.updated_at)).not.toThrow();
    });

    // Verify specific services exist
    const serviceIds = response.body.services.map((s: any) => s.id);
    expect(serviceIds).toContain('id-recognition');
    expect(serviceIds).toContain('face-liveness');
    expect(serviceIds).toContain('id-liveness');
    expect(serviceIds).toContain('face-compare');
    expect(serviceIds).toContain('curp-verifier');
  });

  it('should return empty array when no services exist', async () => {
    if (!app) {
      expect(app).toBeDefined();
      return;
    }

    // Clean all services
    await prisma.service.deleteMany();

    const response = await request(app).get('/api/services').expect(200);

    expect(response.body.services).toEqual([]);
  });

  it('should return services sorted by name', async () => {
    if (!app) {
      expect(app).toBeDefined();
      return;
    }

    const response = await request(app).get('/api/services').expect(200);

    const serviceNames = response.body.services.map((s: any) => s.name);
    const sortedNames = [...serviceNames].sort();
    
    expect(serviceNames).toEqual(sortedNames);
  });

  it('should handle optional fields correctly', async () => {
    if (!app) {
      expect(app).toBeDefined();
      return;
    }

    // Create service with minimal fields
    await prisma.service.deleteMany();
    await prisma.service.create({
      data: {
        id: 'minimal-service',
        name: 'Minimal Service',
        // description and endpoint_url are optional
      },
    });

    const response = await request(app).get('/api/services').expect(200);

    expect(response.body.services.length).toBe(1);
    const service = response.body.services[0];
    
    expect(service.id).toBe('minimal-service');
    expect(service.name).toBe('Minimal Service');
    expect(service.description).toBeNull();
    expect(service.endpoint_url).toBeNull();
  });

  it('should return 500 on database error', async () => {
    if (!app) {
      expect(app).toBeDefined();
      return;
    }

    // Mock database error
    await prisma.$disconnect();

    const response = await request(app).get('/api/services').expect(500);

    expect(response.body).toHaveProperty('error');
    expect(response.body).toHaveProperty('message');

    // Reconnect for cleanup
    await prisma.$connect();
  });

  it('should support up to 50 services (scalability requirement)', async () => {
    if (!app) {
      expect(app).toBeDefined();
      return;
    }

    // Clean existing data
    await prisma.service.deleteMany();

    // Create 50 services
    const services = Array.from({ length: 50 }, (_, i) => ({
      id: `service-${String(i + 1).padStart(3, '0')}`,
      name: `Service ${i + 1}`,
      description: `Test service number ${i + 1}`,
      endpoint_url: `https://api.example.com/service-${i + 1}/health`,
    }));

    await prisma.service.createMany({
      data: services,
    });

    const response = await request(app).get('/api/services').expect(200);

    expect(response.body.services.length).toBe(50);
    
    // Verify all services are returned correctly
    response.body.services.forEach((service: any, index: number) => {
      expect(service.id).toMatch(/^service-\d{3}$/);
      expect(service.name).toMatch(/^Service \d+$/);
    });
  });

  it('should respond within 200ms (performance requirement)', async () => {
    if (!app) {
      expect(app).toBeDefined();
      return;
    }

    const startTime = Date.now();
    await request(app).get('/api/services').expect(200);
    const endTime = Date.now();

    const responseTime = endTime - startTime;
    expect(responseTime).toBeLessThan(200);
  });
});
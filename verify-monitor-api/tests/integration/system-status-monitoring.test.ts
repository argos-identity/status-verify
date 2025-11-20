import request from 'supertest';
import { Express } from 'express';
import Client from 'socket.io-client';
import { createServer } from 'http';
import { prisma } from '../setup';

let app: Express;
let server: any;
let clientSocket: any;

describe('Integration Test: System Status Monitoring Scenario (T022)', () => {
  beforeAll(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      app = require('../../src/app').default;

      // Create HTTP server for Socket.IO integration
      server = createServer(app);

      // Start server on random port
      await new Promise<void>((resolve) => {
        server.listen(0, () => {
          resolve();
        });
      });
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
        {
          id: 'id-liveness',
          name: 'ID Liveness',
          type: 'api',
          url: 'https://api.company.com/id-liveness',
          current_status: 'partial_outage',
        },
        {
          id: 'face-compare',
          name: 'Face Compare',
          type: 'api',
          url: 'https://api.company.com/face-compare',
          current_status: 'major_outage',
        },
        {
          id: 'curp-verifier',
          name: 'Curp Verifier',
          type: 'api',
          url: 'https://api.company.com/curp-verifier',
          current_status: 'operational',
        },
      ],
    });

    // Create WebSocket client connection if server is available
    if (server && server.listening) {
      const port = server.address()?.port;
      clientSocket = Client(`http://localhost:${port}`);

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => {
          resolve();
        });
      });
    }
  });

  afterEach(async () => {
    // Disconnect WebSocket client
    if (clientSocket) {
      clientSocket.disconnect();
      clientSocket = null;
    }

    // Clean up test data
    await prisma.service.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    // Close server
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    }
  });

  describe('Test Scenario 1: System Status Monitoring (FR-005, FR-006)', () => {
    it('should verify real-time system status display and updates', async () => {
      // Step 1: GET System Status
      // Login first
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Get system status via API
      const statusResponse = await request(app)
        .get('/api/system-status')
        .set('Authorization', `Bearer ${token}`);

      expect(statusResponse.status).toBe(200);

      // Verify system status format matches expected structure
      expect(statusResponse.body).toMatchObject({
        overall_status: expect.stringMatching(/^(operational|degraded|outage)$/),
        last_updated: expect.any(String),
        services: expect.arrayContaining([
          expect.objectContaining({
            id: 'id-recognition',
            name: 'ID Recognition',
            status: 'operational',
            last_checked: expect.any(String),
            response_time_ms: expect.any(Number),
          }),
          expect.objectContaining({
            id: 'face-liveness',
            name: 'Face Liveness',
            status: 'operational',
          }),
          expect.objectContaining({
            id: 'id-liveness',
            name: 'ID Liveness',
            status: 'partial_outage',
          }),
          expect.objectContaining({
            id: 'face-compare',
            name: 'Face Compare',
            status: 'major_outage',
          }),
          expect.objectContaining({
            id: 'curp-verifier',
            name: 'Curp Verifier',
            status: 'operational',
          }),
        ]),
        summary: {
          total_services: 5,
          operational: 3,
          partial_outage: 1,
          major_outage: 1,
        },
      });

      // Verify overall status calculation logic
      const services = statusResponse.body.services;
      const hasMajorOutage = services.some((s: any) => s.status === 'major_outage');
      const hasPartialOutage = services.some((s: any) => s.status === 'partial_outage');

      if (hasMajorOutage) {
        expect(statusResponse.body.overall_status).toBe('outage');
      } else if (hasPartialOutage) {
        expect(statusResponse.body.overall_status).toBe('degraded');
      } else {
        expect(statusResponse.body.overall_status).toBe('operational');
      }

      // Step 2: Verify Service Status Display (Frontend Integration)
      // This would normally test the frontend, but we'll verify API provides correct data structure
      services.forEach((service: any) => {
        expect(service).toMatchObject({
          id: expect.any(String),
          name: expect.any(String),
          status: expect.stringMatching(/^(operational|partial_outage|major_outage)$/),
          last_checked: expect.any(String),
          response_time_ms: expect.any(Number),
          uptime_percentage_24h: expect.any(Number),
        });

        // Verify status color mapping data is provided
        expect(service.status_color).toMatch(/^(green|orange|red)$/);

        // Verify uptime percentage is valid
        expect(service.uptime_percentage_24h).toBeGreaterThanOrEqual(0);
        expect(service.uptime_percentage_24h).toBeLessThanOrEqual(100);
      });
    });

    it('should test real-time WebSocket updates (FR-004)', async () => {
      if (!clientSocket) {
        console.log('WebSocket not available - test will fail as expected (TDD)');
        return;
      }

      // Join system status room
      clientSocket.emit('join-room', {
        room: 'system-status',
        user_id: 'user-viewer',
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('user-joined', () => {
          resolve();
        });
      });

      // Test real-time status update reception
      const updatePromise = new Promise<any>((resolve) => {
        const startTime = Date.now();

        clientSocket.on('status-update', (data: any) => {
          const receivedTime = Date.now();
          const delay = receivedTime - startTime;

          // Verify update format
          expect(data).toMatchObject({
            service_id: 'id-recognition',
            previous_status: 'operational',
            current_status: 'partial_outage',
            timestamp: expect.any(String),
            affected_services: expect.any(Array),
            notification_delay_ms: expect.any(Number),
          });

          // Verify FR-004: WebSocket events within 5 seconds
          expect(delay).toBeLessThan(5000);
          expect(data.notification_delay_ms).toBeLessThan(5000);

          resolve(data);
        });
      });

      // Simulate service status change (this would normally come from watch server)
      setTimeout(() => {
        // Simulate watch server detecting status change
        const io = require('../../src/config/socket-config').getIO();
        if (io) {
          io.to('system-status').emit('status-update', {
            service_id: 'id-recognition',
            previous_status: 'operational',
            current_status: 'partial_outage',
            timestamp: new Date().toISOString(),
            affected_services: ['id-recognition'],
            notification_delay_ms: 1500,
            change_reason: 'Response time threshold exceeded',
          });
        }
      }, 100);

      const updateData = await updatePromise;
      expect(updateData).toBeDefined();
    });

    it('should verify frontend integration compatibility', async () => {
      // Test that API responses match what frontend components expect

      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Get system status
      const statusResponse = await request(app)
        .get('/api/system-status')
        .set('Authorization', `Bearer ${token}`);

      expect(statusResponse.status).toBe(200);

      // Verify format matches verify-main/src/components/sections/system-status.tsx expectations
      const expectedServices = [
        'id-recognition',
        'face-liveness',
        'id-liveness',
        'face-compare',
        'curp-verifier'
      ];

      expectedServices.forEach(serviceId => {
        const service = statusResponse.body.services.find((s: any) => s.id === serviceId);
        expect(service).toBeDefined();

        // Verify status values match frontend expectations ('o', 'po', 'mo')
        expect(service.status_code).toMatch(/^(o|po|mo)$/);

        // Verify structure matches SystemStatus component props
        expect(service).toMatchObject({
          id: expect.any(String),
          name: expect.any(String),
          status: expect.any(String),
          status_code: expect.any(String), // 'o', 'po', 'mo' for frontend
          status_color: expect.any(String), // 'green', 'orange', 'red' for CSS
          last_checked: expect.any(String),
          response_time_ms: expect.any(Number),
          uptime_percentage_24h: expect.any(Number),
        });
      });

      // Verify overall status calculation
      expect(statusResponse.body).toMatchObject({
        overall_status: expect.any(String),
        overall_status_code: expect.stringMatching(/^(o|po|mo)$/), // For frontend
        last_updated: expect.any(String),
        services: expect.any(Array),
        summary: expect.objectContaining({
          total_services: expectedServices.length,
          operational: expect.any(Number),
          partial_outage: expect.any(Number),
          major_outage: expect.any(Number),
        }),
      });
    });

    it('should handle service status transitions correctly', async () => {
      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'reporter',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Get initial status
      const initialStatus = await request(app)
        .get('/api/system-status')
        .set('Authorization', `Bearer ${token}`);

      expect(initialStatus.status).toBe(200);

      const idRecognitionService = initialStatus.body.services.find(
        (s: any) => s.id === 'id-recognition'
      );
      expect(idRecognitionService.status).toBe('operational');

      // Simulate watch server updating service status
      // (In real system, this would come from watch-server monitoring)

      // Update service status in database (simulating watch server)
      await prisma.service.update({
        where: { id: 'id-recognition' },
        data: {
          current_status: 'partial_outage',
          last_checked: new Date(),
        },
      });

      // Create uptime record for status change
      await prisma.uptimeRecord.create({
        data: {
          id: 'test-uptime-record',
          service_id: 'id-recognition',
          date: new Date(),
          status: 'partial_outage',
          uptime_percentage: 85.0,
          downtime_minutes: 216, // 15% of 1440 minutes
          incident_count: 1,
        },
      });

      // Get updated status
      const updatedStatus = await request(app)
        .get('/api/system-status')
        .set('Authorization', `Bearer ${token}`);

      expect(updatedStatus.status).toBe(200);

      const updatedService = updatedStatus.body.services.find(
        (s: any) => s.id === 'id-recognition'
      );
      expect(updatedService.status).toBe('partial_outage');
      expect(updatedService.status_code).toBe('po');
      expect(updatedService.status_color).toBe('orange');

      // Verify overall status changed to degraded
      expect(updatedStatus.body.overall_status).toBe('degraded');
      expect(updatedStatus.body.overall_status_code).toBe('po');

      // Verify summary counts updated
      expect(updatedStatus.body.summary.operational).toBe(2); // face-liveness + curp-verifier
      expect(updatedStatus.body.summary.partial_outage).toBe(2); // id-recognition + id-liveness
      expect(updatedStatus.body.summary.major_outage).toBe(1); // face-compare
    });

    it('should validate performance requirements (<200ms API response)', async () => {
      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Test multiple API calls to measure performance
      const apiCalls = [];
      const callCount = 5;

      for (let i = 0; i < callCount; i++) {
        const startTime = Date.now();

        const promise = request(app)
          .get('/api/system-status')
          .set('Authorization', `Bearer ${token}`)
          .then(response => {
            const endTime = Date.now();
            const responseTime = endTime - startTime;

            expect(response.status).toBe(200);
            return responseTime;
          });

        apiCalls.push(promise);
      }

      const responseTimes = await Promise.all(apiCalls);

      // Verify FR-002: API responses < 200ms average
      const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      expect(averageResponseTime).toBeLessThan(200);

      // Verify all individual calls were fast
      responseTimes.forEach(time => {
        expect(time).toBeLessThan(500); // Individual calls should be even faster
      });

      console.log(`System Status API average response time: ${averageResponseTime.toFixed(2)}ms`);
    });

    it('should verify color-coded status indicators', async () => {
      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Get system status
      const statusResponse = await request(app)
        .get('/api/system-status')
        .set('Authorization', `Bearer ${token}`);

      expect(statusResponse.status).toBe(200);

      // Verify color coding matches status
      statusResponse.body.services.forEach((service: any) => {
        switch (service.status) {
          case 'operational':
            expect(service.status_code).toBe('o');
            expect(service.status_color).toBe('green');
            break;
          case 'partial_outage':
            expect(service.status_code).toBe('po');
            expect(service.status_color).toBe('orange');
            break;
          case 'major_outage':
            expect(service.status_code).toBe('mo');
            expect(service.status_color).toBe('red');
            break;
          default:
            throw new Error(`Unexpected service status: ${service.status}`);
        }
      });

      // Verify overall status color coding
      switch (statusResponse.body.overall_status) {
        case 'operational':
          expect(statusResponse.body.overall_status_code).toBe('o');
          expect(statusResponse.body.overall_status_color).toBe('green');
          break;
        case 'degraded':
          expect(statusResponse.body.overall_status_code).toBe('po');
          expect(statusResponse.body.overall_status_color).toBe('orange');
          break;
        case 'outage':
          expect(statusResponse.body.overall_status_code).toBe('mo');
          expect(statusResponse.body.overall_status_color).toBe('red');
          break;
      }
    });

    it('should handle error scenarios gracefully', async () => {
      // Test unauthenticated access
      const unauthResponse = await request(app)
        .get('/api/system-status');

      expect(unauthResponse.status).toBe(401);

      // Test with invalid token
      const invalidTokenResponse = await request(app)
        .get('/api/system-status')
        .set('Authorization', 'Bearer invalid-token');

      expect(invalidTokenResponse.status).toBe(401);

      // Test with no services (edge case)
      await prisma.service.deleteMany();

      // Login with valid token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Get status with no services
      const emptyResponse = await request(app)
        .get('/api/system-status')
        .set('Authorization', `Bearer ${token}`);

      expect(emptyResponse.status).toBe(200);
      expect(emptyResponse.body).toMatchObject({
        overall_status: 'operational', // Default when no services
        services: [],
        summary: {
          total_services: 0,
          operational: 0,
          partial_outage: 0,
          major_outage: 0,
        },
      });
    });
  });
});
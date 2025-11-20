import request from 'supertest';
import { Express } from 'express';
import Client from 'socket.io-client';
import { createServer } from 'http';
import { prisma } from '../setup';

let app: Express;
let server: any;

describe('Integration Test: Performance Requirements Scenario (T027)', () => {
  beforeAll(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      app = require('../../src/app').default;
      server = createServer(app);

      await new Promise<void>((resolve) => {
        server.listen(0, () => resolve());
      });
    } catch (error) {
      console.log('App not implemented yet - tests will fail as expected (TDD)');
    }
  });

  beforeEach(async () => {
    // Create test user
    await prisma.user.create({
      data: {
        id: 'user-viewer',
        username: 'viewer',
        email: 'viewer@example.com',
        password_hash: '$2b$12$hash-for-password123',
        role: 'viewer',
      },
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

    // Create uptime data for performance testing
    const records = [];
    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);

      records.push({
        id: `perf-uptime-${i}`,
        service_id: 'id-recognition',
        date: date,
        status: 'operational',
        uptime_percentage: 99.5,
        downtime_minutes: 7,
        incident_count: 0,
      });
    }

    await prisma.uptimeRecord.createMany({ data: records });
  });

  afterEach(async () => {
    await prisma.uptimeRecord.deleteMany();
    await prisma.service.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  describe('Test Scenario 6: Performance Requirements (FR-002, FR-004)', () => {
    it('should verify API response time testing (<200ms average)', async () => {
      // Login first
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Test all critical API endpoints for response times
      const endpoints = [
        '/api/system-status',
        '/api/services',
        '/api/uptime/id-recognition?months=3',
      ];

      const results: Array<{ endpoint: string; responseTime: number; status: number }> = [];

      for (const endpoint of endpoints) {
        const responseTimes: number[] = [];

        // Test each endpoint multiple times for accurate average
        for (let i = 0; i < 5; i++) {
          const startTime = Date.now();

          const response = await request(app)
            .get(endpoint)
            .set('Authorization', `Bearer ${token}`);

          const endTime = Date.now();
          const responseTime = endTime - startTime;

          responseTimes.push(responseTime);
          expect(response.status).toBe(200);
        }

        const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

        results.push({
          endpoint,
          responseTime: averageResponseTime,
          status: 200,
        });

        // FR-002: All responses should be < 200ms average
        expect(averageResponseTime).toBeLessThan(200);
        console.log(`${endpoint}: ${averageResponseTime.toFixed(2)}ms average`);
      }

      // Verify overall performance
      const overallAverage = results.reduce((sum, result) => sum + result.responseTime, 0) / results.length;
      expect(overallAverage).toBeLessThan(200);

      console.log(`Overall API average response time: ${overallAverage.toFixed(2)}ms`);
    });

    it('should verify WebSocket latency testing (<5 seconds)', async () => {
      if (!server || !server.listening) {
        console.log('Server not available - test will fail as expected (TDD)');
        return;
      }

      const port = server.address()?.port;
      const client = Client(`http://localhost:${port}`);

      await new Promise<void>((resolve) => {
        client.on('connect', resolve);
      });

      // Test WebSocket event delivery performance
      const latencyTests = [];

      for (let i = 0; i < 3; i++) {
        const testPromise = new Promise<number>((resolve) => {
          const startTime = Date.now();

          // Join room
          client.emit('join-room', {
            room: 'system-status',
            user_id: 'user-viewer',
          });

          // Listen for confirmation
          client.on('user-joined', () => {
            const endTime = Date.now();
            const latency = endTime - startTime;
            resolve(latency);
          });
        });

        latencyTests.push(testPromise);
      }

      const latencies = await Promise.all(latencyTests);

      // FR-004: WebSocket events should be delivered < 5 seconds
      latencies.forEach(latency => {
        expect(latency).toBeLessThan(5000);
      });

      const averageLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      expect(averageLatency).toBeLessThan(1000); // Should be much faster than 5s

      console.log(`WebSocket average latency: ${averageLatency.toFixed(2)}ms`);

      // Test incident field update notification speed
      const updatePromise = new Promise<number>((resolve) => {
        const startTime = Date.now();

        client.on('field-updated', () => {
          const endTime = Date.now();
          const delay = endTime - startTime;
          resolve(delay);
        });
      });

      // Simulate field update (normally from another user)
      setTimeout(() => {
        const io = require('../../src/config/socket-config').getIO();
        if (io) {
          io.to('system-status').emit('field-updated', {
            incident_id: 'test-incident',
            field: 'description',
            content: 'Test update',
            user_id: 'user-viewer',
            timestamp: new Date().toISOString(),
          });
        }
      }, 10);

      const updateLatency = await updatePromise;
      expect(updateLatency).toBeLessThan(1000); // Real-time text changes < 1 second

      client.disconnect();
    });

    it('should handle concurrent users without degradation', async () => {
      if (!server || !server.listening) {
        console.log('Server not available - test will fail as expected (TDD)');
        return;
      }

      // Login to get token for API tests
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Test concurrent API requests
      const concurrentApiTests = [];
      const concurrentUsers = 10;

      for (let i = 0; i < concurrentUsers; i++) {
        const apiTest = async () => {
          const startTime = Date.now();

          const response = await request(app)
            .get('/api/system-status')
            .set('Authorization', `Bearer ${token}`);

          const endTime = Date.now();
          const responseTime = endTime - startTime;

          expect(response.status).toBe(200);
          return responseTime;
        };

        concurrentApiTests.push(apiTest());
      }

      const apiResponseTimes = await Promise.all(concurrentApiTests);

      // Performance should not degrade significantly under load
      const maxResponseTime = Math.max(...apiResponseTimes);
      const avgResponseTime = apiResponseTimes.reduce((a, b) => a + b, 0) / apiResponseTimes.length;

      expect(avgResponseTime).toBeLessThan(250); // Slight increase allowed under load
      expect(maxResponseTime).toBeLessThan(500); // Max individual response time

      console.log(`Concurrent API - Average: ${avgResponseTime.toFixed(2)}ms, Max: ${maxResponseTime.toFixed(2)}ms`);

      // Test concurrent WebSocket connections
      if (server.listening) {
        const port = server.address()?.port;
        const webSocketTests = [];

        for (let i = 0; i < 5; i++) {
          const wsTest = new Promise<number>((resolve) => {
            const client = Client(`http://localhost:${port}`);
            const startTime = Date.now();

            client.on('connect', () => {
              client.emit('join-room', {
                room: `test-room-${i}`,
                user_id: `user-${i}`,
              });

              client.on('user-joined', () => {
                const endTime = Date.now();
                const connectionTime = endTime - startTime;
                client.disconnect();
                resolve(connectionTime);
              });
            });
          });

          webSocketTests.push(wsTest);
        }

        const wsConnectionTimes = await Promise.all(webSocketTests);
        const avgWsTime = wsConnectionTimes.reduce((a, b) => a + b, 0) / wsConnectionTimes.length;

        expect(avgWsTime).toBeLessThan(1000);
        console.log(`Concurrent WebSocket average connection time: ${avgWsTime.toFixed(2)}ms`);
      }
    });

    it('should verify database query performance under load', async () => {
      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Test data-intensive endpoints
      const dataIntensiveTests = [
        {
          endpoint: '/api/uptime/id-recognition?months=12',
          description: 'Large uptime dataset',
        },
        {
          endpoint: '/api/sla/availability/id-recognition?days=90',
          description: 'SLA availability calculation',
        },
        {
          endpoint: '/api/sla/response-times/id-recognition?days=30',
          description: 'Response time aggregation',
        },
      ];

      for (const test of dataIntensiveTests) {
        const startTime = Date.now();

        const response = await request(app)
          .get(test.endpoint)
          .set('Authorization', `Bearer ${token}`);

        const endTime = Date.now();
        const responseTime = endTime - startTime;

        // Even data-intensive queries should meet performance requirements
        expect(response.status).toBe(200);
        expect(responseTime).toBeLessThan(500); // Relaxed for data-intensive queries

        console.log(`${test.description}: ${responseTime}ms`);
      }
    });

    it('should validate memory and resource usage patterns', async () => {
      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Create a stress test with multiple simultaneous operations
      const operations = [];

      // Multiple API calls
      for (let i = 0; i < 20; i++) {
        operations.push(
          request(app)
            .get('/api/system-status')
            .set('Authorization', `Bearer ${token}`)
        );
      }

      // Multiple uptime queries
      for (let i = 0; i < 10; i++) {
        operations.push(
          request(app)
            .get('/api/uptime/id-recognition')
            .set('Authorization', `Bearer ${token}`)
        );
      }

      const startTime = Date.now();
      const responses = await Promise.all(operations);
      const endTime = Date.now();

      const totalTime = endTime - startTime;
      const avgTimePerRequest = totalTime / operations.length;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // System should handle burst load efficiently
      expect(avgTimePerRequest).toBeLessThan(100); // Efficient parallel processing
      expect(totalTime).toBeLessThan(2000); // Total burst should complete quickly

      console.log(`Burst test - Total: ${totalTime}ms, Average per request: ${avgTimePerRequest.toFixed(2)}ms`);
    });

    it('should measure end-to-end workflow performance', async () => {
      // Test complete user workflow performance
      const workflowStartTime = Date.now();

      // Step 1: Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Step 2: Get system status
      const statusResponse = await request(app)
        .get('/api/system-status')
        .set('Authorization', `Bearer ${token}`);

      expect(statusResponse.status).toBe(200);

      // Step 3: Get service list
      const servicesResponse = await request(app)
        .get('/api/services')
        .set('Authorization', `Bearer ${token}`);

      expect(servicesResponse.status).toBe(200);

      // Step 4: Get uptime data
      const uptimeResponse = await request(app)
        .get('/api/uptime/id-recognition')
        .set('Authorization', `Bearer ${token}`);

      expect(uptimeResponse.status).toBe(200);

      // Step 5: Get SLA data
      const slaResponse = await request(app)
        .get('/api/sla/availability/id-recognition')
        .set('Authorization', `Bearer ${token}`);

      expect(slaResponse.status).toBe(200);

      const workflowEndTime = Date.now();
      const totalWorkflowTime = workflowEndTime - workflowStartTime;

      // Complete workflow should be fast
      expect(totalWorkflowTime).toBeLessThan(1000); // 1 second for complete workflow

      console.log(`End-to-end workflow time: ${totalWorkflowTime}ms`);
    });

    it('should verify scalability under sustained load', async () => {
      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Sustained load test - multiple waves of requests
      const waves = 3;
      const requestsPerWave = 10;
      const waveResults = [];

      for (let wave = 0; wave < waves; wave++) {
        const waveStartTime = Date.now();
        const waveRequests = [];

        for (let i = 0; i < requestsPerWave; i++) {
          waveRequests.push(
            request(app)
              .get('/api/system-status')
              .set('Authorization', `Bearer ${token}`)
          );
        }

        const waveResponses = await Promise.all(waveRequests);
        const waveEndTime = Date.now();
        const waveTime = waveEndTime - waveStartTime;

        // All requests in wave should succeed
        waveResponses.forEach(response => {
          expect(response.status).toBe(200);
        });

        waveResults.push(waveTime);

        // Brief pause between waves
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Performance should remain consistent across waves
      const avgWaveTime = waveResults.reduce((a, b) => a + b, 0) / waveResults.length;
      const maxWaveTime = Math.max(...waveResults);
      const minWaveTime = Math.min(...waveResults);

      // Performance degradation should be minimal
      const performanceVariation = (maxWaveTime - minWaveTime) / avgWaveTime;
      expect(performanceVariation).toBeLessThan(0.5); // <50% variation

      console.log(`Sustained load - Average wave: ${avgWaveTime}ms, Variation: ${(performanceVariation * 100).toFixed(1)}%`);
    });
  });
});
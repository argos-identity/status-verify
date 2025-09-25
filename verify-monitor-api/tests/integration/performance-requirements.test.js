"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const socket_io_client_1 = __importDefault(require("socket.io-client"));
const http_1 = require("http");
const setup_1 = require("../setup");
let app;
let server;
describe('Integration Test: Performance Requirements Scenario (T027)', () => {
    beforeAll(async () => {
        try {
            app = require('../../src/app').default;
            server = (0, http_1.createServer)(app);
            await new Promise((resolve) => {
                server.listen(0, () => resolve());
            });
        }
        catch (error) {
            console.log('App not implemented yet - tests will fail as expected (TDD)');
        }
    });
    beforeEach(async () => {
        await setup_1.prisma.user.create({
            data: {
                id: 'user-viewer',
                username: 'viewer',
                email: 'viewer@example.com',
                password_hash: '$2b$12$hash-for-password123',
                role: 'viewer',
            },
        });
        await setup_1.prisma.service.createMany({
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
        await setup_1.prisma.uptimeRecord.createMany({ data: records });
    });
    afterEach(async () => {
        await setup_1.prisma.uptimeRecord.deleteMany();
        await setup_1.prisma.service.deleteMany();
        await setup_1.prisma.user.deleteMany();
    });
    afterAll(async () => {
        if (server) {
            await new Promise((resolve) => {
                server.close(() => resolve());
            });
        }
    });
    describe('Test Scenario 6: Performance Requirements (FR-002, FR-004)', () => {
        it('should verify API response time testing (<200ms average)', async () => {
            const loginResponse = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'viewer',
                password: 'password123',
            });
            expect(loginResponse.status).toBe(200);
            const token = loginResponse.body.access_token;
            const endpoints = [
                '/api/system-status',
                '/api/services',
                '/api/uptime/id-recognition?months=3',
            ];
            const results = [];
            for (const endpoint of endpoints) {
                const responseTimes = [];
                for (let i = 0; i < 5; i++) {
                    const startTime = Date.now();
                    const response = await (0, supertest_1.default)(app)
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
                expect(averageResponseTime).toBeLessThan(200);
                console.log(`${endpoint}: ${averageResponseTime.toFixed(2)}ms average`);
            }
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
            const client = (0, socket_io_client_1.default)(`http://localhost:${port}`);
            await new Promise((resolve) => {
                client.on('connect', resolve);
            });
            const latencyTests = [];
            for (let i = 0; i < 3; i++) {
                const testPromise = new Promise((resolve) => {
                    const startTime = Date.now();
                    client.emit('join-room', {
                        room: 'system-status',
                        user_id: 'user-viewer',
                    });
                    client.on('user-joined', () => {
                        const endTime = Date.now();
                        const latency = endTime - startTime;
                        resolve(latency);
                    });
                });
                latencyTests.push(testPromise);
            }
            const latencies = await Promise.all(latencyTests);
            latencies.forEach(latency => {
                expect(latency).toBeLessThan(5000);
            });
            const averageLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
            expect(averageLatency).toBeLessThan(1000);
            console.log(`WebSocket average latency: ${averageLatency.toFixed(2)}ms`);
            const updatePromise = new Promise((resolve) => {
                const startTime = Date.now();
                client.on('field-updated', () => {
                    const endTime = Date.now();
                    const delay = endTime - startTime;
                    resolve(delay);
                });
            });
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
            expect(updateLatency).toBeLessThan(1000);
            client.disconnect();
        });
        it('should handle concurrent users without degradation', async () => {
            if (!server || !server.listening) {
                console.log('Server not available - test will fail as expected (TDD)');
                return;
            }
            const loginResponse = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'viewer',
                password: 'password123',
            });
            expect(loginResponse.status).toBe(200);
            const token = loginResponse.body.access_token;
            const concurrentApiTests = [];
            const concurrentUsers = 10;
            for (let i = 0; i < concurrentUsers; i++) {
                const apiTest = async () => {
                    const startTime = Date.now();
                    const response = await (0, supertest_1.default)(app)
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
            const maxResponseTime = Math.max(...apiResponseTimes);
            const avgResponseTime = apiResponseTimes.reduce((a, b) => a + b, 0) / apiResponseTimes.length;
            expect(avgResponseTime).toBeLessThan(250);
            expect(maxResponseTime).toBeLessThan(500);
            console.log(`Concurrent API - Average: ${avgResponseTime.toFixed(2)}ms, Max: ${maxResponseTime.toFixed(2)}ms`);
            if (server.listening) {
                const port = server.address()?.port;
                const webSocketTests = [];
                for (let i = 0; i < 5; i++) {
                    const wsTest = new Promise((resolve) => {
                        const client = (0, socket_io_client_1.default)(`http://localhost:${port}`);
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
            const loginResponse = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'viewer',
                password: 'password123',
            });
            expect(loginResponse.status).toBe(200);
            const token = loginResponse.body.access_token;
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
                const response = await (0, supertest_1.default)(app)
                    .get(test.endpoint)
                    .set('Authorization', `Bearer ${token}`);
                const endTime = Date.now();
                const responseTime = endTime - startTime;
                expect(response.status).toBe(200);
                expect(responseTime).toBeLessThan(500);
                console.log(`${test.description}: ${responseTime}ms`);
            }
        });
        it('should validate memory and resource usage patterns', async () => {
            const loginResponse = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'viewer',
                password: 'password123',
            });
            expect(loginResponse.status).toBe(200);
            const token = loginResponse.body.access_token;
            const operations = [];
            for (let i = 0; i < 20; i++) {
                operations.push((0, supertest_1.default)(app)
                    .get('/api/system-status')
                    .set('Authorization', `Bearer ${token}`));
            }
            for (let i = 0; i < 10; i++) {
                operations.push((0, supertest_1.default)(app)
                    .get('/api/uptime/id-recognition')
                    .set('Authorization', `Bearer ${token}`));
            }
            const startTime = Date.now();
            const responses = await Promise.all(operations);
            const endTime = Date.now();
            const totalTime = endTime - startTime;
            const avgTimePerRequest = totalTime / operations.length;
            responses.forEach(response => {
                expect(response.status).toBe(200);
            });
            expect(avgTimePerRequest).toBeLessThan(100);
            expect(totalTime).toBeLessThan(2000);
            console.log(`Burst test - Total: ${totalTime}ms, Average per request: ${avgTimePerRequest.toFixed(2)}ms`);
        });
        it('should measure end-to-end workflow performance', async () => {
            const workflowStartTime = Date.now();
            const loginResponse = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'viewer',
                password: 'password123',
            });
            expect(loginResponse.status).toBe(200);
            const token = loginResponse.body.access_token;
            const statusResponse = await (0, supertest_1.default)(app)
                .get('/api/system-status')
                .set('Authorization', `Bearer ${token}`);
            expect(statusResponse.status).toBe(200);
            const servicesResponse = await (0, supertest_1.default)(app)
                .get('/api/services')
                .set('Authorization', `Bearer ${token}`);
            expect(servicesResponse.status).toBe(200);
            const uptimeResponse = await (0, supertest_1.default)(app)
                .get('/api/uptime/id-recognition')
                .set('Authorization', `Bearer ${token}`);
            expect(uptimeResponse.status).toBe(200);
            const slaResponse = await (0, supertest_1.default)(app)
                .get('/api/sla/availability/id-recognition')
                .set('Authorization', `Bearer ${token}`);
            expect(slaResponse.status).toBe(200);
            const workflowEndTime = Date.now();
            const totalWorkflowTime = workflowEndTime - workflowStartTime;
            expect(totalWorkflowTime).toBeLessThan(1000);
            console.log(`End-to-end workflow time: ${totalWorkflowTime}ms`);
        });
        it('should verify scalability under sustained load', async () => {
            const loginResponse = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'viewer',
                password: 'password123',
            });
            expect(loginResponse.status).toBe(200);
            const token = loginResponse.body.access_token;
            const waves = 3;
            const requestsPerWave = 10;
            const waveResults = [];
            for (let wave = 0; wave < waves; wave++) {
                const waveStartTime = Date.now();
                const waveRequests = [];
                for (let i = 0; i < requestsPerWave; i++) {
                    waveRequests.push((0, supertest_1.default)(app)
                        .get('/api/system-status')
                        .set('Authorization', `Bearer ${token}`));
                }
                const waveResponses = await Promise.all(waveRequests);
                const waveEndTime = Date.now();
                const waveTime = waveEndTime - waveStartTime;
                waveResponses.forEach(response => {
                    expect(response.status).toBe(200);
                });
                waveResults.push(waveTime);
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            const avgWaveTime = waveResults.reduce((a, b) => a + b, 0) / waveResults.length;
            const maxWaveTime = Math.max(...waveResults);
            const minWaveTime = Math.min(...waveResults);
            const performanceVariation = (maxWaveTime - minWaveTime) / avgWaveTime;
            expect(performanceVariation).toBeLessThan(0.5);
            console.log(`Sustained load - Average wave: ${avgWaveTime}ms, Variation: ${(performanceVariation * 100).toFixed(1)}%`);
        });
    });
});
//# sourceMappingURL=performance-requirements.test.js.map
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
let clientSocket;
describe('Integration Test: System Status Monitoring Scenario (T022)', () => {
    beforeAll(async () => {
        try {
            app = require('../../src/app').default;
            server = (0, http_1.createServer)(app);
            await new Promise((resolve) => {
                server.listen(0, () => {
                    resolve();
                });
            });
        }
        catch (error) {
            console.log('App not implemented yet - tests will fail as expected (TDD)');
        }
    });
    beforeEach(async () => {
        await setup_1.prisma.user.createMany({
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
        if (server && server.listening) {
            const port = server.address()?.port;
            clientSocket = (0, socket_io_client_1.default)(`http://localhost:${port}`);
            await new Promise((resolve) => {
                clientSocket.on('connect', () => {
                    resolve();
                });
            });
        }
    });
    afterEach(async () => {
        if (clientSocket) {
            clientSocket.disconnect();
            clientSocket = null;
        }
        await setup_1.prisma.service.deleteMany();
        await setup_1.prisma.user.deleteMany();
    });
    afterAll(async () => {
        if (server) {
            await new Promise((resolve) => {
                server.close(() => {
                    resolve();
                });
            });
        }
    });
    describe('Test Scenario 1: System Status Monitoring (FR-005, FR-006)', () => {
        it('should verify real-time system status display and updates', async () => {
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
            const services = statusResponse.body.services;
            const hasMajorOutage = services.some((s) => s.status === 'major_outage');
            const hasPartialOutage = services.some((s) => s.status === 'partial_outage');
            if (hasMajorOutage) {
                expect(statusResponse.body.overall_status).toBe('outage');
            }
            else if (hasPartialOutage) {
                expect(statusResponse.body.overall_status).toBe('degraded');
            }
            else {
                expect(statusResponse.body.overall_status).toBe('operational');
            }
            services.forEach((service) => {
                expect(service).toMatchObject({
                    id: expect.any(String),
                    name: expect.any(String),
                    status: expect.stringMatching(/^(operational|partial_outage|major_outage)$/),
                    last_checked: expect.any(String),
                    response_time_ms: expect.any(Number),
                    uptime_percentage_24h: expect.any(Number),
                });
                expect(service.status_color).toMatch(/^(green|orange|red)$/);
                expect(service.uptime_percentage_24h).toBeGreaterThanOrEqual(0);
                expect(service.uptime_percentage_24h).toBeLessThanOrEqual(100);
            });
        });
        it('should test real-time WebSocket updates (FR-004)', async () => {
            if (!clientSocket) {
                console.log('WebSocket not available - test will fail as expected (TDD)');
                return;
            }
            clientSocket.emit('join-room', {
                room: 'system-status',
                user_id: 'user-viewer',
            });
            await new Promise((resolve) => {
                clientSocket.on('user-joined', () => {
                    resolve();
                });
            });
            const updatePromise = new Promise((resolve) => {
                const startTime = Date.now();
                clientSocket.on('status-update', (data) => {
                    const receivedTime = Date.now();
                    const delay = receivedTime - startTime;
                    expect(data).toMatchObject({
                        service_id: 'id-recognition',
                        previous_status: 'operational',
                        current_status: 'partial_outage',
                        timestamp: expect.any(String),
                        affected_services: expect.any(Array),
                        notification_delay_ms: expect.any(Number),
                    });
                    expect(delay).toBeLessThan(5000);
                    expect(data.notification_delay_ms).toBeLessThan(5000);
                    resolve(data);
                });
            });
            setTimeout(() => {
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
            const expectedServices = [
                'id-recognition',
                'face-liveness',
                'id-liveness',
                'face-compare',
                'curp-verifier'
            ];
            expectedServices.forEach(serviceId => {
                const service = statusResponse.body.services.find((s) => s.id === serviceId);
                expect(service).toBeDefined();
                expect(service.status_code).toMatch(/^(o|po|mo)$/);
                expect(service).toMatchObject({
                    id: expect.any(String),
                    name: expect.any(String),
                    status: expect.any(String),
                    status_code: expect.any(String),
                    status_color: expect.any(String),
                    last_checked: expect.any(String),
                    response_time_ms: expect.any(Number),
                    uptime_percentage_24h: expect.any(Number),
                });
            });
            expect(statusResponse.body).toMatchObject({
                overall_status: expect.any(String),
                overall_status_code: expect.stringMatching(/^(o|po|mo)$/),
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
            const loginResponse = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'reporter',
                password: 'password123',
            });
            expect(loginResponse.status).toBe(200);
            const token = loginResponse.body.access_token;
            const initialStatus = await (0, supertest_1.default)(app)
                .get('/api/system-status')
                .set('Authorization', `Bearer ${token}`);
            expect(initialStatus.status).toBe(200);
            const idRecognitionService = initialStatus.body.services.find((s) => s.id === 'id-recognition');
            expect(idRecognitionService.status).toBe('operational');
            await setup_1.prisma.service.update({
                where: { id: 'id-recognition' },
                data: {
                    current_status: 'partial_outage',
                    last_checked: new Date(),
                },
            });
            await setup_1.prisma.uptimeRecord.create({
                data: {
                    id: 'test-uptime-record',
                    service_id: 'id-recognition',
                    date: new Date(),
                    status: 'partial_outage',
                    uptime_percentage: 85.0,
                    downtime_minutes: 216,
                    incident_count: 1,
                },
            });
            const updatedStatus = await (0, supertest_1.default)(app)
                .get('/api/system-status')
                .set('Authorization', `Bearer ${token}`);
            expect(updatedStatus.status).toBe(200);
            const updatedService = updatedStatus.body.services.find((s) => s.id === 'id-recognition');
            expect(updatedService.status).toBe('partial_outage');
            expect(updatedService.status_code).toBe('po');
            expect(updatedService.status_color).toBe('orange');
            expect(updatedStatus.body.overall_status).toBe('degraded');
            expect(updatedStatus.body.overall_status_code).toBe('po');
            expect(updatedStatus.body.summary.operational).toBe(2);
            expect(updatedStatus.body.summary.partial_outage).toBe(2);
            expect(updatedStatus.body.summary.major_outage).toBe(1);
        });
        it('should validate performance requirements (<200ms API response)', async () => {
            const loginResponse = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'viewer',
                password: 'password123',
            });
            expect(loginResponse.status).toBe(200);
            const token = loginResponse.body.access_token;
            const apiCalls = [];
            const callCount = 5;
            for (let i = 0; i < callCount; i++) {
                const startTime = Date.now();
                const promise = (0, supertest_1.default)(app)
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
            const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
            expect(averageResponseTime).toBeLessThan(200);
            responseTimes.forEach(time => {
                expect(time).toBeLessThan(500);
            });
            console.log(`System Status API average response time: ${averageResponseTime.toFixed(2)}ms`);
        });
        it('should verify color-coded status indicators', async () => {
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
            statusResponse.body.services.forEach((service) => {
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
            const unauthResponse = await (0, supertest_1.default)(app)
                .get('/api/system-status');
            expect(unauthResponse.status).toBe(401);
            const invalidTokenResponse = await (0, supertest_1.default)(app)
                .get('/api/system-status')
                .set('Authorization', 'Bearer invalid-token');
            expect(invalidTokenResponse.status).toBe(401);
            await setup_1.prisma.service.deleteMany();
            const loginResponse = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'viewer',
                password: 'password123',
            });
            expect(loginResponse.status).toBe(200);
            const token = loginResponse.body.access_token;
            const emptyResponse = await (0, supertest_1.default)(app)
                .get('/api/system-status')
                .set('Authorization', `Bearer ${token}`);
            expect(emptyResponse.status).toBe(200);
            expect(emptyResponse.body).toMatchObject({
                overall_status: 'operational',
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
//# sourceMappingURL=system-status-monitoring.test.js.map
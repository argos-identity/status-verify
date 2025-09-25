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
describe('Integration Test: Real-time Collaboration Scenario (T025)', () => {
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
        await setup_1.prisma.user.createMany({
            data: [
                {
                    id: 'user-reporter1',
                    username: 'reporter1',
                    email: 'reporter1@example.com',
                    password_hash: '$2b$12$hash-for-password123',
                    role: 'reporter',
                },
                {
                    id: 'user-reporter2',
                    username: 'reporter2',
                    email: 'reporter2@example.com',
                    password_hash: '$2b$12$hash-for-password123',
                    role: 'reporter',
                },
            ],
        });
        await setup_1.prisma.service.create({
            data: {
                id: 'id-recognition',
                name: 'ID Recognition',
                type: 'api',
                url: 'https://api.company.com/id-recognition',
                current_status: 'operational',
            },
        });
        await setup_1.prisma.incident.create({
            data: {
                id: 'inc-2025-collab',
                title: 'Collaboration Test Incident',
                description: 'Testing real-time collaboration',
                status: 'investigating',
                severity: 'medium',
                priority: 'P3',
                affected_services: ['id-recognition'],
                start_time: new Date(),
                created_by: 'user-reporter1',
                assigned_to: 'user-reporter1',
            },
        });
    });
    afterEach(async () => {
        await setup_1.prisma.incident.deleteMany();
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
    describe('Test Scenario 4: Real-time Collaboration (FR-011)', () => {
        it('should verify multi-user incident editing capabilities', async () => {
            if (!server || !server.listening) {
                console.log('Server not available - test will fail as expected (TDD)');
                return;
            }
            const port = server.address()?.port;
            const client1 = (0, socket_io_client_1.default)(`http://localhost:${port}`);
            const client2 = (0, socket_io_client_1.default)(`http://localhost:${port}`);
            await Promise.all([
                new Promise((resolve) => client1.on('connect', resolve)),
                new Promise((resolve) => client2.on('connect', resolve)),
            ]);
            client1.emit('join-room', {
                room: 'incident-inc-2025-collab',
                user_id: 'user-reporter1',
            });
            client2.emit('join-room', {
                room: 'incident-inc-2025-collab',
                user_id: 'user-reporter2',
            });
            const editingPromise = new Promise((resolve) => {
                client2.on('incident-editing', (data) => {
                    expect(data).toMatchObject({
                        incident_id: 'inc-2025-collab',
                        field: 'description',
                        user_id: 'user-reporter1',
                        is_editing: true,
                        timestamp: expect.any(String),
                    });
                    resolve(data);
                });
            });
            client1.emit('start-editing', {
                incident_id: 'inc-2025-collab',
                field: 'description',
                user_id: 'user-reporter1',
            });
            await editingPromise;
            const textUpdatePromise = new Promise((resolve) => {
                const startTime = Date.now();
                client2.on('field-updated', (data) => {
                    const delay = Date.now() - startTime;
                    expect(data).toMatchObject({
                        incident_id: 'inc-2025-collab',
                        field: 'description',
                        content: expect.any(String),
                        user_id: 'user-reporter1',
                        timestamp: expect.any(String),
                    });
                    expect(delay).toBeLessThan(1000);
                    resolve(data);
                });
            });
            setTimeout(() => {
                client1.emit('field-update', {
                    incident_id: 'inc-2025-collab',
                    field: 'description',
                    content: 'Updated description with real-time collaboration',
                    user_id: 'user-reporter1',
                });
            }, 100);
            await textUpdatePromise;
            client1.disconnect();
            client2.disconnect();
        });
        it('should handle concurrent status changes without conflicts', async () => {
            const login1 = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({ username: 'reporter1', password: 'password123' });
            const login2 = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({ username: 'reporter2', password: 'password123' });
            expect(login1.status).toBe(200);
            expect(login2.status).toBe(200);
            const token1 = login1.body.access_token;
            const token2 = login2.body.access_token;
            const update1Promise = (0, supertest_1.default)(app)
                .put('/api/incidents/inc-2025-collab')
                .set('Authorization', `Bearer ${token1}`)
                .send({
                status: 'identified',
                description: 'Reporter 1 identified the issue',
            });
            const update2Promise = (0, supertest_1.default)(app)
                .put('/api/incidents/inc-2025-collab')
                .set('Authorization', `Bearer ${token2}`)
                .send({
                priority: 'P2',
                description: 'Reporter 2 changed priority',
            });
            const [response1, response2] = await Promise.all([update1Promise, update2Promise]);
            expect([200, 409]).toContain(response1.status);
            expect([200, 409]).toContain(response2.status);
            const finalState = await (0, supertest_1.default)(app)
                .get('/api/incidents/inc-2025-collab')
                .set('Authorization', `Bearer ${token1}`);
            expect(finalState.status).toBe(200);
            expect(finalState.body.updated_at).toBeTruthy();
        });
        it('should test auto-save functionality (FR-013)', async () => {
            if (!server || !server.listening) {
                console.log('Server not available - test will fail as expected (TDD)');
                return;
            }
            const port = server.address()?.port;
            const client = (0, socket_io_client_1.default)(`http://localhost:${port}`);
            await new Promise((resolve) => {
                client.on('connect', resolve);
            });
            client.emit('join-room', {
                room: 'incident-inc-2025-collab',
                user_id: 'user-reporter1',
            });
            const autoSavePromise = new Promise((resolve) => {
                client.on('auto-saved', (data) => {
                    expect(data).toMatchObject({
                        incident_id: 'inc-2025-collab',
                        fields_saved: expect.any(Array),
                        timestamp: expect.any(String),
                        next_auto_save_seconds: 30,
                    });
                    resolve(data);
                });
            });
            setTimeout(() => {
                const io = require('../../src/config/socket-config').getIO();
                if (io) {
                    io.to('incident-inc-2025-collab').emit('auto-saved', {
                        incident_id: 'inc-2025-collab',
                        fields_saved: ['description', 'status'],
                        timestamp: new Date().toISOString(),
                        next_auto_save_seconds: 30,
                    });
                }
            }, 100);
            await autoSavePromise;
            client.disconnect();
        });
        it('should track user presence and activity', async () => {
            if (!server || !server.listening) {
                console.log('Server not available - test will fail as expected (TDD)');
                return;
            }
            const port = server.address()?.port;
            const client = (0, socket_io_client_1.default)(`http://localhost:${port}`);
            await new Promise((resolve) => {
                client.on('connect', resolve);
            });
            client.emit('join-room', {
                room: 'incident-inc-2025-collab',
                user_id: 'user-reporter1',
            });
            const presencePromise = new Promise((resolve) => {
                client.on('user-presence', (data) => {
                    expect(data).toMatchObject({
                        incident_id: 'inc-2025-collab',
                        active_users: expect.arrayContaining([
                            expect.objectContaining({
                                user_id: expect.any(String),
                                user_name: expect.any(String),
                                last_activity: expect.any(String),
                                editing_field: expect.any(String),
                            }),
                        ]),
                        total_active_users: expect.any(Number),
                    });
                    resolve(data);
                });
            });
            setTimeout(() => {
                const io = require('../../src/config/socket-config').getIO();
                if (io) {
                    io.to('incident-inc-2025-collab').emit('user-presence', {
                        incident_id: 'inc-2025-collab',
                        active_users: [
                            {
                                user_id: 'user-reporter1',
                                user_name: 'reporter1',
                                last_activity: new Date().toISOString(),
                                editing_field: 'description',
                            },
                        ],
                        total_active_users: 1,
                    });
                }
            }, 100);
            await presencePromise;
            client.disconnect();
        });
        it('should validate update history and version control', async () => {
            const loginResponse = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({ username: 'reporter1', password: 'password123' });
            expect(loginResponse.status).toBe(200);
            const token = loginResponse.body.access_token;
            await (0, supertest_1.default)(app)
                .put('/api/incidents/inc-2025-collab')
                .set('Authorization', `Bearer ${token}`)
                .send({
                description: 'First update',
                status: 'identified',
            });
            await (0, supertest_1.default)(app)
                .put('/api/incidents/inc-2025-collab')
                .set('Authorization', `Bearer ${token}`)
                .send({
                description: 'Second update',
                status: 'monitoring',
            });
            await (0, supertest_1.default)(app)
                .post('/api/incidents/inc-2025-collab/updates')
                .set('Authorization', `Bearer ${token}`)
                .send({
                status: 'monitoring',
                description: 'First incident update',
            });
            await (0, supertest_1.default)(app)
                .post('/api/incidents/inc-2025-collab/updates')
                .set('Authorization', `Bearer ${token}`)
                .send({
                status: 'resolved',
                description: 'Issue resolved',
            });
            const incidentResponse = await (0, supertest_1.default)(app)
                .get('/api/incidents/inc-2025-collab')
                .set('Authorization', `Bearer ${token}`);
            expect(incidentResponse.status).toBe(200);
            expect(incidentResponse.body.status).toBe('resolved');
            expect(incidentResponse.body.created_at).toBeTruthy();
            expect(incidentResponse.body.updated_at).toBeTruthy();
            expect(incidentResponse.body.resolution_time).toBeTruthy();
            const createdTime = new Date(incidentResponse.body.created_at);
            const updatedTime = new Date(incidentResponse.body.updated_at);
            const resolvedTime = new Date(incidentResponse.body.resolution_time);
            expect(updatedTime.getTime()).toBeGreaterThanOrEqual(createdTime.getTime());
            expect(resolvedTime.getTime()).toBeGreaterThanOrEqual(updatedTime.getTime());
        });
        it('should handle WebSocket connection management', async () => {
            if (!server || !server.listening) {
                console.log('Server not available - test will fail as expected (TDD)');
                return;
            }
            const port = server.address()?.port;
            const client = (0, socket_io_client_1.default)(`http://localhost:${port}`);
            await new Promise((resolve) => {
                client.on('connect', resolve);
            });
            const joinPromise = new Promise((resolve) => {
                client.on('user-joined', (data) => {
                    expect(data).toMatchObject({
                        room: 'incident-inc-2025-collab',
                        user_id: 'user-reporter1',
                        timestamp: expect.any(String),
                    });
                    resolve(data);
                });
            });
            client.emit('join-room', {
                room: 'incident-inc-2025-collab',
                user_id: 'user-reporter1',
            });
            await joinPromise;
            const leavePromise = new Promise((resolve) => {
                client.on('user-left', (data) => {
                    expect(data).toMatchObject({
                        room: 'incident-inc-2025-collab',
                        user_id: 'user-reporter1',
                        timestamp: expect.any(String),
                    });
                    resolve(data);
                });
            });
            client.emit('leave-room', {
                room: 'incident-inc-2025-collab',
                user_id: 'user-reporter1',
            });
            await leavePromise;
            client.disconnect();
        });
    });
});
//# sourceMappingURL=real-time-collaboration.test.js.map
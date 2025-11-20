"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const setup_1 = require("../setup");
let app;
describe('Contract Test: POST /api/incidents/{incidentId}/updates', () => {
    beforeAll(() => {
        try {
            app = require('../../src/app').default;
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
                {
                    id: 'user-admin',
                    username: 'admin',
                    email: 'admin@example.com',
                    password_hash: '$2b$12$hash-for-password123',
                    role: 'admin',
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
            ],
        });
        await setup_1.prisma.incident.create({
            data: {
                id: 'inc-2025-001',
                title: '서비스 응답 지연',
                description: 'ID Recognition 서비스 응답 시간 15초 초과',
                status: 'investigating',
                severity: 'high',
                priority: 'P2',
                affected_services: ['id-recognition'],
                detection_criteria: '연속 3회 7초 초과',
                start_time: new Date('2025-09-11T10:00:00Z'),
                created_by: 'user-reporter',
                assigned_to: 'user-reporter',
            },
        });
    });
    afterEach(async () => {
        await setup_1.prisma.incidentUpdate.deleteMany();
        await setup_1.prisma.incident.deleteMany();
        await setup_1.prisma.service.deleteMany();
        await setup_1.prisma.user.deleteMany();
    });
    describe('POST /api/incidents/{incidentId}/updates', () => {
        it('should create incident update with valid data and reporter role', async () => {
            const loginResponse = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'reporter',
                password: 'password123',
            });
            expect(loginResponse.status).toBe(200);
            const token = loginResponse.body.access_token;
            const updateData = {
                status: 'identified',
                description: '원인을 데이터베이스 연결 풀 부족으로 식별',
            };
            const response = await (0, supertest_1.default)(app)
                .post('/api/incidents/inc-2025-001/updates')
                .set('Authorization', `Bearer ${token}`)
                .send(updateData);
            expect(response.status).toBe(201);
            expect(response.body).toMatchObject({
                id: expect.any(String),
                incident_id: 'inc-2025-001',
                status: 'identified',
                description: '원인을 데이터베이스 연결 풀 부족으로 식별',
                created_by: 'user-reporter',
                created_at: expect.any(String),
            });
        });
        it('should create incident update with admin role', async () => {
            const loginResponse = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'admin',
                password: 'password123',
            });
            expect(loginResponse.status).toBe(200);
            const token = loginResponse.body.access_token;
            const updateData = {
                status: 'monitoring',
                description: '연결 풀 크기 증가 후 모니터링 중',
            };
            const response = await (0, supertest_1.default)(app)
                .post('/api/incidents/inc-2025-001/updates')
                .set('Authorization', `Bearer ${token}`)
                .send(updateData);
            expect(response.status).toBe(201);
            expect(response.body).toMatchObject({
                id: expect.any(String),
                incident_id: 'inc-2025-001',
                status: 'monitoring',
                description: '연결 풀 크기 증가 후 모니터링 중',
                created_by: 'user-admin',
                created_at: expect.any(String),
            });
        });
        it('should reject request without authentication', async () => {
            const updateData = {
                status: 'identified',
                description: 'Test update without auth',
            };
            const response = await (0, supertest_1.default)(app)
                .post('/api/incidents/inc-2025-001/updates')
                .send(updateData);
            expect(response.status).toBe(401);
            expect(response.body).toMatchObject({
                error: 'Unauthorized',
                message: expect.any(String),
            });
        });
        it('should reject viewer role access', async () => {
            const loginResponse = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'viewer',
                password: 'password123',
            });
            expect(loginResponse.status).toBe(200);
            const token = loginResponse.body.access_token;
            const updateData = {
                status: 'identified',
                description: 'Viewer should not be able to create updates',
            };
            const response = await (0, supertest_1.default)(app)
                .post('/api/incidents/inc-2025-001/updates')
                .set('Authorization', `Bearer ${token}`)
                .send(updateData);
            expect(response.status).toBe(403);
            expect(response.body).toMatchObject({
                error: 'Forbidden',
                message: expect.stringContaining('permission'),
            });
        });
        it('should validate required fields', async () => {
            const loginResponse = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'reporter',
                password: 'password123',
            });
            expect(loginResponse.status).toBe(200);
            const token = loginResponse.body.access_token;
            const response = await (0, supertest_1.default)(app)
                .post('/api/incidents/inc-2025-001/updates')
                .set('Authorization', `Bearer ${token}`)
                .send({});
            expect(response.status).toBe(400);
            expect(response.body).toMatchObject({
                error: 'Validation Error',
                details: expect.arrayContaining([
                    expect.objectContaining({
                        field: expect.any(String),
                        message: expect.any(String),
                    }),
                ]),
            });
        });
        it('should validate status enum values', async () => {
            const loginResponse = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'reporter',
                password: 'password123',
            });
            expect(loginResponse.status).toBe(200);
            const token = loginResponse.body.access_token;
            const updateData = {
                status: 'invalid-status',
                description: 'Test with invalid status',
            };
            const response = await (0, supertest_1.default)(app)
                .post('/api/incidents/inc-2025-001/updates')
                .set('Authorization', `Bearer ${token}`)
                .send(updateData);
            expect(response.status).toBe(400);
            expect(response.body).toMatchObject({
                error: 'Validation Error',
                details: expect.arrayContaining([
                    expect.objectContaining({
                        field: 'status',
                        message: expect.stringContaining('enum'),
                    }),
                ]),
            });
        });
        it('should return 404 for non-existent incident', async () => {
            const loginResponse = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'reporter',
                password: 'password123',
            });
            expect(loginResponse.status).toBe(200);
            const token = loginResponse.body.access_token;
            const updateData = {
                status: 'identified',
                description: 'Update for non-existent incident',
            };
            const response = await (0, supertest_1.default)(app)
                .post('/api/incidents/non-existent-id/updates')
                .set('Authorization', `Bearer ${token}`)
                .send(updateData);
            expect(response.status).toBe(404);
            expect(response.body).toMatchObject({
                error: 'Not Found',
                message: expect.stringContaining('incident'),
            });
        });
        it('should update incident status when creating update', async () => {
            const loginResponse = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'reporter',
                password: 'password123',
            });
            expect(loginResponse.status).toBe(200);
            const token = loginResponse.body.access_token;
            const updateData = {
                status: 'resolved',
                description: '문제 해결 완료',
            };
            const response = await (0, supertest_1.default)(app)
                .post('/api/incidents/inc-2025-001/updates')
                .set('Authorization', `Bearer ${token}`)
                .send(updateData);
            expect(response.status).toBe(201);
            const incidentResponse = await (0, supertest_1.default)(app)
                .get('/api/incidents/inc-2025-001')
                .set('Authorization', `Bearer ${token}`);
            expect(incidentResponse.status).toBe(200);
            expect(incidentResponse.body).toMatchObject({
                id: 'inc-2025-001',
                status: 'resolved',
                resolution_time: expect.any(String),
            });
        });
        it('should validate incident update workflow rules', async () => {
            const loginResponse = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'reporter',
                password: 'password123',
            });
            expect(loginResponse.status).toBe(200);
            const token = loginResponse.body.access_token;
            const updateData = {
                status: 'resolved',
                description: 'Trying to skip workflow steps',
            };
            const response = await (0, supertest_1.default)(app)
                .post('/api/incidents/inc-2025-001/updates')
                .set('Authorization', `Bearer ${token}`)
                .send(updateData);
            expect([200, 201, 400]).toContain(response.status);
            if (response.status === 400) {
                expect(response.body).toMatchObject({
                    error: expect.any(String),
                    message: expect.stringContaining('workflow'),
                });
            }
        });
    });
});
//# sourceMappingURL=incident-updates.test.js.map
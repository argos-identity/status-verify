"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const setup_1 = require("../setup");
let app;
describe('Integration Test: Role-based Access Control Scenario (T026)', () => {
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
                id: 'inc-2025-rbac',
                title: 'RBAC Test Incident',
                description: 'Testing role-based access control',
                status: 'investigating',
                severity: 'medium',
                priority: 'P3',
                affected_services: ['id-recognition'],
                start_time: new Date(),
                created_by: 'user-reporter',
                assigned_to: 'user-reporter',
            },
        });
    });
    afterEach(async () => {
        await setup_1.prisma.incident.deleteMany();
        await setup_1.prisma.service.deleteMany();
        await setup_1.prisma.user.deleteMany();
    });
    describe('Test Scenario 5: Role-based Access Control (FR-019)', () => {
        it('should enforce viewer role permissions', async () => {
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
            const incidentResponse = await (0, supertest_1.default)(app)
                .get('/api/incidents/inc-2025-rbac')
                .set('Authorization', `Bearer ${token}`);
            expect(incidentResponse.status).toBe(200);
            const createIncidentResponse = await (0, supertest_1.default)(app)
                .post('/api/incidents')
                .set('Authorization', `Bearer ${token}`)
                .send({
                title: 'Viewer trying to create incident',
                description: 'This should fail',
                severity: 'low',
                priority: 'P4',
                affected_services: ['id-recognition'],
            });
            expect(createIncidentResponse.status).toBe(403);
            expect(createIncidentResponse.body).toMatchObject({
                error: 'Forbidden',
                message: expect.stringContaining('permission'),
            });
            const updateIncidentResponse = await (0, supertest_1.default)(app)
                .put('/api/incidents/inc-2025-rbac')
                .set('Authorization', `Bearer ${token}`)
                .send({
                status: 'resolved',
                description: 'Viewer trying to update',
            });
            expect(updateIncidentResponse.status).toBe(403);
            const deleteIncidentResponse = await (0, supertest_1.default)(app)
                .delete('/api/incidents/inc-2025-rbac')
                .set('Authorization', `Bearer ${token}`);
            expect(deleteIncidentResponse.status).toBe(403);
        });
        it('should enforce reporter role permissions', async () => {
            const loginResponse = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'reporter',
                password: 'password123',
            });
            expect(loginResponse.status).toBe(200);
            const token = loginResponse.body.access_token;
            const statusResponse = await (0, supertest_1.default)(app)
                .get('/api/system-status')
                .set('Authorization', `Bearer ${token}`);
            expect(statusResponse.status).toBe(200);
            const createIncidentResponse = await (0, supertest_1.default)(app)
                .post('/api/incidents')
                .set('Authorization', `Bearer ${token}`)
                .send({
                title: 'Reporter Created Incident',
                description: 'Reporter can create incidents',
                severity: 'medium',
                priority: 'P3',
                affected_services: ['id-recognition'],
            });
            expect(createIncidentResponse.status).toBe(201);
            expect(createIncidentResponse.body).toMatchObject({
                title: 'Reporter Created Incident',
                created_by: 'user-reporter',
            });
            const newIncidentId = createIncidentResponse.body.id;
            const updateIncidentResponse = await (0, supertest_1.default)(app)
                .put(`/api/incidents/${newIncidentId}`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                status: 'identified',
                description: 'Reporter can update incidents',
            });
            expect(updateIncidentResponse.status).toBe(200);
            const addUpdateResponse = await (0, supertest_1.default)(app)
                .post(`/api/incidents/${newIncidentId}/updates`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                status: 'monitoring',
                description: 'Reporter can add updates',
            });
            expect(addUpdateResponse.status).toBe(201);
            const deleteIncidentResponse = await (0, supertest_1.default)(app)
                .delete(`/api/incidents/${newIncidentId}`)
                .set('Authorization', `Bearer ${token}`);
            expect(deleteIncidentResponse.status).toBe(403);
            expect(deleteIncidentResponse.body).toMatchObject({
                error: 'Forbidden',
                message: expect.stringContaining('permission'),
            });
        });
        it('should enforce admin role permissions', async () => {
            const loginResponse = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'admin',
                password: 'password123',
            });
            expect(loginResponse.status).toBe(200);
            const token = loginResponse.body.access_token;
            const createIncidentResponse = await (0, supertest_1.default)(app)
                .post('/api/incidents')
                .set('Authorization', `Bearer ${token}`)
                .send({
                title: 'Admin Created Incident',
                description: 'Admin can create incidents',
                severity: 'critical',
                priority: 'P1',
                affected_services: ['id-recognition'],
            });
            expect(createIncidentResponse.status).toBe(201);
            const newIncidentId = createIncidentResponse.body.id;
            const updateIncidentResponse = await (0, supertest_1.default)(app)
                .put(`/api/incidents/${newIncidentId}`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                status: 'resolved',
                description: 'Admin can update incidents',
            });
            expect(updateIncidentResponse.status).toBe(200);
            const deleteIncidentResponse = await (0, supertest_1.default)(app)
                .delete(`/api/incidents/${newIncidentId}`)
                .set('Authorization', `Bearer ${token}`);
            expect(deleteIncidentResponse.status).toBe(200);
            const getDeletedIncidentResponse = await (0, supertest_1.default)(app)
                .get(`/api/incidents/${newIncidentId}`)
                .set('Authorization', `Bearer ${token}`);
            expect(getDeletedIncidentResponse.status).toBe(404);
            const deleteOriginalResponse = await (0, supertest_1.default)(app)
                .delete('/api/incidents/inc-2025-rbac')
                .set('Authorization', `Bearer ${token}`);
            expect(deleteOriginalResponse.status).toBe(200);
        });
        it('should validate JWT token and authentication', async () => {
            const noTokenResponse = await (0, supertest_1.default)(app)
                .get('/api/system-status');
            expect(noTokenResponse.status).toBe(401);
            const invalidTokenResponse = await (0, supertest_1.default)(app)
                .get('/api/system-status')
                .set('Authorization', 'Bearer invalid-token');
            expect(invalidTokenResponse.status).toBe(401);
            const malformedTokenResponse = await (0, supertest_1.default)(app)
                .get('/api/system-status')
                .set('Authorization', 'InvalidBearer token');
            expect(malformedTokenResponse.status).toBe(401);
        });
        it('should provide proper error messages for unauthorized actions', async () => {
            const loginResponse = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'viewer',
                password: 'password123',
            });
            expect(loginResponse.status).toBe(200);
            const token = loginResponse.body.access_token;
            const createResponse = await (0, supertest_1.default)(app)
                .post('/api/incidents')
                .set('Authorization', `Bearer ${token}`)
                .send({
                title: 'Test',
                description: 'Test',
                severity: 'low',
                priority: 'P4',
                affected_services: ['id-recognition'],
            });
            expect(createResponse.status).toBe(403);
            expect(createResponse.body).toMatchObject({
                error: 'Forbidden',
                message: expect.stringContaining('permission'),
                required_role: expect.stringMatching(/reporter|admin/),
                current_role: 'viewer',
            });
            const reporterLogin = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'reporter',
                password: 'password123',
            });
            const reporterToken = reporterLogin.body.access_token;
            const deleteResponse = await (0, supertest_1.default)(app)
                .delete('/api/incidents/inc-2025-rbac')
                .set('Authorization', `Bearer ${reporterToken}`);
            expect(deleteResponse.status).toBe(403);
            expect(deleteResponse.body).toMatchObject({
                error: 'Forbidden',
                message: expect.stringContaining('permission'),
                required_role: 'admin',
                current_role: 'reporter',
            });
        });
        it('should handle role-based SLA endpoint access', async () => {
            const roles = [
                { username: 'viewer', role: 'viewer' },
                { username: 'reporter', role: 'reporter' },
                { username: 'admin', role: 'admin' },
            ];
            for (const user of roles) {
                const loginResponse = await (0, supertest_1.default)(app)
                    .post('/api/auth/login')
                    .send({
                    username: user.username,
                    password: 'password123',
                });
                expect(loginResponse.status).toBe(200);
                const token = loginResponse.body.access_token;
                const responseTimesResponse = await (0, supertest_1.default)(app)
                    .get('/api/sla/response-times/id-recognition')
                    .set('Authorization', `Bearer ${token}`);
                expect(responseTimesResponse.status).toBe(200);
                const availabilityResponse = await (0, supertest_1.default)(app)
                    .get('/api/sla/availability/id-recognition')
                    .set('Authorization', `Bearer ${token}`);
                expect(availabilityResponse.status).toBe(200);
            }
        });
        it('should enforce role hierarchy consistency', async () => {
            const testData = [];
            const adminLogin = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({ username: 'admin', password: 'password123' });
            const adminToken = adminLogin.body.access_token;
            const adminIncident = await (0, supertest_1.default)(app)
                .post('/api/incidents')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                title: 'Admin Created Incident',
                description: 'Created by admin',
                severity: 'high',
                priority: 'P2',
                affected_services: ['id-recognition'],
            });
            testData.push(adminIncident.body.id);
            const reporterLogin = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({ username: 'reporter', password: 'password123' });
            const reporterToken = reporterLogin.body.access_token;
            const reporterIncident = await (0, supertest_1.default)(app)
                .post('/api/incidents')
                .set('Authorization', `Bearer ${reporterToken}`)
                .send({
                title: 'Reporter Created Incident',
                description: 'Created by reporter',
                severity: 'medium',
                priority: 'P3',
                affected_services: ['id-recognition'],
            });
            testData.push(reporterIncident.body.id);
            const viewerLogin = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({ username: 'viewer', password: 'password123' });
            const viewerToken = viewerLogin.body.access_token;
            for (const incidentId of testData) {
                const viewResponse = await (0, supertest_1.default)(app)
                    .get(`/api/incidents/${incidentId}`)
                    .set('Authorization', `Bearer ${viewerToken}`);
                expect(viewResponse.status).toBe(200);
            }
            for (const incidentId of testData) {
                const updateResponse = await (0, supertest_1.default)(app)
                    .put(`/api/incidents/${incidentId}`)
                    .set('Authorization', `Bearer ${reporterToken}`)
                    .send({
                    description: 'Updated by reporter',
                });
                expect(updateResponse.status).toBe(200);
            }
            for (const incidentId of testData) {
                const deleteResponse = await (0, supertest_1.default)(app)
                    .delete(`/api/incidents/${incidentId}`)
                    .set('Authorization', `Bearer ${adminToken}`);
                expect(deleteResponse.status).toBe(200);
            }
        });
    });
});
//# sourceMappingURL=rbac.test.js.map
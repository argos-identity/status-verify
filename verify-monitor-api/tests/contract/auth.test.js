"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const setup_1 = require("../setup");
let app;
describe('Contract Test: Authentication endpoints', () => {
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
                    id: 'user-admin',
                    username: 'admin',
                    email: 'admin@example.com',
                    password_hash: '$2b$12$hash-for-password123',
                    role: 'admin',
                    is_active: true,
                },
                {
                    id: 'user-reporter',
                    username: 'reporter',
                    email: 'reporter@example.com',
                    password_hash: '$2b$12$hash-for-password123',
                    role: 'reporter',
                    is_active: true,
                },
                {
                    id: 'user-viewer',
                    username: 'viewer',
                    email: 'viewer@example.com',
                    password_hash: '$2b$12$hash-for-password123',
                    role: 'viewer',
                    is_active: true,
                },
                {
                    id: 'user-inactive',
                    username: 'inactive',
                    email: 'inactive@example.com',
                    password_hash: '$2b$12$hash-for-password123',
                    role: 'viewer',
                    is_active: false,
                },
            ],
        });
    });
    describe('POST /api/auth/login', () => {
        it('should authenticate user with valid credentials', async () => {
            if (!app) {
                expect(app).toBeDefined();
                return;
            }
            const loginData = {
                username: 'admin',
                password: 'password123',
            };
            const response = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send(loginData)
                .expect(200);
            expect(response.body).toHaveProperty('user');
            expect(response.body).toHaveProperty('accessToken');
            expect(response.body).toHaveProperty('refreshToken');
            expect(response.body).toHaveProperty('expiresIn');
            const user = response.body.user;
            expect(user).toHaveProperty('id');
            expect(user).toHaveProperty('username');
            expect(user).toHaveProperty('email');
            expect(user).toHaveProperty('role');
            expect(user.username).toBe('admin');
            expect(user.email).toBe('admin@example.com');
            expect(user.role).toBe('admin');
            expect(user).not.toHaveProperty('password_hash');
            expect(typeof response.body.accessToken).toBe('string');
            expect(typeof response.body.refreshToken).toBe('string');
            expect(typeof response.body.expiresIn).toBe('number');
            expect(response.body.expiresIn).toBe(86400);
            const tokenParts = response.body.accessToken.split('.');
            expect(tokenParts.length).toBe(3);
        });
        it('should reject invalid username', async () => {
            if (!app) {
                expect(app).toBeDefined();
                return;
            }
            const response = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'nonexistent',
                password: 'password123',
            })
                .expect(401);
            expect(response.body).toHaveProperty('error');
            expect(response.body).toHaveProperty('message');
        });
        it('should reject invalid password', async () => {
            if (!app) {
                expect(app).toBeDefined();
                return;
            }
            const response = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'admin',
                password: 'wrongpassword',
            })
                .expect(401);
            expect(response.body).toHaveProperty('error');
            expect(response.body).toHaveProperty('message');
        });
        it('should reject inactive user', async () => {
            if (!app) {
                expect(app).toBeDefined();
                return;
            }
            const response = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'inactive',
                password: 'password123',
            })
                .expect(401);
            expect(response.body).toHaveProperty('error');
            expect(response.body.message).toContain('inactive');
        });
        it('should validate required fields', async () => {
            if (!app) {
                expect(app).toBeDefined();
                return;
            }
            await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                password: 'password123',
            })
                .expect(400);
            await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'admin',
            })
                .expect(400);
            await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({})
                .expect(400);
        });
        it('should handle different user roles', async () => {
            if (!app) {
                expect(app).toBeDefined();
                return;
            }
            const roles = ['admin', 'reporter', 'viewer'];
            for (const role of roles) {
                const response = await (0, supertest_1.default)(app)
                    .post('/api/auth/login')
                    .send({
                    username: role,
                    password: 'password123',
                })
                    .expect(200);
                expect(response.body.user.role).toBe(role);
                expect(response.body.user.username).toBe(role);
            }
        });
        it('should update last_login_at timestamp', async () => {
            if (!app) {
                expect(app).toBeDefined();
                return;
            }
            const userBefore = await setup_1.prisma.user.findUnique({
                where: { username: 'admin' },
            });
            expect(userBefore?.last_login_at).toBeNull();
            await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'admin',
                password: 'password123',
            })
                .expect(200);
            const userAfter = await setup_1.prisma.user.findUnique({
                where: { username: 'admin' },
            });
            expect(userAfter?.last_login_at).not.toBeNull();
            expect(userAfter?.last_login_at).toBeInstanceOf(Date);
            const now = new Date();
            const lastLogin = userAfter?.last_login_at;
            const diffMs = Math.abs(now.getTime() - lastLogin.getTime());
            expect(diffMs).toBeLessThan(60000);
        });
    });
    describe('POST /api/auth/refresh', () => {
        let refreshToken;
        beforeEach(async () => {
            if (!app)
                return;
            const loginResponse = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'admin',
                password: 'password123',
            })
                .expect(200);
            refreshToken = loginResponse.body.refreshToken;
        });
        it('should refresh access token with valid refresh token', async () => {
            if (!app) {
                expect(app).toBeDefined();
                return;
            }
            const response = await (0, supertest_1.default)(app)
                .post('/api/auth/refresh')
                .send({
                refreshToken,
            })
                .expect(200);
            expect(response.body).toHaveProperty('user');
            expect(response.body).toHaveProperty('accessToken');
            expect(response.body).toHaveProperty('refreshToken');
            expect(response.body).toHaveProperty('expiresIn');
            expect(typeof response.body.accessToken).toBe('string');
            expect(typeof response.body.refreshToken).toBe('string');
            const tokenParts = response.body.accessToken.split('.');
            expect(tokenParts.length).toBe(3);
        });
        it('should reject invalid refresh token', async () => {
            if (!app) {
                expect(app).toBeDefined();
                return;
            }
            const response = await (0, supertest_1.default)(app)
                .post('/api/auth/refresh')
                .send({
                refreshToken: 'invalid-token',
            })
                .expect(401);
            expect(response.body).toHaveProperty('error');
            expect(response.body).toHaveProperty('message');
        });
        it('should reject expired refresh token', async () => {
            if (!app) {
                expect(app).toBeDefined();
                return;
            }
            const expiredToken = 'expired.refresh.token';
            const response = await (0, supertest_1.default)(app)
                .post('/api/auth/refresh')
                .send({
                refreshToken: expiredToken,
            })
                .expect(401);
            expect(response.body).toHaveProperty('error');
        });
        it('should validate required refresh token', async () => {
            if (!app) {
                expect(app).toBeDefined();
                return;
            }
            const response = await (0, supertest_1.default)(app)
                .post('/api/auth/refresh')
                .send({})
                .expect(400);
            expect(response.body).toHaveProperty('error');
        });
    });
    describe('JWT Token Validation', () => {
        let accessToken;
        beforeEach(async () => {
            if (!app)
                return;
            const loginResponse = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'reporter',
                password: 'password123',
            })
                .expect(200);
            accessToken = loginResponse.body.accessToken;
        });
        it('should accept valid JWT token for protected routes', async () => {
            if (!app) {
                expect(app).toBeDefined();
                return;
            }
            const response = await (0, supertest_1.default)(app)
                .get('/api/incidents')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);
            expect(response.body).toHaveProperty('incidents');
        });
        it('should reject requests without token', async () => {
            if (!app) {
                expect(app).toBeDefined();
                return;
            }
            const response = await (0, supertest_1.default)(app)
                .get('/api/incidents')
                .expect(401);
            expect(response.body).toHaveProperty('error');
        });
        it('should reject invalid token format', async () => {
            if (!app) {
                expect(app).toBeDefined();
                return;
            }
            const response = await (0, supertest_1.default)(app)
                .get('/api/incidents')
                .set('Authorization', 'Bearer invalid-token')
                .expect(401);
            expect(response.body).toHaveProperty('error');
        });
        it('should reject malformed Authorization header', async () => {
            if (!app) {
                expect(app).toBeDefined();
                return;
            }
            await (0, supertest_1.default)(app)
                .get('/api/incidents')
                .set('Authorization', accessToken)
                .expect(401);
            await (0, supertest_1.default)(app)
                .get('/api/incidents')
                .set('Authorization', `Token ${accessToken}`)
                .expect(401);
        });
        it('should handle token expiration', async () => {
            if (!app) {
                expect(app).toBeDefined();
                return;
            }
            const expiredToken = 'expired.jwt.token';
            const response = await (0, supertest_1.default)(app)
                .get('/api/incidents')
                .set('Authorization', `Bearer ${expiredToken}`)
                .expect(401);
            expect(response.body).toHaveProperty('error');
            expect(response.body.message).toContain('expired');
        });
    });
    describe('Role-based Access Control', () => {
        let adminToken;
        let reporterToken;
        let viewerToken;
        beforeEach(async () => {
            if (!app)
                return;
            const adminLogin = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({ username: 'admin', password: 'password123' });
            adminToken = adminLogin.body.accessToken;
            const reporterLogin = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({ username: 'reporter', password: 'password123' });
            reporterToken = reporterLogin.body.accessToken;
            const viewerLogin = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({ username: 'viewer', password: 'password123' });
            viewerToken = viewerLogin.body.accessToken;
        });
        it('should allow viewer to read incidents but not create', async () => {
            if (!app) {
                expect(app).toBeDefined();
                return;
            }
            await (0, supertest_1.default)(app)
                .get('/api/incidents')
                .set('Authorization', `Bearer ${viewerToken}`)
                .expect(200);
            await (0, supertest_1.default)(app)
                .post('/api/incidents')
                .set('Authorization', `Bearer ${viewerToken}`)
                .send({
                title: 'Test incident',
                severity: 'low',
                priority: 'P3',
                affected_services: ['id-recognition'],
            })
                .expect(403);
        });
        it('should allow reporter to create and update incidents', async () => {
            if (!app) {
                expect(app).toBeDefined();
                return;
            }
            const createResponse = await (0, supertest_1.default)(app)
                .post('/api/incidents')
                .set('Authorization', `Bearer ${reporterToken}`)
                .send({
                title: 'Reporter incident',
                severity: 'medium',
                priority: 'P3',
                affected_services: ['id-recognition'],
            })
                .expect(201);
            const incidentId = createResponse.body.incident.id;
            await (0, supertest_1.default)(app)
                .put(`/api/incidents/${incidentId}`)
                .set('Authorization', `Bearer ${reporterToken}`)
                .send({
                status: 'identified',
            })
                .expect(200);
        });
        it('should allow admin full access including delete', async () => {
            if (!app) {
                expect(app).toBeDefined();
                return;
            }
            const createResponse = await (0, supertest_1.default)(app)
                .post('/api/incidents')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                title: 'Admin incident',
                severity: 'high',
                priority: 'P2',
                affected_services: ['id-recognition'],
            })
                .expect(201);
            const incidentId = createResponse.body.incident.id;
            await (0, supertest_1.default)(app)
                .delete(`/api/incidents/${incidentId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
        });
        it('should reject reporter from deleting incidents', async () => {
            if (!app) {
                expect(app).toBeDefined();
                return;
            }
            await (0, supertest_1.default)(app)
                .delete('/api/incidents/inc-2025-001')
                .set('Authorization', `Bearer ${reporterToken}`)
                .expect(403);
        });
    });
    it('should respond within 200ms for auth endpoints (performance requirement)', async () => {
        if (!app) {
            expect(app).toBeDefined();
            return;
        }
        let startTime = Date.now();
        await (0, supertest_1.default)(app)
            .post('/api/auth/login')
            .send({
            username: 'admin',
            password: 'password123',
        })
            .expect(200);
        expect(Date.now() - startTime).toBeLessThan(200);
        const loginResponse = await (0, supertest_1.default)(app)
            .post('/api/auth/login')
            .send({
            username: 'admin',
            password: 'password123',
        });
        startTime = Date.now();
        await (0, supertest_1.default)(app)
            .post('/api/auth/refresh')
            .send({
            refreshToken: loginResponse.body.refreshToken,
        })
            .expect(200);
        expect(Date.now() - startTime).toBeLessThan(200);
    });
});
//# sourceMappingURL=auth.test.js.map
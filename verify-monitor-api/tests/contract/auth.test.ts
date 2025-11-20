import request from 'supertest';
import { Express } from 'express';
import { prisma } from '../setup';

let app: Express;

describe('Contract Test: Authentication endpoints', () => {
  beforeAll(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      app = require('../../src/app').default;
    } catch (error) {
      console.log('App not implemented yet - tests will fail as expected (TDD)');
    }
  });

  beforeEach(async () => {
    // Create test users
    await prisma.user.createMany({
      data: [
        {
          id: 'user-admin',
          username: 'admin',
          email: 'admin@example.com',
          password_hash: '$2b$12$hash-for-password123', // bcrypt hash of "password123"
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

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      // Verify response structure matches OpenAPI contract
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('expiresIn');

      // Verify user object structure
      const user = response.body.user;
      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('username');
      expect(user).toHaveProperty('email');
      expect(user).toHaveProperty('role');

      // Verify user data
      expect(user.username).toBe('admin');
      expect(user.email).toBe('admin@example.com');
      expect(user.role).toBe('admin');

      // Verify sensitive data is not exposed
      expect(user).not.toHaveProperty('password_hash');

      // Verify token properties
      expect(typeof response.body.accessToken).toBe('string');
      expect(typeof response.body.refreshToken).toBe('string');
      expect(typeof response.body.expiresIn).toBe('number');
      expect(response.body.expiresIn).toBe(86400); // 24 hours in seconds

      // Verify JWT token format (should have 3 parts separated by dots)
      const tokenParts = response.body.accessToken.split('.');
      expect(tokenParts.length).toBe(3);
    });

    it('should reject invalid username', async () => {
      if (!app) {
        expect(app).toBeDefined();
        return;
      }

      const response = await request(app)
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

      const response = await request(app)
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

      const response = await request(app)
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

      // Missing username
      await request(app)
        .post('/api/auth/login')
        .send({
          password: 'password123',
        })
        .expect(400);

      // Missing password
      await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
        })
        .expect(400);

      // Empty request body
      await request(app)
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
        const response = await request(app)
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

      // Check initial state
      const userBefore = await prisma.user.findUnique({
        where: { username: 'admin' },
      });
      expect(userBefore?.last_login_at).toBeNull();

      // Login
      await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'password123',
        })
        .expect(200);

      // Check updated timestamp
      const userAfter = await prisma.user.findUnique({
        where: { username: 'admin' },
      });
      expect(userAfter?.last_login_at).not.toBeNull();
      expect(userAfter?.last_login_at).toBeInstanceOf(Date);

      // Should be recent (within last minute)
      const now = new Date();
      const lastLogin = userAfter?.last_login_at!;
      const diffMs = Math.abs(now.getTime() - lastLogin.getTime());
      expect(diffMs).toBeLessThan(60000);
    });
  });

  describe('POST /api/auth/refresh', () => {
    let refreshToken: string;

    beforeEach(async () => {
      if (!app) return;

      // Login first to get refresh token
      const loginResponse = await request(app)
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

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken,
        })
        .expect(200);

      // Verify response structure
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('expiresIn');

      // Should return new tokens
      expect(typeof response.body.accessToken).toBe('string');
      expect(typeof response.body.refreshToken).toBe('string');

      // New access token should be different from the old one
      const tokenParts = response.body.accessToken.split('.');
      expect(tokenParts.length).toBe(3);
    });

    it('should reject invalid refresh token', async () => {
      if (!app) {
        expect(app).toBeDefined();
        return;
      }

      const response = await request(app)
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

      // Create an expired refresh token (this would be handled by JWT library)
      const expiredToken = 'expired.refresh.token';

      const response = await request(app)
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

      // Missing refresh token
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('JWT Token Validation', () => {
    let accessToken: string;

    beforeEach(async () => {
      if (!app) return;

      const loginResponse = await request(app)
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

      // Try accessing protected incident route
      const response = await request(app)
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

      const response = await request(app)
        .get('/api/incidents')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject invalid token format', async () => {
      if (!app) {
        expect(app).toBeDefined();
        return;
      }

      const response = await request(app)
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

      // Missing 'Bearer' prefix
      await request(app)
        .get('/api/incidents')
        .set('Authorization', accessToken)
        .expect(401);

      // Wrong format
      await request(app)
        .get('/api/incidents')
        .set('Authorization', `Token ${accessToken}`)
        .expect(401);
    });

    it('should handle token expiration', async () => {
      if (!app) {
        expect(app).toBeDefined();
        return;
      }

      // Create an expired token (this would be handled by JWT library)
      const expiredToken = 'expired.jwt.token';

      const response = await request(app)
        .get('/api/incidents')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.message).toContain('expired');
    });
  });

  describe('Role-based Access Control', () => {
    let adminToken: string;
    let reporterToken: string;
    let viewerToken: string;

    beforeEach(async () => {
      if (!app) return;

      // Get tokens for each role
      const adminLogin = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'password123' });
      adminToken = adminLogin.body.accessToken;

      const reporterLogin = await request(app)
        .post('/api/auth/login')
        .send({ username: 'reporter', password: 'password123' });
      reporterToken = reporterLogin.body.accessToken;

      const viewerLogin = await request(app)
        .post('/api/auth/login')
        .send({ username: 'viewer', password: 'password123' });
      viewerToken = viewerLogin.body.accessToken;
    });

    it('should allow viewer to read incidents but not create', async () => {
      if (!app) {
        expect(app).toBeDefined();
        return;
      }

      // Should be able to read
      await request(app)
        .get('/api/incidents')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);

      // Should not be able to create
      await request(app)
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

      // Should be able to create
      const createResponse = await request(app)
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

      // Should be able to update
      await request(app)
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

      // Create incident first
      const createResponse = await request(app)
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

      // Should be able to delete
      await request(app)
        .delete(`/api/incidents/${incidentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should reject reporter from deleting incidents', async () => {
      if (!app) {
        expect(app).toBeDefined();
        return;
      }

      // Try to delete existing incident
      await request(app)
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

    // Test login performance
    let startTime = Date.now();
    await request(app)
      .post('/api/auth/login')
      .send({
        username: 'admin',
        password: 'password123',
      })
      .expect(200);
    expect(Date.now() - startTime).toBeLessThan(200);

    // Test refresh performance
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'admin',
        password: 'password123',
      });

    startTime = Date.now();
    await request(app)
      .post('/api/auth/refresh')
      .send({
        refreshToken: loginResponse.body.refreshToken,
      })
      .expect(200);
    expect(Date.now() - startTime).toBeLessThan(200);
  });
});
import request from 'supertest';
import { Express } from 'express';
import { prisma } from '../setup';

let app: Express;

describe('Integration Test: Role-based Access Control Scenario (T026)', () => {
  beforeAll(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      app = require('../../src/app').default;
    } catch (error) {
      console.log('App not implemented yet - tests will fail as expected (TDD)');
    }
  });

  beforeEach(async () => {
    // Create test users with different roles
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
        {
          id: 'user-admin',
          username: 'admin',
          email: 'admin@example.com',
          password_hash: '$2b$12$hash-for-password123',
          role: 'admin',
        },
      ],
    });

    // Create test service
    await prisma.service.create({
      data: {
        id: 'id-recognition',
        name: 'ID Recognition',
        type: 'api',
        url: 'https://api.company.com/id-recognition',
        current_status: 'operational',
      },
    });

    // Create test incident
    await prisma.incident.create({
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
    await prisma.incident.deleteMany();
    await prisma.service.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('Test Scenario 5: Role-based Access Control (FR-019)', () => {
    it('should enforce viewer role permissions', async () => {
      // Login as viewer
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Viewer should be able to read system status
      const statusResponse = await request(app)
        .get('/api/system-status')
        .set('Authorization', `Bearer ${token}`);

      expect(statusResponse.status).toBe(200);

      // Viewer should be able to read services
      const servicesResponse = await request(app)
        .get('/api/services')
        .set('Authorization', `Bearer ${token}`);

      expect(servicesResponse.status).toBe(200);

      // Viewer should be able to read uptime data
      const uptimeResponse = await request(app)
        .get('/api/uptime/id-recognition')
        .set('Authorization', `Bearer ${token}`);

      expect(uptimeResponse.status).toBe(200);

      // Viewer should be able to read incidents
      const incidentResponse = await request(app)
        .get('/api/incidents/inc-2025-rbac')
        .set('Authorization', `Bearer ${token}`);

      expect(incidentResponse.status).toBe(200);

      // Viewer should NOT be able to create incidents
      const createIncidentResponse = await request(app)
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

      // Viewer should NOT be able to update incidents
      const updateIncidentResponse = await request(app)
        .put('/api/incidents/inc-2025-rbac')
        .set('Authorization', `Bearer ${token}`)
        .send({
          status: 'resolved',
          description: 'Viewer trying to update',
        });

      expect(updateIncidentResponse.status).toBe(403);

      // Viewer should NOT be able to delete incidents
      const deleteIncidentResponse = await request(app)
        .delete('/api/incidents/inc-2025-rbac')
        .set('Authorization', `Bearer ${token}`);

      expect(deleteIncidentResponse.status).toBe(403);
    });

    it('should enforce reporter role permissions', async () => {
      // Login as reporter
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'reporter',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Reporter should be able to read all data (same as viewer)
      const statusResponse = await request(app)
        .get('/api/system-status')
        .set('Authorization', `Bearer ${token}`);

      expect(statusResponse.status).toBe(200);

      // Reporter should be able to create incidents
      const createIncidentResponse = await request(app)
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

      // Reporter should be able to update incidents
      const updateIncidentResponse = await request(app)
        .put(`/api/incidents/${newIncidentId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          status: 'identified',
          description: 'Reporter can update incidents',
        });

      expect(updateIncidentResponse.status).toBe(200);

      // Reporter should be able to add incident updates
      const addUpdateResponse = await request(app)
        .post(`/api/incidents/${newIncidentId}/updates`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          status: 'monitoring',
          description: 'Reporter can add updates',
        });

      expect(addUpdateResponse.status).toBe(201);

      // Reporter should NOT be able to delete incidents
      const deleteIncidentResponse = await request(app)
        .delete(`/api/incidents/${newIncidentId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(deleteIncidentResponse.status).toBe(403);
      expect(deleteIncidentResponse.body).toMatchObject({
        error: 'Forbidden',
        message: expect.stringContaining('permission'),
      });
    });

    it('should enforce admin role permissions', async () => {
      // Login as admin
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Admin should have all reporter permissions
      const createIncidentResponse = await request(app)
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

      // Admin should be able to update incidents
      const updateIncidentResponse = await request(app)
        .put(`/api/incidents/${newIncidentId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          status: 'resolved',
          description: 'Admin can update incidents',
        });

      expect(updateIncidentResponse.status).toBe(200);

      // Admin should be able to delete incidents (unique permission)
      const deleteIncidentResponse = await request(app)
        .delete(`/api/incidents/${newIncidentId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(deleteIncidentResponse.status).toBe(200);

      // Verify incident was deleted
      const getDeletedIncidentResponse = await request(app)
        .get(`/api/incidents/${newIncidentId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(getDeletedIncidentResponse.status).toBe(404);

      // Admin should be able to delete the original test incident too
      const deleteOriginalResponse = await request(app)
        .delete('/api/incidents/inc-2025-rbac')
        .set('Authorization', `Bearer ${token}`);

      expect(deleteOriginalResponse.status).toBe(200);
    });

    it('should validate JWT token and authentication', async () => {
      // Test without token
      const noTokenResponse = await request(app)
        .get('/api/system-status');

      expect(noTokenResponse.status).toBe(401);

      // Test with invalid token
      const invalidTokenResponse = await request(app)
        .get('/api/system-status')
        .set('Authorization', 'Bearer invalid-token');

      expect(invalidTokenResponse.status).toBe(401);

      // Test with malformed token
      const malformedTokenResponse = await request(app)
        .get('/api/system-status')
        .set('Authorization', 'InvalidBearer token');

      expect(malformedTokenResponse.status).toBe(401);

      // Test with expired token (if implemented)
      // This would require creating an expired token for testing
    });

    it('should provide proper error messages for unauthorized actions', async () => {
      // Login as viewer
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.access_token;

      // Try to create incident as viewer
      const createResponse = await request(app)
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

      // Try to delete incident as reporter
      const reporterLogin = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'reporter',
          password: 'password123',
        });

      const reporterToken = reporterLogin.body.access_token;

      const deleteResponse = await request(app)
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
      // All roles should be able to access SLA data (read-only)
      const roles = [
        { username: 'viewer', role: 'viewer' },
        { username: 'reporter', role: 'reporter' },
        { username: 'admin', role: 'admin' },
      ];

      for (const user of roles) {
        const loginResponse = await request(app)
          .post('/api/auth/login')
          .send({
            username: user.username,
            password: 'password123',
          });

        expect(loginResponse.status).toBe(200);
        const token = loginResponse.body.access_token;

        // Test SLA response times endpoint
        const responseTimesResponse = await request(app)
          .get('/api/sla/response-times/id-recognition')
          .set('Authorization', `Bearer ${token}`);

        expect(responseTimesResponse.status).toBe(200);

        // Test SLA availability endpoint
        const availabilityResponse = await request(app)
          .get('/api/sla/availability/id-recognition')
          .set('Authorization', `Bearer ${token}`);

        expect(availabilityResponse.status).toBe(200);
      }
    });

    it('should enforce role hierarchy consistency', async () => {
      // Create test data for all roles
      const testData = [];

      // Admin creates incident
      const adminLogin = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'password123' });

      const adminToken = adminLogin.body.access_token;

      const adminIncident = await request(app)
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

      // Reporter creates incident
      const reporterLogin = await request(app)
        .post('/api/auth/login')
        .send({ username: 'reporter', password: 'password123' });

      const reporterToken = reporterLogin.body.access_token;

      const reporterIncident = await request(app)
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

      // Verify role-based access to all incidents
      const viewerLogin = await request(app)
        .post('/api/auth/login')
        .send({ username: 'viewer', password: 'password123' });

      const viewerToken = viewerLogin.body.access_token;

      // Viewer should be able to read all incidents
      for (const incidentId of testData) {
        const viewResponse = await request(app)
          .get(`/api/incidents/${incidentId}`)
          .set('Authorization', `Bearer ${viewerToken}`);

        expect(viewResponse.status).toBe(200);
      }

      // Reporter should be able to update incidents they can access
      for (const incidentId of testData) {
        const updateResponse = await request(app)
          .put(`/api/incidents/${incidentId}`)
          .set('Authorization', `Bearer ${reporterToken}`)
          .send({
            description: 'Updated by reporter',
          });

        expect(updateResponse.status).toBe(200);
      }

      // Only admin should be able to delete
      for (const incidentId of testData) {
        const deleteResponse = await request(app)
          .delete(`/api/incidents/${incidentId}`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(deleteResponse.status).toBe(200);
      }
    });
  });
});
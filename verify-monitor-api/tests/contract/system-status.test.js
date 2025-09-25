"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const setup_1 = require("../setup");
let app;
describe('Contract Test: GET /api/system-status', () => {
    beforeAll(() => {
        try {
            app = require('../../src/app').default;
        }
        catch (error) {
            console.log('App not implemented yet - tests will fail as expected (TDD)');
        }
    });
    beforeEach(async () => {
        await setup_1.prisma.service.createMany({
            data: [
                {
                    id: 'id-recognition',
                    name: 'ID Recognition',
                    description: 'Identity document verification service',
                    endpoint_url: 'https://api.company.com/id-recognition/health',
                },
                {
                    id: 'face-liveness',
                    name: 'Face Liveness',
                    description: 'Face liveness detection service',
                    endpoint_url: 'https://api.company.com/face-liveness/health',
                },
                {
                    id: 'id-liveness',
                    name: 'ID Liveness',
                    description: 'ID document liveness verification',
                    endpoint_url: 'https://api.company.com/id-liveness/health',
                },
                {
                    id: 'face-compare',
                    name: 'Face Compare',
                    description: 'Facial comparison verification',
                    endpoint_url: 'https://api.company.com/face-compare/health',
                },
                {
                    id: 'curp-verifier',
                    name: 'Curp Verifier',
                    description: 'CURP document verification service',
                    endpoint_url: 'https://api.company.com/curp-verifier/health',
                },
            ],
        });
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        await setup_1.prisma.uptimeRecord.createMany({
            data: [
                {
                    service_id: 'id-recognition',
                    date: today,
                    status: 'o',
                    response_time: 150,
                },
                {
                    service_id: 'id-recognition',
                    date: yesterday,
                    status: 'o',
                    response_time: 200,
                },
                {
                    service_id: 'face-liveness',
                    date: today,
                    status: 'po',
                    response_time: 800,
                },
                {
                    service_id: 'face-liveness',
                    date: yesterday,
                    status: 'o',
                    response_time: 250,
                },
                {
                    service_id: 'id-liveness',
                    date: today,
                    status: 'o',
                    response_time: 120,
                },
                {
                    service_id: 'face-compare',
                    date: today,
                    status: 'mo',
                    response_time: null,
                    error_message: 'Service unavailable',
                },
                {
                    service_id: 'curp-verifier',
                    date: today,
                    status: 'o',
                    response_time: 180,
                },
            ],
        });
        await setup_1.prisma.systemStatus.create({
            data: {
                overall_status: 'degraded',
                message: 'Some services are experiencing issues',
            },
        });
    });
    it('should return system status with correct structure', async () => {
        if (!app) {
            expect(app).toBeDefined();
            return;
        }
        const response = await (0, supertest_1.default)(app).get('/api/system-status').expect(200);
        expect(response.body).toHaveProperty('overallStatus');
        expect(response.body).toHaveProperty('lastUpdated');
        expect(response.body).toHaveProperty('services');
        expect(response.body.overallStatus).toBe('degraded');
        expect(Array.isArray(response.body.services)).toBe(true);
        expect(response.body.services.length).toBe(5);
        response.body.services.forEach((service) => {
            expect(service).toHaveProperty('id');
            expect(service).toHaveProperty('name');
            expect(service).toHaveProperty('status');
            expect(service).toHaveProperty('uptime');
            expect(service).toHaveProperty('uptimeData');
            expect(['operational', 'degraded', 'outage']).toContain(service.status);
            expect(typeof service.uptime).toBe('string');
            expect(service.uptime).toMatch(/^\d+\.\d{2}$/);
            expect(Array.isArray(service.uptimeData)).toBe(true);
            expect(service.uptimeData.length).toBe(90);
            service.uptimeData.forEach((status) => {
                expect(['o', 'po', 'mo', 'nd', 'e']).toContain(status);
            });
        });
        const idRecognitionService = response.body.services.find((s) => s.id === 'id-recognition');
        expect(idRecognitionService.status).toBe('operational');
        const faceLivenessService = response.body.services.find((s) => s.id === 'face-liveness');
        expect(faceLivenessService.status).toBe('degraded');
        const faceCompareService = response.body.services.find((s) => s.id === 'face-compare');
        expect(faceCompareService.status).toBe('outage');
        const lastUpdated = new Date(response.body.lastUpdated);
        const now = new Date();
        const diffMs = Math.abs(now.getTime() - lastUpdated.getTime());
        expect(diffMs).toBeLessThan(60000);
    });
    it('should handle empty database gracefully', async () => {
        if (!app) {
            expect(app).toBeDefined();
            return;
        }
        await setup_1.prisma.$executeRaw `TRUNCATE TABLE "system_status", "uptime_records", "services" RESTART IDENTITY CASCADE;`;
        const response = await (0, supertest_1.default)(app).get('/api/system-status').expect(200);
        expect(response.body.overallStatus).toBe('operational');
        expect(response.body.services).toEqual([]);
    });
    it('should return 500 on database error', async () => {
        if (!app) {
            expect(app).toBeDefined();
            return;
        }
        await setup_1.prisma.$disconnect();
        const response = await (0, supertest_1.default)(app).get('/api/system-status').expect(500);
        expect(response.body).toHaveProperty('error');
        expect(response.body).toHaveProperty('message');
        await setup_1.prisma.$connect();
    });
    it('should calculate uptime percentages correctly', async () => {
        if (!app) {
            expect(app).toBeDefined();
            return;
        }
        const response = await (0, supertest_1.default)(app).get('/api/system-status').expect(200);
        const idRecognitionService = response.body.services.find((s) => s.id === 'id-recognition');
        expect(parseFloat(idRecognitionService.uptime)).toBeGreaterThan(95);
        const faceLivenessService = response.body.services.find((s) => s.id === 'face-liveness');
        expect(parseFloat(faceLivenessService.uptime)).toBeLessThan(100);
    });
    it('should respond within 200ms (performance requirement)', async () => {
        if (!app) {
            expect(app).toBeDefined();
            return;
        }
        const startTime = Date.now();
        await (0, supertest_1.default)(app).get('/api/system-status').expect(200);
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        expect(responseTime).toBeLessThan(200);
    });
});
//# sourceMappingURL=system-status.test.js.map
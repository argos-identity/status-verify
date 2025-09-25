"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const setup_1 = require("../setup");
let app;
describe('Contract Test: GET /api/uptime/{serviceId}', () => {
    beforeAll(() => {
        try {
            app = require('../../src/app').default;
        }
        catch (error) {
            console.log('App not implemented yet - tests will fail as expected (TDD)');
        }
    });
    beforeEach(async () => {
        await setup_1.prisma.service.create({
            data: {
                id: 'id-recognition',
                name: 'ID Recognition',
                description: 'Identity document verification service',
                endpoint_url: 'https://api.company.com/id-recognition/health',
            },
        });
        const uptimeData = [];
        const today = new Date();
        for (let i = 0; i < 90; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            let status;
            let responseTime = null;
            let errorMessage = null;
            if (i < 5) {
                status = 'o';
                responseTime = 150 + Math.floor(Math.random() * 100);
            }
            else if (i < 10) {
                status = 'po';
                responseTime = 800 + Math.floor(Math.random() * 200);
            }
            else if (i < 12) {
                status = 'mo';
                errorMessage = 'Service unavailable';
            }
            else if (i < 15) {
                status = 'nd';
            }
            else {
                const rand = Math.random();
                if (rand < 0.9) {
                    status = 'o';
                    responseTime = 120 + Math.floor(Math.random() * 80);
                }
                else if (rand < 0.95) {
                    status = 'po';
                    responseTime = 600 + Math.floor(Math.random() * 400);
                }
                else {
                    status = 'mo';
                    errorMessage = 'Temporary outage';
                }
            }
            uptimeData.push({
                service_id: 'id-recognition',
                date,
                status,
                response_time: responseTime,
                error_message: errorMessage,
            });
        }
        await setup_1.prisma.uptimeRecord.createMany({
            data: uptimeData,
        });
    });
    it('should return uptime data with correct structure (default 3 months)', async () => {
        if (!app) {
            expect(app).toBeDefined();
            return;
        }
        const response = await (0, supertest_1.default)(app)
            .get('/api/uptime/id-recognition')
            .expect(200);
        expect(response.body).toHaveProperty('service');
        expect(response.body).toHaveProperty('months');
        expect(response.body.service.id).toBe('id-recognition');
        expect(response.body.service.name).toBe('ID Recognition');
        expect(Array.isArray(response.body.months)).toBe(true);
        expect(response.body.months.length).toBe(3);
        response.body.months.forEach((month) => {
            expect(month).toHaveProperty('name');
            expect(month).toHaveProperty('uptime');
            expect(month).toHaveProperty('days');
            expect(month.name).toMatch(/^[A-Za-z]+ \d{4}$/);
            expect(typeof month.uptime).toBe('string');
            expect(month.uptime).toMatch(/^\d+\.\d{2}$/);
            expect(Array.isArray(month.days)).toBe(true);
            expect(month.days.length).toBeGreaterThan(20);
            expect(month.days.length).toBeLessThanOrEqual(31);
            month.days.forEach((dayStatus) => {
                expect(['o', 'po', 'mo', 'nd', 'e']).toContain(dayStatus);
            });
        });
    });
    it('should support custom months parameter', async () => {
        if (!app) {
            expect(app).toBeDefined();
            return;
        }
        const response = await (0, supertest_1.default)(app)
            .get('/api/uptime/id-recognition?months=6')
            .expect(200);
        expect(response.body.months.length).toBe(6);
    });
    it('should support startDate parameter', async () => {
        if (!app) {
            expect(app).toBeDefined();
            return;
        }
        const startDate = '2025-06-01';
        const response = await (0, supertest_1.default)(app)
            .get(`/api/uptime/id-recognition?startDate=${startDate}`)
            .expect(200);
        const monthNames = response.body.months.map((m) => m.name);
        expect(monthNames[0]).toContain('June 2025');
    });
    it('should validate months parameter range', async () => {
        if (!app) {
            expect(app).toBeDefined();
            return;
        }
        await (0, supertest_1.default)(app)
            .get('/api/uptime/id-recognition?months=1')
            .expect(200);
        await (0, supertest_1.default)(app)
            .get('/api/uptime/id-recognition?months=12')
            .expect(200);
        await (0, supertest_1.default)(app)
            .get('/api/uptime/id-recognition?months=0')
            .expect(400);
        await (0, supertest_1.default)(app)
            .get('/api/uptime/id-recognition?months=13')
            .expect(400);
    });
    it('should return 404 for non-existent service', async () => {
        if (!app) {
            expect(app).toBeDefined();
            return;
        }
        const response = await (0, supertest_1.default)(app)
            .get('/api/uptime/non-existent-service')
            .expect(404);
        expect(response.body).toHaveProperty('error');
        expect(response.body).toHaveProperty('message');
    });
    it('should calculate uptime percentages correctly', async () => {
        if (!app) {
            expect(app).toBeDefined();
            return;
        }
        const response = await (0, supertest_1.default)(app)
            .get('/api/uptime/id-recognition')
            .expect(200);
        const currentMonth = response.body.months[0];
        const operationalDays = currentMonth.days.filter((day) => day === 'o').length;
        const totalDays = currentMonth.days.length;
        const expectedUptime = (operationalDays / totalDays) * 100;
        const actualUptime = parseFloat(currentMonth.uptime);
        expect(Math.abs(actualUptime - expectedUptime)).toBeLessThan(0.01);
    });
    it('should handle service with no uptime data', async () => {
        if (!app) {
            expect(app).toBeDefined();
            return;
        }
        await setup_1.prisma.service.create({
            data: {
                id: 'new-service',
                name: 'New Service',
            },
        });
        const response = await (0, supertest_1.default)(app)
            .get('/api/uptime/new-service')
            .expect(200);
        expect(response.body.service.id).toBe('new-service');
        expect(response.body.months.length).toBe(3);
        response.body.months.forEach((month) => {
            month.days.forEach((day) => {
                expect(day).toBe('e');
            });
            expect(month.uptime).toBe('0.00');
        });
    });
    it('should return proper status codes based on uptime data', async () => {
        if (!app) {
            expect(app).toBeDefined();
            return;
        }
        const response = await (0, supertest_1.default)(app)
            .get('/api/uptime/id-recognition')
            .expect(200);
        const currentMonth = response.body.months[0];
        const statusCounts = currentMonth.days.reduce((acc, status) => {
            acc[status] = (acc[status] || 0) + 1;
            return acc;
        }, {});
        expect(statusCounts.o).toBeGreaterThan(0);
        expect(statusCounts.po).toBeGreaterThan(0);
    });
    it('should return 500 on database error', async () => {
        if (!app) {
            expect(app).toBeDefined();
            return;
        }
        await setup_1.prisma.$disconnect();
        const response = await (0, supertest_1.default)(app)
            .get('/api/uptime/id-recognition')
            .expect(500);
        expect(response.body).toHaveProperty('error');
        expect(response.body).toHaveProperty('message');
        await setup_1.prisma.$connect();
    });
    it('should respond within 200ms (performance requirement)', async () => {
        if (!app) {
            expect(app).toBeDefined();
            return;
        }
        const startTime = Date.now();
        await (0, supertest_1.default)(app).get('/api/uptime/id-recognition').expect(200);
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        expect(responseTime).toBeLessThan(200);
    });
    it('should handle empty status correctly in days array', async () => {
        if (!app) {
            expect(app).toBeDefined();
            return;
        }
        await setup_1.prisma.uptimeRecord.deleteMany();
        const today = new Date();
        for (let i = 0; i < 10; i += 2) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            await setup_1.prisma.uptimeRecord.create({
                data: {
                    service_id: 'id-recognition',
                    date,
                    status: 'o',
                    response_time: 150,
                },
            });
        }
        const response = await (0, supertest_1.default)(app)
            .get('/api/uptime/id-recognition')
            .expect(200);
        const currentMonth = response.body.months[0];
        const hasOperational = currentMonth.days.some((day) => day === 'o');
        const hasEmpty = currentMonth.days.some((day) => day === 'e');
        expect(hasOperational).toBe(true);
        expect(hasEmpty).toBe(true);
    });
});
//# sourceMappingURL=uptime.test.js.map
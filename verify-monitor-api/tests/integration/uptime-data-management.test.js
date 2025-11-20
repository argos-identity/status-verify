"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const setup_1 = require("../setup");
let app;
describe('Integration Test: Uptime Data Management Scenario (T023)', () => {
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
        const uptimeRecords = [];
        const now = new Date();
        for (let i = 0; i < 90; i++) {
            const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            let idRecStatus = 'operational';
            let idRecUptime = 100.0;
            if (i % 30 === 0) {
                idRecStatus = 'major_outage';
                idRecUptime = 20.0;
            }
            else if (i % 15 === 0) {
                idRecStatus = 'partial_outage';
                idRecUptime = 85.0;
            }
            else if (i % 7 === 0) {
                idRecUptime = 95.0;
            }
            uptimeRecords.push({
                id: `uptime-${i}-id-rec`,
                service_id: 'id-recognition',
                date: date,
                status: idRecStatus,
                uptime_percentage: idRecUptime,
                downtime_minutes: Math.round((100 - idRecUptime) * 14.4),
                incident_count: idRecStatus === 'operational' ? 0 : (idRecStatus === 'partial_outage' ? 1 : 3),
            });
            let faceStatus = 'operational';
            let faceUptime = 100.0;
            if (i % 45 === 0) {
                faceStatus = 'major_outage';
                faceUptime = 30.0;
            }
            else if (i % 20 === 0) {
                faceStatus = 'partial_outage';
                faceUptime = 90.0;
            }
            uptimeRecords.push({
                id: `uptime-${i}-face-live`,
                service_id: 'face-liveness',
                date: date,
                status: faceStatus,
                uptime_percentage: faceUptime,
                downtime_minutes: Math.round((100 - faceUptime) * 14.4),
                incident_count: faceStatus === 'operational' ? 0 : (faceStatus === 'partial_outage' ? 1 : 2),
            });
        }
        await setup_1.prisma.uptimeRecord.createMany({ data: uptimeRecords });
    });
    afterEach(async () => {
        await setup_1.prisma.uptimeRecord.deleteMany();
        await setup_1.prisma.service.deleteMany();
        await setup_1.prisma.user.deleteMany();
    });
    describe('Test Scenario 2: Uptime Data Management (FR-015, FR-017)', () => {
        it('should verify service-specific uptime tracking and visualization', async () => {
            const loginResponse = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'viewer',
                password: 'password123',
            });
            expect(loginResponse.status).toBe(200);
            const token = loginResponse.body.access_token;
            const uptimeResponse = await (0, supertest_1.default)(app)
                .get('/api/uptime/id-recognition')
                .query({ months: 3 })
                .set('Authorization', `Bearer ${token}`);
            expect(uptimeResponse.status).toBe(200);
            expect(uptimeResponse.body).toMatchObject({
                service: {
                    id: 'id-recognition',
                    name: 'ID Recognition',
                },
                time_range: {
                    months: 3,
                    start_date: expect.any(String),
                    end_date: expect.any(String),
                    total_days: expect.any(Number),
                },
                overall_metrics: {
                    average_uptime_percentage: expect.any(Number),
                    total_downtime_minutes: expect.any(Number),
                    total_incidents: expect.any(Number),
                },
                monthly_data: expect.arrayContaining([
                    expect.objectContaining({
                        month: expect.any(String),
                        uptime_percentage: expect.any(Number),
                        daily_status: expect.any(Array),
                        incident_count: expect.any(Number),
                        downtime_minutes: expect.any(Number),
                    }),
                ]),
                daily_breakdown: expect.any(Array),
            });
            expect(uptimeResponse.body.monthly_data).toHaveLength(3);
            expect(uptimeResponse.body.time_range.total_days).toBeGreaterThanOrEqual(88);
            expect(uptimeResponse.body.time_range.total_days).toBeLessThanOrEqual(93);
        });
        it('should verify uptime visualization data format', async () => {
            const loginResponse = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'viewer',
                password: 'password123',
            });
            expect(loginResponse.status).toBe(200);
            const token = loginResponse.body.access_token;
            const uptimeResponse = await (0, supertest_1.default)(app)
                .get('/api/uptime/id-recognition')
                .query({ months: 3 })
                .set('Authorization', `Bearer ${token}`);
            expect(uptimeResponse.status).toBe(200);
            uptimeResponse.body.monthly_data.forEach((month) => {
                expect(month).toMatchObject({
                    month: expect.stringMatching(/^\d{4}-\d{2}$/),
                    uptime_percentage: expect.any(Number),
                    daily_status: expect.any(Array),
                    incident_count: expect.any(Number),
                    downtime_minutes: expect.any(Number),
                    days_in_month: expect.any(Number),
                });
                expect(month.daily_status).toHaveLength(month.days_in_month);
                month.daily_status.forEach((day, index) => {
                    expect(day).toMatchObject({
                        day: index + 1,
                        status: expect.stringMatching(/^(o|po|mo|nd|e)$/),
                        status_full: expect.stringMatching(/^(operational|partial_outage|major_outage|no_data|empty)$/),
                        uptime_percentage: expect.any(Number),
                        date: expect.any(String),
                    });
                    switch (day.status_full) {
                        case 'operational':
                            expect(day.status).toBe('o');
                            break;
                        case 'partial_outage':
                            expect(day.status).toBe('po');
                            break;
                        case 'major_outage':
                            expect(day.status).toBe('mo');
                            break;
                        case 'no_data':
                            expect(day.status).toBe('nd');
                            break;
                        case 'empty':
                            expect(day.status).toBe('e');
                            break;
                    }
                    expect(day.uptime_percentage).toBeGreaterThanOrEqual(0);
                    expect(day.uptime_percentage).toBeLessThanOrEqual(100);
                });
                expect(month.uptime_percentage).toBeGreaterThanOrEqual(0);
                expect(month.uptime_percentage).toBeLessThanOrEqual(100);
            });
        });
        it('should test historical navigation through uptime data', async () => {
            const loginResponse = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'viewer',
                password: 'password123',
            });
            expect(loginResponse.status).toBe(200);
            const token = loginResponse.body.access_token;
            const oneMonthResponse = await (0, supertest_1.default)(app)
                .get('/api/uptime/id-recognition')
                .query({ months: 1 })
                .set('Authorization', `Bearer ${token}`);
            expect(oneMonthResponse.status).toBe(200);
            expect(oneMonthResponse.body.monthly_data).toHaveLength(1);
            const sixMonthResponse = await (0, supertest_1.default)(app)
                .get('/api/uptime/id-recognition')
                .query({ months: 6 })
                .set('Authorization', `Bearer ${token}`);
            expect(sixMonthResponse.status).toBe(200);
            expect(sixMonthResponse.body.monthly_data.length).toBeLessThanOrEqual(3);
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 60);
            const endDate = new Date();
            endDate.setDate(endDate.getDate() - 30);
            const rangeResponse = await (0, supertest_1.default)(app)
                .get('/api/uptime/id-recognition')
                .query({
                startDate: startDate.toISOString().split('T')[0],
                endDate: endDate.toISOString().split('T')[0],
            })
                .set('Authorization', `Bearer ${token}`);
            expect(rangeResponse.status).toBe(200);
            expect(rangeResponse.body.time_range.total_days).toBeGreaterThanOrEqual(28);
            expect(rangeResponse.body.time_range.total_days).toBeLessThanOrEqual(31);
        });
        it('should calculate monthly uptime percentages correctly', async () => {
            const loginResponse = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'viewer',
                password: 'password123',
            });
            expect(loginResponse.status).toBe(200);
            const token = loginResponse.body.access_token;
            const uptimeResponse = await (0, supertest_1.default)(app)
                .get('/api/uptime/id-recognition')
                .query({ months: 3 })
                .set('Authorization', `Bearer ${token}`);
            expect(uptimeResponse.status).toBe(200);
            uptimeResponse.body.monthly_data.forEach((month) => {
                const dailyUptimes = month.daily_status.map((day) => day.uptime_percentage);
                const calculatedAverage = dailyUptimes.reduce((sum, uptime) => sum + uptime, 0) / dailyUptimes.length;
                expect(Math.abs(month.uptime_percentage - calculatedAverage)).toBeLessThan(1.0);
                const majorOutageDays = month.daily_status.filter((day) => day.status === 'mo').length;
                const partialOutageDays = month.daily_status.filter((day) => day.status === 'po').length;
                const operationalDays = month.daily_status.filter((day) => day.status === 'o').length;
                expect(majorOutageDays + partialOutageDays + operationalDays).toBe(month.days_in_month);
            });
            const allDailyRecords = uptimeResponse.body.daily_breakdown;
            const overallAverage = allDailyRecords.reduce((sum, day) => sum + day.uptime_percentage, 0) / allDailyRecords.length;
            expect(Math.abs(uptimeResponse.body.overall_metrics.average_uptime_percentage - overallAverage)).toBeLessThan(1.0);
        });
        it('should verify frontend integration compatibility (verify-uptime app)', async () => {
            const loginResponse = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'viewer',
                password: 'password123',
            });
            expect(loginResponse.status).toBe(200);
            const token = loginResponse.body.access_token;
            const servicesResponse = await (0, supertest_1.default)(app)
                .get('/api/services')
                .set('Authorization', `Bearer ${token}`);
            expect(servicesResponse.status).toBe(200);
            expect(servicesResponse.body.services).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    id: 'id-recognition',
                    name: 'ID Recognition',
                }),
                expect.objectContaining({
                    id: 'face-liveness',
                    name: 'Face Liveness',
                }),
            ]));
            const uptimeResponse = await (0, supertest_1.default)(app)
                .get('/api/uptime/id-recognition')
                .query({ months: 3 })
                .set('Authorization', `Bearer ${token}`);
            expect(uptimeResponse.status).toBe(200);
            expect(uptimeResponse.body).toMatchObject({
                service: {
                    id: 'id-recognition',
                    name: 'ID Recognition',
                },
                monthly_data: expect.arrayContaining([
                    expect.objectContaining({
                        month: expect.any(String),
                        uptime_percentage: expect.any(Number),
                        daily_status: expect.arrayContaining([
                            expect.objectContaining({
                                day: expect.any(Number),
                                status: expect.stringMatching(/^(o|po|mo|nd|e)$/),
                                uptime_percentage: expect.any(Number),
                                date: expect.any(String),
                            }),
                        ]),
                    }),
                ]),
            });
            uptimeResponse.body.monthly_data.forEach((month) => {
                expect(month.daily_status.length).toBeGreaterThanOrEqual(28);
                expect(month.daily_status.length).toBeLessThanOrEqual(31);
                month.daily_status.forEach((day, index) => {
                    expect(day.day).toBe(index + 1);
                });
            });
        });
        it('should compare multiple services uptime patterns', async () => {
            const loginResponse = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'viewer',
                password: 'password123',
            });
            expect(loginResponse.status).toBe(200);
            const token = loginResponse.body.access_token;
            const idRecResponse = await (0, supertest_1.default)(app)
                .get('/api/uptime/id-recognition')
                .query({ months: 3 })
                .set('Authorization', `Bearer ${token}`);
            const faceLiveResponse = await (0, supertest_1.default)(app)
                .get('/api/uptime/face-liveness')
                .query({ months: 3 })
                .set('Authorization', `Bearer ${token}`);
            expect(idRecResponse.status).toBe(200);
            expect(faceLiveResponse.status).toBe(200);
            const idRecUptime = idRecResponse.body.overall_metrics.average_uptime_percentage;
            const faceLiveUptime = faceLiveResponse.body.overall_metrics.average_uptime_percentage;
            expect(faceLiveUptime).toBeGreaterThan(idRecUptime);
            const idRecIncidents = idRecResponse.body.overall_metrics.total_incidents;
            const faceLiveIncidents = faceLiveResponse.body.overall_metrics.total_incidents;
            expect(faceLiveIncidents).toBeLessThan(idRecIncidents);
            idRecResponse.body.monthly_data.forEach((month) => {
                const problemDays = month.daily_status.filter((day) => day.status !== 'o').length;
                expect(month.incident_count).toBeGreaterThanOrEqual(0);
            });
            faceLiveResponse.body.monthly_data.forEach((month) => {
                const operationalDays = month.daily_status.filter((day) => day.status === 'o').length;
                expect(operationalDays).toBeGreaterThan(month.days_in_month * 0.8);
            });
        });
        it('should handle edge cases and data gaps', async () => {
            const loginResponse = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'viewer',
                password: 'password123',
            });
            expect(loginResponse.status).toBe(200);
            const token = loginResponse.body.access_token;
            await setup_1.prisma.service.create({
                data: {
                    id: 'new-service',
                    name: 'New Service',
                    type: 'api',
                    url: 'https://api.company.com/new-service',
                    current_status: 'operational',
                },
            });
            const newServiceResponse = await (0, supertest_1.default)(app)
                .get('/api/uptime/new-service')
                .query({ months: 1 })
                .set('Authorization', `Bearer ${token}`);
            expect(newServiceResponse.status).toBe(200);
            expect(newServiceResponse.body).toMatchObject({
                service: {
                    id: 'new-service',
                    name: 'New Service',
                },
                overall_metrics: {
                    average_uptime_percentage: 0,
                    total_downtime_minutes: 0,
                    total_incidents: 0,
                },
                monthly_data: expect.arrayContaining([
                    expect.objectContaining({
                        uptime_percentage: 0,
                        daily_status: expect.arrayContaining([
                            expect.objectContaining({
                                status: 'nd',
                                status_full: 'no_data',
                            }),
                        ]),
                    }),
                ]),
            });
            const invalidResponse = await (0, supertest_1.default)(app)
                .get('/api/uptime/non-existent-service')
                .query({ months: 1 })
                .set('Authorization', `Bearer ${token}`);
            expect(invalidResponse.status).toBe(404);
            const invalidDateResponse = await (0, supertest_1.default)(app)
                .get('/api/uptime/id-recognition')
                .query({
                startDate: '2025-13-01',
                endDate: '2025-01-01',
            })
                .set('Authorization', `Bearer ${token}`);
            expect(invalidDateResponse.status).toBe(400);
        });
        it('should validate performance for large datasets', async () => {
            const loginResponse = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'viewer',
                password: 'password123',
            });
            expect(loginResponse.status).toBe(200);
            const token = loginResponse.body.access_token;
            const startTime = Date.now();
            const largeDataResponse = await (0, supertest_1.default)(app)
                .get('/api/uptime/id-recognition')
                .query({ months: 12 })
                .set('Authorization', `Bearer ${token}`);
            const responseTime = Date.now() - startTime;
            expect(largeDataResponse.status).toBe(200);
            expect(responseTime).toBeLessThan(200);
            expect(largeDataResponse.body.monthly_data.length).toBeLessThanOrEqual(3);
            expect(largeDataResponse.body.time_range.total_days).toBeLessThanOrEqual(90);
            console.log(`Uptime API response time for 12 months: ${responseTime}ms`);
        });
        it('should verify daily status indicators display properly', async () => {
            const loginResponse = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({
                username: 'viewer',
                password: 'password123',
            });
            expect(loginResponse.status).toBe(200);
            const token = loginResponse.body.access_token;
            const uptimeResponse = await (0, supertest_1.default)(app)
                .get('/api/uptime/id-recognition')
                .query({ months: 3 })
                .set('Authorization', `Bearer ${token}`);
            expect(uptimeResponse.status).toBe(200);
            const allStatuses = uptimeResponse.body.daily_breakdown.map((day) => day.status);
            const uniqueStatuses = [...new Set(allStatuses)];
            expect(uniqueStatuses).toContain('o');
            expect(uniqueStatuses).toContain('po');
            expect(uniqueStatuses).toContain('mo');
            const operationalDays = allStatuses.filter(s => s === 'o').length;
            const partialOutageDays = allStatuses.filter(s => s === 'po').length;
            const majorOutageDays = allStatuses.filter(s => s === 'mo').length;
            expect(operationalDays).toBeGreaterThan(partialOutageDays + majorOutageDays);
            expect(partialOutageDays + majorOutageDays).toBeGreaterThan(0);
            console.log(`Status distribution - Operational: ${operationalDays}, Partial: ${partialOutageDays}, Major: ${majorOutageDays}`);
        });
    });
});
//# sourceMappingURL=uptime-data-management.test.js.map
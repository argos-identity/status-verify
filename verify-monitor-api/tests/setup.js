"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
if (!global.__PRISMA__) {
    global.__PRISMA__ = new client_1.PrismaClient({
        datasources: {
            db: {
                url: process.env.DATABASE_URL?.replace('sla_monitor_dev', 'sla_monitor_test') ?? 'postgresql://postgres:postgres@localhost:5432/sla_monitor_test',
            },
        },
    });
}
exports.prisma = global.__PRISMA__;
beforeAll(async () => {
    await exports.prisma.$executeRaw `TRUNCATE TABLE "system_status", "watch_server_logs", "api_call_logs", "api_response_times", "incident_updates", "incidents", "uptime_records", "services", "users" RESTART IDENTITY CASCADE;`;
});
afterAll(async () => {
    await exports.prisma.$executeRaw `TRUNCATE TABLE "system_status", "watch_server_logs", "api_call_logs", "api_response_times", "incident_updates", "incidents", "uptime_records", "services", "users" RESTART IDENTITY CASCADE;`;
    await exports.prisma.$disconnect();
});
afterEach(async () => {
    await exports.prisma.$executeRaw `TRUNCATE TABLE "system_status", "watch_server_logs", "api_call_logs", "api_response_times", "incident_updates", "incidents", "uptime_records", "services", "users" RESTART IDENTITY CASCADE;`;
});
//# sourceMappingURL=setup.js.map
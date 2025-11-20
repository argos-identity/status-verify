"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const setup_1 = require("./setup");
exports.default = async () => {
    await setup_1.prisma.$executeRaw `TRUNCATE TABLE "system_status", "watch_server_logs", "api_call_logs", "api_response_times", "incident_updates", "incidents", "uptime_records", "services", "users" RESTART IDENTITY CASCADE;`;
    await setup_1.prisma.$disconnect();
};
//# sourceMappingURL=teardown.js.map
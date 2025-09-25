// Jest setup file for database testing
import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __PRISMA__: PrismaClient | undefined;
}

// Create a global Prisma instance for testing
if (!global.__PRISMA__) {
  global.__PRISMA__ = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL?.replace('sla_monitor_dev', 'sla_monitor_test') ?? 'postgresql://postgres:postgres@localhost:5432/sla_monitor_test',
      },
    },
  });
}

export const prisma = global.__PRISMA__;

// Setup and teardown for tests
beforeAll(async () => {
  // Cleanup any existing data
  await prisma.$executeRaw`TRUNCATE TABLE "system_status", "watch_server_logs", "api_call_logs", "api_response_times", "incident_updates", "incidents", "uptime_records", "services", "users" RESTART IDENTITY CASCADE;`;
});

afterAll(async () => {
  // Cleanup after all tests
  await prisma.$executeRaw`TRUNCATE TABLE "system_status", "watch_server_logs", "api_call_logs", "api_response_times", "incident_updates", "incidents", "uptime_records", "services", "users" RESTART IDENTITY CASCADE;`;
  await prisma.$disconnect();
});

// Cleanup between tests
afterEach(async () => {
  // Clean up data between tests
  await prisma.$executeRaw`TRUNCATE TABLE "system_status", "watch_server_logs", "api_call_logs", "api_response_times", "incident_updates", "incidents", "uptime_records", "services", "users" RESTART IDENTITY CASCADE;`;
});
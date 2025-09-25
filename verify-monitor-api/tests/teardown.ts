import { prisma } from './setup';

export default async (): Promise<void> => {
  // Final cleanup
  await prisma.$executeRaw`TRUNCATE TABLE "system_status", "watch_server_logs", "api_call_logs", "api_response_times", "incident_updates", "incidents", "uptime_records", "services", "users" RESTART IDENTITY CASCADE;`;
  await prisma.$disconnect();
};
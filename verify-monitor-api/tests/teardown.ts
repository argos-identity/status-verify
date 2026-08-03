import { prisma, truncateAllTables } from './setup';

export default async (): Promise<void> => {
  await truncateAllTables();
  await prisma.$disconnect();
};
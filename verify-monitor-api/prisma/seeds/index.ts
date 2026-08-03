import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('🌱 Starting database seed...');

  // Create default services
  const services = [
    {
      id: 'id-recognition',
      name: 'ID Recognition',
      description: 'Identity document recognition and verification service',
      endpoint_url: 'http://localhost:8001/health',
    },
    {
      id: 'face-liveness',
      name: 'Face Liveness',
      description: 'Face liveness detection service',
      endpoint_url: 'http://localhost:8002/health',
    },
    {
      id: 'id-liveness',
      name: 'ID Liveness',
      description: 'ID document liveness verification service',
      endpoint_url: 'http://localhost:8003/health',
    },
    {
      id: 'face-compare',
      name: 'Face Compare',
      description: 'Face comparison and matching service',
      endpoint_url: 'http://localhost:8004/health',
    },
    {
      id: 'curp-verifier',
      name: 'CURP Verifier',
      description: 'CURP (Mexican ID) verification service',
      endpoint_url: 'http://localhost:8005/health',
    },
  ];

  console.log('📦 Creating services...');
  for (const service of services) {
    await prisma.service.upsert({
      where: { id: service.id },
      update: service,
      create: service,
    });
  }

  // Create default users
  const defaultUsers = [
    {
      username: 'admin',
      email: 'admin@argosidentity.com',
      password: process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123',
      role: UserRole.admin,
    },
    {
      username: 'reporter',
      email: 'reporter@argosidentity.com', 
      password: process.env.DEFAULT_REPORTER_PASSWORD || 'Reporter@123',
      role: UserRole.reporter,
    },
    {
      username: 'viewer',
      email: 'viewer@argosidentity.com',
      password: process.env.DEFAULT_VIEWER_PASSWORD || 'Viewer@123',
      role: UserRole.viewer,
    },
  ];

  console.log('👥 Creating users...');
  for (const user of defaultUsers) {
    const passwordHash = await bcrypt.hash(user.password, 12);
    await prisma.user.upsert({
      where: { username: user.username },
      update: {
        email: user.email,
        password_hash: passwordHash,
        role: user.role,
      },
      create: {
        username: user.username,
        email: user.email,
        password_hash: passwordHash,
        role: user.role,
      },
    });
  }

  console.log('✅ Database seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
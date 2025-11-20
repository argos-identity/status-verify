import { PrismaClient, UserRole, IncidentStatus, IncidentSeverity, IncidentPriority, UptimeStatus } from '@prisma/client';
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
      password: 'admin123',
      role: UserRole.admin,
    },
    {
      username: 'reporter',
      email: 'reporter@argosidentity.com', 
      password: 'reporter123',
      role: UserRole.reporter,
    },
    {
      username: 'viewer',
      email: 'viewer@argosidentity.com',
      password: 'viewer123',
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

  // Create sample uptime records for the last 30 days
  console.log('📊 Creating sample uptime records...');
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const statusOptions: UptimeStatus[] = ['o', 'o', 'o', 'o', 'po', 'o']; // Mostly operational

  for (const service of services) {
    for (let i = 0; i < 30; i++) {
      const date = new Date(thirtyDaysAgo);
      date.setDate(date.getDate() + i);

      const randomStatus = statusOptions[Math.floor(Math.random() * statusOptions.length)] ?? 'o';
      const responseTime = randomStatus === 'o' ? 
        Math.floor(Math.random() * 500) + 100 : // 100-600ms for operational
        Math.floor(Math.random() * 3000) + 1000; // 1-4s for issues

      await prisma.uptimeRecord.upsert({
        where: {
          service_id_date: {
            service_id: service.id,
            date,
          },
        },
        update: {
          status: randomStatus,
          response_time: responseTime,
        },
        create: {
          service_id: service.id,
          date,
          status: randomStatus,
          response_time: responseTime,
        },
      });
    }
  }

  // Create initial system status for production
  console.log('🌟 Creating initial system status...');
  await prisma.systemStatus.create({
    data: {
      overall_status: 'operational',
      message: '시스템이 정상 운영 중입니다. 실시간 모니터링이 활성화되었습니다.',
    },
  });

  // NOTE: No sample incidents are created in production mode
  // Real incidents will be created automatically when monitoring detects issues

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
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create admin user
  const adminEmail = 'admin@argosidentity.com';
  const adminPassword = 'admin123';

  console.log(`📧 Creating admin user: ${adminEmail}`);

  // Check if admin user already exists
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existingAdmin) {
    console.log('✅ Admin user already exists, updating password...');

    // Update existing admin user with new password hash
    const passwordHash = await bcrypt.hash(adminPassword, 12);

    await prisma.user.update({
      where: { email: adminEmail },
      data: {
        password_hash: passwordHash,
        is_active: true,
        role: 'admin',
      },
    });

    console.log('✅ Admin user password updated');
  } else {
    // Create new admin user
    const passwordHash = await bcrypt.hash(adminPassword, 12);

    const adminUser = await prisma.user.create({
      data: {
        username: 'admin',
        email: adminEmail,
        password_hash: passwordHash,
        role: 'admin' as UserRole,
        is_active: true,
      },
    });

    console.log(`✅ Admin user created with ID: ${adminUser.id}`);
  }

  // Create some demo services if they don't exist
  console.log('🔧 Creating demo services...');

  const services = [
    {
      id: 'id-recognition',
      name: 'ID Recognition',
      description: 'Identity document recognition and validation service',
      endpoint_url: 'http://localhost:3001/health/id-recognition',
    },
    {
      id: 'face-liveness',
      name: 'Face Liveness',
      description: 'Face liveness detection and anti-spoofing service',
      endpoint_url: 'http://localhost:3001/health/face-liveness',
    },
    {
      id: 'id-liveness',
      name: 'ID Liveness',
      description: 'ID document liveness verification service',
      endpoint_url: 'http://localhost:3001/health/id-liveness',
    },
    {
      id: 'face-compare',
      name: 'Face Compare',
      description: 'Face comparison and matching service',
      endpoint_url: 'http://localhost:3001/health/face-compare',
    },
    {
      id: 'curp-verifier',
      name: 'CURP Verifier',
      description: 'CURP (Mexican national ID) verification service',
      endpoint_url: 'http://localhost:3001/health/curp-verifier',
    },
  ];

  for (const service of services) {
    const existingService = await prisma.service.findUnique({
      where: { id: service.id },
    });

    if (!existingService) {
      await prisma.service.create({
        data: service,
      });
      console.log(`✅ Service created: ${service.name}`);
    } else {
      console.log(`⚪ Service already exists: ${service.name}`);
    }
  }

  // Create a sample system status entry
  console.log('📊 Creating initial system status...');

  const existingStatus = await prisma.systemStatus.findFirst();
  if (!existingStatus) {
    await prisma.systemStatus.create({
      data: {
        overall_status: 'operational',
        message: 'All systems operational',
      },
    });
    console.log('✅ Initial system status created');
  }

  console.log('🎉 Database seeding completed successfully!');
  console.log('');
  console.log('🔑 Admin login credentials:');
  console.log(`   Email: ${adminEmail}`);
  console.log(`   Password: ${adminPassword}`);
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
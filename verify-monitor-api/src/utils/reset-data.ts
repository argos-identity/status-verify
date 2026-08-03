import { PrismaClient } from '@prisma/client';
import * as readline from 'readline';

const prisma = new PrismaClient();

interface ResetOptions {
  skipConfirmation?: boolean;
  reseedServices?: boolean;
  preserveUsers?: boolean;
}

async function confirmReset(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      '⚠️  WARNING: This will delete all data except users. Are you sure? (type "yes" to confirm): ',
      (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'yes');
      }
    );
  });
}

async function resetDatabaseData(options: ResetOptions = {}): Promise<void> {
  const {
    skipConfirmation = false,
    reseedServices = true,
    preserveUsers = true,
  } = options;

  // Safety check for production
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_PRODUCTION_RESET) {
    throw new Error('❌ Data reset is disabled in production environment. Set ALLOW_PRODUCTION_RESET=true to override.');
  }

  // Confirmation check
  if (!skipConfirmation) {
    const confirmed = await confirmReset();
    if (!confirmed) {
      console.log('❌ Reset cancelled.');
      return;
    }
  }

  console.log('🗂️  Starting database data reset...');

  try {
    // Use transaction for data consistency
    await prisma.$transaction(async (tx) => {
      console.log('🗑️  Deleting data in correct order to maintain referential integrity...');

      // Delete in order to respect foreign key constraints

      // 1. Delete incident updates first (references incidents and users)
      const incidentUpdatesCount = await tx.incidentUpdate.deleteMany({});
      console.log(`✅ Deleted ${incidentUpdatesCount.count} incident updates`);

      // 2. Delete incidents
      const incidentsCount = await tx.incident.deleteMany({});
      console.log(`✅ Deleted ${incidentsCount.count} incidents`);

      // 3. Delete services last (other tables reference this)
      const servicesCount = await tx.service.deleteMany({});
      console.log(`✅ Deleted ${servicesCount.count} services`);

      // Note: Users table is preserved if preserveUsers is true
      if (!preserveUsers) {
        const usersCount = await tx.user.deleteMany({});
        console.log(`✅ Deleted ${usersCount.count} users`);
      } else {
        console.log('👥 Users table preserved');
      }
    });

    console.log('📦 Data deletion completed successfully');

    // Re-seed essential data if requested
    if (reseedServices) {
      await reseedEssentialData();
    }

    console.log('✅ Database data reset completed successfully!');

  } catch (error) {
    console.error('❌ Reset failed:', error);
    throw error;
  }
}

async function reseedEssentialData(): Promise<void> {
  console.log('🌱 Re-seeding essential data...');

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

  console.log('📦 Creating default services...');
  for (const service of services) {
    await prisma.service.create({
      data: service,
    });
  }

  console.log('✅ Essential data re-seeded successfully');
}

// CLI execution
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const skipConfirmation = args.includes('--skip-confirmation');
  const noReseed = args.includes('--no-reseed');
  const includeUsers = args.includes('--include-users');

  try {
    await resetDatabaseData({
      skipConfirmation,
      reseedServices: !noReseed,
      preserveUsers: !includeUsers,
    });
  } catch (error) {
    console.error('❌ Reset script failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Export for programmatic use
export { resetDatabaseData, reseedEssentialData };

// Run if called directly
if (require.main === module) {
  main();
}
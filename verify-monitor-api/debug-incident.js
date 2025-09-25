const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function debugIncident() {
  try {
    console.log('🔍 Checking database connection...');
    await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✅ Database connection successful\n');

    console.log('📊 Checking all incidents in database...');
    const allIncidents = await prisma.incident.findMany({
      orderBy: { created_at: 'desc' }
    });
    console.log(`Found ${allIncidents.length} incidents total:`);
    allIncidents.forEach(incident => {
      console.log(`  - ${incident.id}: ${incident.title} (${incident.status})`);
    });

    console.log('\n📊 Checking for specific incident inc-2025-001...');
    const specificIncident = await prisma.incident.findUnique({
      where: { id: 'inc-2025-001' }
    });

    if (specificIncident) {
      console.log('✅ Found incident inc-2025-001:', {
        id: specificIncident.id,
        title: specificIncident.title,
        status: specificIncident.status,
        severity: specificIncident.severity,
        created_at: specificIncident.created_at
      });
    } else {
      console.log('❌ Incident inc-2025-001 not found');
    }

    console.log('\n📊 Testing resolved incidents filter...');
    const resolvedIncidents = await prisma.incident.findMany({
      where: { status: 'resolved' },
      orderBy: { created_at: 'desc' }
    });
    console.log(`Found ${resolvedIncidents.length} resolved incidents:`);
    resolvedIncidents.forEach(incident => {
      console.log(`  - ${incident.id}: ${incident.title}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugIncident();
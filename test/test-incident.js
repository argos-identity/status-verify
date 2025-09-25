const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createTestIncident() {
  try {
    console.log('Creating test incident...');

    // Create a resolved incident
    const incident = await prisma.incident.create({
      data: {
        id: 'inc-2025-001',
        title: 'Face Liveness API 일시적 응답 지연',
        description: 'Face Liveness API에서 간헐적으로 응답 시간이 5초 이상 지연되는 현상이 발생했습니다. 서버 로드 밸런싱을 조정하여 문제를 해결했습니다.',
        status: 'resolved',
        severity: 'medium',
        priority: 'P2',
        reporter: 'system',
        affected_services: ['face-liveness'],
        created_at: new Date('2025-09-15T08:30:00Z'),
        resolved_at: new Date('2025-09-15T10:45:00Z'),
      }
    });

    // Create an incident update
    const update = await prisma.incidentUpdate.create({
      data: {
        incident_id: incident.id,
        status: 'resolved',
        description: '로드 밸런싱 설정을 조정하여 API 응답 시간이 정상화되었습니다. 모든 서비스가 정상 작동 중입니다.',
        created_at: new Date('2025-09-15T10:45:00Z'),
      }
    });

    console.log('✅ Test incident created successfully:', incident.id);
    console.log('✅ Incident update created successfully:', update.id);

    // Test the API endpoint
    console.log('\n🔍 Testing API endpoint...');
    const fetch = require('node-fetch');
    const response = await fetch('http://localhost:3001/api/incidents/past');
    const data = await response.json();

    console.log('📊 API Response:', JSON.stringify(data, null, 2));

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestIncident();
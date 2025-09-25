const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function createTestUser() {
  try {
    console.log('Creating test user...');

    // Hash password
    const hashedPassword = await bcrypt.hash('Password123', 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        id: 'test-user-123',
        username: 'testreporter',
        email: 'test@example.com',
        password_hash: hashedPassword,
        role: 'reporter',
        is_active: true
      }
    });

    console.log('✅ Test user created:', user.id, user.email, user.role);

    // Verify user exists
    const foundUser = await prisma.user.findUnique({
      where: { id: user.id }
    });

    console.log('✅ User verified:', foundUser ? 'exists' : 'not found');

  } catch (error) {
    if (error.code === 'P2002') {
      console.log('ℹ️ User already exists');
    } else {
      console.error('❌ Error:', error);
    }
  } finally {
    await prisma.$disconnect();
  }
}

createTestUser();
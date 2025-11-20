const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');

// Generate a test JWT token (same secret as in development)
const JWT_SECRET = 'your-super-secret-jwt-key-here-make-it-long-and-random';

const testToken = jwt.sign(
  {
    userId: 'test-user-123',
    email: 'test@example.com',
    role: 'reporter',
    permissions: ['report_incidents', 'comment_incidents', 'read_incidents']
  },
  JWT_SECRET,
  { expiresIn: '1h' }
);

console.log('🔑 Generated test token:', testToken.substring(0, 50) + '...');

async function testIncidentCreation() {
  try {
    console.log('\n🧪 Testing incident creation with fixed validation...');

    // Test with valid data
    const validIncident = {
      title: 'Test Validation Fix',
      description: 'Testing the fixed validation and RBAC permissions',
      severity: 'medium',
      affected_services: ['id-recognition']
    };

    console.log('📤 Sending request with valid data:', JSON.stringify(validIncident, null, 2));

    const response = await fetch('http://localhost:3001/api/incidents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testToken}`
      },
      body: JSON.stringify(validIncident)
    });

    const result = await response.json();

    console.log('📤 Response Status:', response.status);
    console.log('📊 Response Body:', JSON.stringify(result, null, 2));

    if (response.status === 201) {
      console.log('✅ SUCCESS: Incident creation worked! Validation and RBAC are fixed.');
    } else if (response.status === 403) {
      console.log('❌ RBAC ISSUE: Still getting 403 Forbidden');
    } else if (response.status === 400) {
      console.log('❌ VALIDATION ISSUE: Validation is still failing');
    } else {
      console.log('❓ UNEXPECTED: Got status', response.status);
    }

    // Test with invalid data to confirm validation works
    console.log('\n🧪 Testing with invalid data...');
    const invalidIncident = {
      title: '', // Invalid: empty title
      severity: 'invalid', // Invalid: wrong severity
      affected_services: [] // Invalid: empty array
    };

    const invalidResponse = await fetch('http://localhost:3001/api/incidents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testToken}`
      },
      body: JSON.stringify(invalidIncident)
    });

    const invalidResult = await invalidResponse.json();

    console.log('📤 Invalid Data Response Status:', invalidResponse.status);
    console.log('📊 Invalid Data Response Body:', JSON.stringify(invalidResult, null, 2));

    if (invalidResponse.status === 400) {
      console.log('✅ SUCCESS: Validation correctly rejected invalid data');
    } else {
      console.log('❌ VALIDATION ISSUE: Should have rejected invalid data');
    }

  } catch (error) {
    console.error('❌ Test Error:', error.message);
  }
}

testIncidentCreation();
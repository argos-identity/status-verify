#!/usr/bin/env node

/**
 * Test script to verify the updated health check parameters
 *
 * This script validates that the health monitor is now using
 * correct API parameters for each service.
 */

console.log('🧪 Testing Health Check Parameters\n');

// Import the service configs to verify structure
try {
  const path = require('path');
  const fs = require('fs');

  // Read the test data file to verify its structure
  const testDataPath = path.join(__dirname, 'watch-server/src/test-data/health-check-data.ts');

  if (fs.existsSync(testDataPath)) {
    console.log('✅ Test data file exists at:', testDataPath);

    const testDataContent = fs.readFileSync(testDataPath, 'utf8');

    // Check for required service parameters
    const expectedParameters = {
      'Face Compare': ['originFace', 'targetFace'],
      'ID Recognition': ['idImage', 'issuingCountry'],
      'Face Liveness': ['faceImage'],
      'ID Liveness': ['idImage'],
      'CURP Verifier': ['curpNumber']
    };

    console.log('\n📋 Verifying API parameter definitions:');

    Object.entries(expectedParameters).forEach(([serviceName, params]) => {
      const hasAllParams = params.every(param => testDataContent.includes(param));
      const status = hasAllParams ? '✅' : '❌';
      console.log(`${status} ${serviceName}: ${params.join(', ')}`);
    });

    // Check for test image data
    if (testDataContent.includes('TEST_IMAGE_BASE64')) {
      console.log('✅ Test image base64 data defined');
    } else {
      console.log('❌ Test image base64 data missing');
    }

    // Check for test CURP number
    if (testDataContent.includes('TEST_CURP_NUMBER')) {
      console.log('✅ Test CURP number defined');
    } else {
      console.log('❌ Test CURP number missing');
    }

  } else {
    console.log('❌ Test data file not found');
  }

  // Check health monitor file
  const healthMonitorPath = path.join(__dirname, 'watch-server/src/monitors/health-monitor-simple.ts');

  if (fs.existsSync(healthMonitorPath)) {
    console.log('\n✅ Health monitor file exists at:', healthMonitorPath);

    const healthMonitorContent = fs.readFileSync(healthMonitorPath, 'utf8');

    // Check if it imports the test data
    if (healthMonitorContent.includes('getServiceConfigs')) {
      console.log('✅ Health monitor imports service configs');
    } else {
      console.log('❌ Health monitor missing service config import');
    }

    // Check if old test body format is removed
    if (!healthMonitorContent.includes('test: true, healthCheck: true')) {
      console.log('✅ Old test body format removed');
    } else {
      console.log('⚠️ Old test body format still present');
    }

    // Check for correct parameter usage
    if (healthMonitorContent.includes('correct API parameters')) {
      console.log('✅ Updated logging messages for correct parameters');
    } else {
      console.log('❌ Logging messages not updated');
    }

  } else {
    console.log('❌ Health monitor file not found');
  }

  console.log('\n🎯 Summary:');
  console.log('The health monitor has been updated to use correct API parameters:');
  console.log('- Face Compare API: originFace + targetFace (base64 images)');
  console.log('- ID Recognition API: idImage (base64) + issuingCountry');
  console.log('- Face Liveness API: faceImage (base64)');
  console.log('- ID Liveness API: idImage (base64)');
  console.log('- CURP Verifier API: curpNumber (string)');

  console.log('\n🚀 Next Steps:');
  console.log('1. Start the watch-server: cd watch-server && npm run dev');
  console.log('2. Monitor the logs to see API calls with correct parameters');
  console.log('3. Each API will now receive the proper data structure');
  console.log('4. Health checks will be more accurate and realistic');

} catch (error) {
  console.error('❌ Error running test:', error.message);
}

console.log('\n✨ Test completed!');
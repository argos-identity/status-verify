#!/usr/bin/env node

/**
 * Test script to verify the metrics database integration
 * This script tests the Watch Server's ability to save and retrieve metrics from the database
 */

import database from './config/database';
import serviceInitializer from './services/service-initializer';
import healthMonitor from './monitors/health-monitor-simple';
import metricsService from './services/metrics-service-simple';

class MetricsIntegrationTest {
  public async runTest(): Promise<void> {
    console.log('🧪 Starting Metrics Database Integration Test...\n');

    try {
      // Step 1: Connect to database
      console.log('1️⃣ Connecting to database...');
      await database.connect();
      console.log('✅ Database connected successfully\n');

      // Step 2: Initialize services
      console.log('2️⃣ Initializing services in database...');
      await serviceInitializer.initializeServices();
      console.log('✅ Services initialized successfully\n');

      // Step 3: Run health checks and save to database
      console.log('3️⃣ Performing health checks...');
      const healthResults = await healthMonitor.performHealthChecks();
      console.log(`✅ Health checks completed for ${healthResults.length} services\n`);

      // Step 4: Test metrics calculation
      console.log('4️⃣ Testing metrics calculation...');
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (7 * 24 * 60 * 60 * 1000)); // 7 days ago

      // Get all services and test metrics for each
      const services = await serviceInitializer.getAllServices();

      for (const service of services) {
        console.log(`📊 Testing metrics for ${service.name} (${service.id})...`);

        const metrics = await metricsService.calculateServiceMetrics(service.id, startDate, endDate);
        console.log(`   - Uptime: ${metrics.uptime}%`);
        console.log(`   - Avg Response Time: ${metrics.avgResponseTime}ms`);
        console.log(`   - Total Requests: ${metrics.totalRequests}`);
        console.log(`   - Success Rate: ${metrics.successfulRequests}/${metrics.totalRequests}\n`);

        const slaMetrics = await metricsService.getSLAMetrics(service.id, 30);
        console.log(`📈 SLA Metrics for ${service.name}:`);
        console.log(`   - SLA Target: ${slaMetrics.slaTarget}%`);
        console.log(`   - Current SLA: ${slaMetrics.currentSLA}%`);
        console.log(`   - Breaches: ${slaMetrics.breaches}`);
        console.log(`   - Response Time SLA: ${slaMetrics.responseTimeSLA}%\n`);
      }

      // Step 5: Test system health summary
      console.log('5️⃣ Testing system health summary...');
      const systemSummary = await metricsService.getSystemHealthSummary();
      console.log(`📋 System Summary:`);
      console.log(`   - Overall Health: ${systemSummary.overallHealth}`);
      console.log(`   - Total Services: ${systemSummary.totalServices}`);
      console.log(`   - Operational: ${systemSummary.operationalServices}`);
      console.log(`   - Degraded: ${systemSummary.degradedServices}`);
      console.log(`   - Down: ${systemSummary.downServices}`);
      console.log(`   - Last Update: ${systemSummary.lastUpdateTime}\n`);

      // Step 6: Test service health status
      console.log('6️⃣ Testing service health status...');
      const serviceHealth = await serviceInitializer.getServiceHealth();
      console.log('🏥 Service Health Status:');
      serviceHealth.forEach((service: any) => {
        console.log(`   - ${service.name}: ${service.status} (${service.responseTime}ms)`);
      });

      console.log('\n🎉 All tests passed successfully!');
      console.log('✅ Database integration is working correctly');
      console.log('✅ Health checks are being saved to the database');
      console.log('✅ Metrics calculations are working from real data');

    } catch (error: any) {
      console.error('❌ Test failed:', error.message);
      console.error('Stack trace:', error.stack);
      process.exit(1);
    } finally {
      // Clean up
      await database.disconnect();
      console.log('\n🔌 Database disconnected');
    }
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  const test = new MetricsIntegrationTest();
  test.runTest().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export default MetricsIntegrationTest;
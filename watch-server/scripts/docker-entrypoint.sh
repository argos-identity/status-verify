#!/bin/sh

# Docker entrypoint script for watch-server

set -e

echo "🔍 Starting SLA Monitor Watch Server..."

# Wait for database to be ready
echo "⏳ Waiting for database connection..."
until node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.\$connect()
  .then(() => {
    console.log('✅ Database connected');
    process.exit(0);
  })
  .catch(() => {
    console.log('❌ Database not ready');
    process.exit(1);
  });
" > /dev/null 2>&1; do
  echo "⏳ Database not ready, retrying in 5 seconds..."
  sleep 5
done

# Wait for API server to be ready (optional; capped so a persistent failure
# cannot exhaust the API rate limiter, then boot regardless).
echo "⏳ Waiting for API server connection..."
API_URL="http://${API_HOST:-verify-monitor-api}:${API_PORT:-3003}/health"
API_WAIT_MAX_ATTEMPTS=${API_WAIT_MAX_ATTEMPTS:-30}
API_WAIT_INTERVAL=${API_WAIT_INTERVAL:-10}
attempt=1
while ! curl -fsS -o /dev/null "$API_URL" 2>/dev/null; do
  if [ "$attempt" -ge "$API_WAIT_MAX_ATTEMPTS" ]; then
    echo "⚠️ API server not ready after ${API_WAIT_MAX_ATTEMPTS} attempts — starting anyway."
    break
  fi
  echo "⏳ API server not ready (attempt ${attempt}/${API_WAIT_MAX_ATTEMPTS}), retrying in ${API_WAIT_INTERVAL}s..."
  attempt=$((attempt + 1))
  sleep "$API_WAIT_INTERVAL"
done

# Initialize services in database (if needed)
echo "🔄 Initializing services..."
node -e "
const serviceInit = require('./dist/services/service-initializer').default;
serviceInit.initializeServices()
  .then(() => {
    console.log('✅ Services initialized');
    process.exit(0);
  })
  .catch((error) => {
    console.log('❌ Service initialization failed:', error.message);
    process.exit(1);
  });
" || echo "⚠️ Service initialization skipped (may already be initialized)"

echo "🎯 Starting watch server..."

# Set default environment variables if not provided
export WATCH_MODE=${WATCH_MODE:-continuous}
export MONITORING_INTERVAL=${MONITORING_INTERVAL:-60000}
export WATCH_SERVER_PORT=${PORT:-3008}

echo "📋 Configuration:"
echo "  • Mode: $WATCH_MODE"
echo "  • Monitoring Interval: ${MONITORING_INTERVAL}ms"
echo "  • Port: $WATCH_SERVER_PORT"
echo "  • Database: ${DATABASE_URL:-"using default"}"

# Start the application based on mode
case "$WATCH_MODE" in
  "once")
    echo "🔄 Running single health check..."
    node -e "
    const healthMonitor = require('./dist/monitors/health-monitor-simple').default;
    const metricsService = require('./dist/services/metrics-service-simple').default;

    (async () => {
      try {
        console.log('Performing health checks...');
        const results = await healthMonitor.performHealthChecks();
        const session = await metricsService.createMonitoringSession(results);
        console.log('Health check completed. Session ID:', session.sessionId);
        process.exit(0);
      } catch (error) {
        console.error('Health check failed:', error);
        process.exit(1);
      }
    })();
    "
    ;;
  "continuous"|*)
    echo "🚀 Starting continuous monitoring server..."
    exec node dist/index.js
    ;;
esac
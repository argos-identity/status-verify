#!/bin/sh

# Docker entrypoint script for verify-monitor-api

set -e

echo "🚀 Starting verify-monitor-api..."

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
  echo "⏳ Database not ready, retrying in 2 seconds..."
  sleep 2
done

# Run database migrations
echo "🔄 Running database migrations..."
npx prisma migrate deploy

# Generate Prisma client if needed
echo "🔧 Generating Prisma client..."
npx prisma generate

# Seed database if SEED_DATABASE environment variable is set
if [ "$SEED_DATABASE" = "true" ]; then
  echo "🌱 Seeding database..."
  npm run db:seed
fi

echo "🎯 Starting server..."

# Start the application
exec node dist/server.js
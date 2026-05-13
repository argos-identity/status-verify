#!/bin/sh

# Docker entrypoint script for verify-monitor-api

set -e

echo "🚀 Starting verify-monitor-api..."

# Wait for database to be ready
echo "⏳ Waiting for database connection..."
DB_HOST=$(echo "$DATABASE_URL" | sed -E 's|.*@([^:/]+):([0-9]+).*|\1|')
DB_PORT=$(echo "$DATABASE_URL" | sed -E 's|.*@([^:/]+):([0-9]+).*|\2|')
until nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; do
  echo "⏳ Database not ready, retrying in 2 seconds..."
  sleep 2
done
echo "✅ Database connected"

# Run database migrations
echo "🔄 Running database migrations..."
npx prisma migrate deploy

# Seed database if SEED_DATABASE environment variable is set
if [ "$SEED_DATABASE" = "true" ]; then
  echo "🌱 Seeding database..."
  node dist/seeds/index.js
fi

echo "🎯 Starting server..."

# Start the application
exec node dist/server.js
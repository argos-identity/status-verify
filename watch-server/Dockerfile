# watch-server Dockerfile - Monitoring Service with Scheduled Health Checks
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat curl
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Build stage
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript application
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

# Install curl for health checks
RUN apk add --no-cache curl

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 watchuser

# Install runtime dependencies including Prisma
COPY --from=builder /app/package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built application
COPY --from=builder --chown=watchuser:nodejs /app/dist ./dist
COPY --from=builder --chown=watchuser:nodejs /app/prisma ./prisma
COPY --from=builder --chown=watchuser:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=watchuser:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# Create logs directory
RUN mkdir -p /app/logs && chown -R watchuser:nodejs /app/logs

# Copy and setup entrypoint script
COPY --chown=watchuser:nodejs scripts/docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER watchuser

EXPOSE 3008

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3008/health || exit 1

CMD ["./docker-entrypoint.sh"]
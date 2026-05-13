# verify-monitor-api Dockerfile - Express.js Backend API with TypeScript
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat netcat-openbsd openssl

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci

# Build stage
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript application
RUN npm run build

RUN npx tsc prisma/seeds/index.ts --outDir dist/seeds --module commonjs --target ES2022 --esModuleInterop --skipLibCheck --resolveJsonModule 2>/dev/null || true

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 apiuser

# Install runtime dependencies
COPY --from=builder /app/package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY --from=builder --chown=apiuser:nodejs /app/dist ./dist
COPY --from=builder --chown=apiuser:nodejs /app/prisma ./prisma
COPY --from=builder --chown=apiuser:nodejs /app/dist/seeds ./dist/seeds
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/node_modules/@prisma/engines ./node_modules/@prisma/engines

RUN chown -R apiuser:nodejs /app/node_modules/.prisma \
    && chown -R apiuser:nodejs /app/node_modules/@prisma

COPY --chown=apiuser:nodejs scripts/docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER apiuser

EXPOSE 3003

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3003/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

CMD ["./docker-entrypoint.sh"]
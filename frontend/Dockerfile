# frontend/Dockerfile
# AI Hospital Command Center — Frontend Dockerfile
# ================================================
# Multi-stage build for Next.js application
#
# Build:
#   docker build -t hospital-frontend:latest .
#
# Run:
#   docker run -p 3000:3000 hospital-frontend:latest

# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build Next.js application
RUN npm run build


# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

LABEL maintainer="AI Hospital Command Center Team"
LABEL description="Next.js frontend for AI Hospital Command Center"

WORKDIR /app

# Create app user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Copy built application from builder
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Switch to non-root user
USER nextjs

# ── Environment ───────────────────────────────────────────────────────────────
ENV NODE_ENV=production
ENV NEXT_PUBLIC_API_URL=http://localhost:8000

# ── Ports ──────────────────────────────────────────────────────────────────
EXPOSE 3000

# ── Health check ───────────────────────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1

# ── Default command ───────────────────────────────────────────────────────
CMD ["npm", "start"]

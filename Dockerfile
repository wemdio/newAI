# Stage 1: Build
FROM node:22-slim AS builder

WORKDIR /app/backend

# Copy package files and install dependencies
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Copy source code
COPY backend/ ./

# Stage 2: Run
FROM node:22-slim

WORKDIR /app

# Create non-root user
RUN groupadd --gid 2000 app && useradd --uid 2000 --gid 2000 -m -s /bin/bash app

# Copy from builder
COPY --from=builder /app/backend ./

# Set ownership
RUN chown -R app:app /app

# Switch to non-root user
USER app

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production

# Start application
CMD ["node", "src/index.js"]

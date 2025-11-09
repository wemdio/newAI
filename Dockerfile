# Stage 1: Build the application
FROM node:22-slim AS builder

WORKDIR /app

# Copy backend package.json and install dependencies
COPY backend/package.json backend/package-lock.json* ./
RUN npm install --omit=dev

# Copy the rest of the backend source code
COPY backend/ ./

# Stage 2: Run the application
FROM node:22-slim

WORKDIR /app

# Create a non-root user
RUN groupadd --gid 2000 app && useradd --uid 2000 --gid 2000 -m -s /bin/bash app

# Copy runtime dependencies from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy the rest of the backend application code
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./package.json

# Set proper ownership
RUN chown -R app:app /app

# Expose the port the app runs on (must match PORT env variable)
EXPOSE 3000

# Switch to the non-root user
USER app

# Set environment for Node.js
ENV NODE_ENV=production

# Command to run the application
CMD ["node", "src/index.js"]

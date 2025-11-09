# Backend Dockerfile for Timeweb Cloud
FROM node:22-slim

# Install PM2 globally
RUN npm install -g pm2

# Create app directory
WORKDIR /app

# Copy backend package files
COPY backend/package*.json ./

# Install dependencies
RUN npm install --production

# Copy backend source code
COPY backend/ ./

# Expose port
EXPOSE 8000

# Start with PM2
CMD ["pm2-runtime", "start", "src/index.js", "--name", "telegram-scanner"]


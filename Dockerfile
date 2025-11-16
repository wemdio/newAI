# Backend Dockerfile for Node.js API
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY backend/package.json backend/package-lock.json* ./

# Install dependencies
RUN npm install --production

# Copy backend source code
COPY backend/ ./

# Expose API port
EXPOSE 3000

# Set production environment
ENV NODE_ENV=production

# Start the server
CMD ["npm", "start"]

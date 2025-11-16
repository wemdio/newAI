# Backend Node.js Service
FROM node:20-alpine

WORKDIR /app

# Copy backend files
COPY backend/package*.json ./
RUN npm install --production

COPY backend/ ./

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "src/index.js"]

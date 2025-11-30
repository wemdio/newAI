# Use official Node.js LTS image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node dependencies
RUN npm install --production

# Copy all source code
COPY . ./

# Create sessions directory with proper permissions
RUN mkdir -p /tmp/sessions && chmod 777 /tmp/sessions

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production

# Start the application
CMD ["node", "src/index.js"]

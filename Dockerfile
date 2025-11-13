# Use official Node.js LTS image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install Python and required packages for tdata conversion
RUN apk add --no-cache \
    python3 \
    py3-pip \
    py3-cryptography \
    gcc \
    musl-dev \
    python3-dev \
    libffi-dev \
    openssl-dev \
    && ln -sf python3 /usr/bin/python

# Copy Python requirements
COPY backend/python-service/requirements.txt ./python-service/

# Install Python dependencies
RUN pip3 install --no-cache-dir --break-system-packages -r python-service/requirements.txt

# Copy backend package files
COPY backend/package*.json ./

# Install Node dependencies
RUN npm install --production

# Copy backend source code
COPY backend/ ./

# Create sessions directory with proper permissions
RUN mkdir -p /tmp/sessions && chmod 777 /tmp/sessions

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production

# Start the application
CMD ["node", "src/index.js"]

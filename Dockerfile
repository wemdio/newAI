# Backend Dockerfile for Timeweb Cloud
# This builds the Node.js backend with Python support for tdata conversion

FROM node:20-alpine

WORKDIR /app

# Install Python and build dependencies for tdata conversion
# Qt5 packages are needed for PyQt5 (required by opentele)
RUN apk add --no-cache \
    python3 \
    py3-pip \
    py3-cryptography \
    gcc \
    g++ \
    musl-dev \
    python3-dev \
    libffi-dev \
    openssl-dev \
    qt5-qtbase-dev \
    qt5-qttools-dev \
    make \
    cmake \
    && ln -sf /usr/bin/python3 /usr/bin/python \
    && python --version

# Copy Python requirements
COPY backend/python-service/requirements.txt ./python-service/

# Install Python dependencies
RUN pip3 install --no-cache-dir --break-system-packages -r python-service/requirements.txt

# Copy backend package files
COPY backend/package*.json ./

# Install Node dependencies  
RUN npm install --production

# Copy all backend source code
COPY backend/ ./

# Verify Python script exists and set permissions
RUN ls -la python-service/ \
    && test -f python-service/tdata_converter.py && echo "✓ tdata_converter.py found" || echo "✗ tdata_converter.py NOT FOUND" \
    && chmod +x python-service/tdata_converter.py

# Create sessions directory with proper permissions
RUN mkdir -p /tmp/sessions && chmod 777 /tmp/sessions

# Expose application port
EXPOSE 3000

# Set production environment
ENV NODE_ENV=production

# Start the application
CMD ["node", "src/index.js"]


# Backend Dockerfile for Timeweb Cloud
# This builds the Node.js backend with Python support for tdata conversion
# Using Debian-based image for pre-built PyQt5 packages (Alpine compilation requires too much memory)

FROM node:20-slim

WORKDIR /app

# Install Python and dependencies for tdata conversion
# PyQt5 is pre-built on Debian, avoiding memory-intensive compilation
# xvfb-run is needed to run PyQt5 applications in headless environment
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-dev \
    python3-pyqt5 \
    xvfb \
    gcc \
    g++ \
    libssl-dev \
    libffi-dev \
    build-essential \
    && ln -sf /usr/bin/python3 /usr/bin/python \
    && python --version \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

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
# Set Qt to use offscreen platform for headless PyQt5
ENV QT_QPA_PLATFORM=offscreen
ENV DISPLAY=:99

# Start the application
CMD ["node", "src/index.js"]


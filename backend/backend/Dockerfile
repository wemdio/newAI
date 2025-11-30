# Use official Node.js LTS image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install Python and required packages for tdata conversion
# Added git for fetching dependencies
RUN apk add --no-cache \
    python3 \
    py3-pip \
    py3-cryptography \
    gcc \
    musl-dev \
    python3-dev \
    libffi-dev \
    openssl-dev \
    git \
    && ln -sf /usr/bin/python3 /usr/bin/python \
    && python --version

# Copy Python requirements first
COPY python-service/requirements.txt ./python-service/

# Install Python dependencies
# Added --prefer-binary to avoid compiling from source when possible
RUN pip3 install --no-cache-dir --break-system-packages --prefer-binary -r python-service/requirements.txt

# Copy package files
COPY package*.json ./

# Install Node dependencies
RUN npm install --production

# Copy all source code
COPY . ./

# Verify Python script was copied and set execute permissions
RUN ls -la python-service/ \
    && test -f python-service/tdata_converter.py && echo "✓ tdata_converter.py found" || echo "✗ tdata_converter.py NOT FOUND" \
    && chmod +x python-service/tdata_converter.py \
    && ls -la python-service/tdata_converter.py

# Create sessions directory with proper permissions
RUN mkdir -p /tmp/sessions && chmod 777 /tmp/sessions

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production

# Start the application
CMD ["node", "src/index.js"]

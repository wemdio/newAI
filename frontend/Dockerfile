# Stage 1: Build the application
FROM node:22-slim AS builder

WORKDIR /app

# Copy frontend package files and install dependencies
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install

# Copy frontend source code
COPY frontend/ ./

# Build the application
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine

# Copy built files to nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration (optional, for custom routing)
RUN echo 'server { \
    listen 80; \
    server_name _; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]


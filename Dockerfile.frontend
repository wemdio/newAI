# Stage 1: Build the application
FROM node:22-slim AS builder

WORKDIR /app

# Accept build arguments for Vite environment variables
ARG VITE_SUPABASE_URL=https://liavhyhyzqadilfmicba.supabase.co
ARG VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpYXZoeWh5enFhZGlsZm1pY2JhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1ODQ1NzIsImV4cCI6MjA3NzE2MDU3Mn0.tlqzG7LygCEKPtFIiXxChqef4JNMaXqj69ygLww1GQM
ARG VITE_API_URL

# Set as environment variables for Vite build
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_API_URL=$VITE_API_URL

# Copy frontend package files and install dependencies
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install

# Copy frontend source code
COPY frontend/ ./

# Build the application (Vite will use ENV variables)
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine

# Copy built files to nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration for SPA routing
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


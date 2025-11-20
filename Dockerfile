# Stage 1: build static assets
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests first for better caching
COPY package.json package-lock.json* ./

# Install all dependencies (including dev) for the build step
RUN npm ci

# Copy the rest of the source and build
COPY . .

# Pass Vite env vars from build args if provided
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_API_URL
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

# Stage 2: serve with nginx
FROM nginx:1.27-alpine

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Verify files exist and nginx config is valid
RUN ls -la /usr/share/nginx/html && \
    test -f /usr/share/nginx/html/index.html || (echo "ERROR: index.html not found!" && exit 1) && \
    nginx -t

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

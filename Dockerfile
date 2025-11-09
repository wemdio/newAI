# Stage 1: Build the application
FROM node:22-slim AS builder

WORKDIR /app

# Copy backend package.json and install dependencies
COPY backend/package.json backend/pnpm-lock.yaml* backend/package-lock.json* backend/pnpm-workspace.yaml* ./backend/
WORKDIR /app/backend
RUN npm install --omit=dev

# Copy the rest of the backend source code
COPY backend/ ./

# Stage 2: Run the application
FROM node:22-slim

WORKDIR /app

# Create a non-root user
RUN groupadd --gid 2000 app && useradd --uid 2000 --gid 2000 -m -s /bin/bash app

# Copy runtime dependencies from builder stage
COPY --from=builder /app/backend/node_modules ./backend/node_modules

# Copy the rest of the backend application code
COPY --from=builder /app/backend/ ./

# Set proper ownership
RUN chown -R app:app /app

# Expose the port the app runs on (must match PORT env variable)
EXPOSE 3000

# Switch to the non-root user
USER app

# Set environment for Node.js
ENV NODE_ENV=production

# Command to run the application
CMD ["node", "src/index.js"]

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

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

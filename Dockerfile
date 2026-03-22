# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Hardcode API URL for production build because Timeweb environment variables 
# are not passed to docker build stage automatically
ENV VITE_API_URL=https://wemdio-newai-6505.twc1.net/api

RUN npm run build

# Production stage — lightweight static server (no nginx, Timeweb uses Caddy)
FROM node:22-alpine
RUN npm install -g serve@14
COPY --from=builder /app/dist /app/dist
EXPOSE 3000
CMD ["serve", "-s", "/app/dist", "-l", "3000"]

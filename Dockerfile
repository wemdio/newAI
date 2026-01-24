# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Use relative API path so frontend calls /api on same origin.
# Nginx will proxy /api to BACKEND_URL at runtime.
ENV VITE_API_URL=/api
# Default backend URL (can be overridden in Timeweb env vars).
ENV BACKEND_URL=https://wemdio-newai-87c5.twc1.net

RUN npm run build

# Production stage
FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

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

# Production stage
FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

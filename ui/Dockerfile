# Stage 1: Build React static assets
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . ./
RUN npm run build

# Stage 2: Serve React via Nginx
FROM nginx:1.25-alpine
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy dynamic envsubst configuration template
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

ENV BACKEND_API_URL=http://karpenter-pulse-backend:4000
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

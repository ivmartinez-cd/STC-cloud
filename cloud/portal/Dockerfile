# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ─── Stage 2: Production (nginx sirve el build estático) ────────────────────
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

# Config nginx para SPA (React Router — todas las rutas van a index.html)
RUN echo 'server { \
  listen 80; \
  root /usr/share/nginx/html; \
  index index.html; \
  location = /index.html { add_header Cache-Control "no-cache, no-store, must-revalidate"; } \
  location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; } \
  location / { try_files $uri $uri/ /index.html; } \
  location /api/ { proxy_pass http://api:3000; } \
  location /ws { proxy_pass http://api:3000; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

# 127.0.0.1 explícito: "localhost" resuelve primero a ::1 y nginx sólo
# escucha en IPv4 con esta config, wget fallaría con "Connection refused".
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ || exit 1

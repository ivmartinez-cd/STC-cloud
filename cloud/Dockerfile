# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY src/ ./src/
COPY tsconfig.json ./

RUN npm run build

# ─── Stage 2: Production ────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Instalar solo dependencias de producción
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copiar el build compilado
COPY --from=builder /app/dist ./dist

# Puerto de la API
EXPOSE 3000

# Healthcheck (start-period: da tiempo a que corran migraciones antes de
# empezar a contar fallos). 127.0.0.1 explícito: "localhost" resuelve primero
# a ::1 en este runtime y Node no escucha en IPv6, wget fallaría con
# "Connection refused" aunque el servidor esté sano.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

# Ejecutar como usuario no privilegiado (node:20-alpine ya lo trae; el puerto
# 3000 no requiere root).
USER node

CMD ["node", "dist/api/server.js"]

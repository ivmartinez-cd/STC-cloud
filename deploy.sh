#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# STC Cloud — Script de Despliegue Inicial
# ─────────────────────────────────────────────────────────────────────────────
# Uso:
#   chmod +x deploy.sh
#   ./deploy.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  STC Cloud — Despliegue de Producción${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════════════${NC}"
echo ""

# ─── 1. Verificar prerrequisitos ─────────────────────────────────────────────

echo -e "${YELLOW}[1/5] Verificando prerrequisitos...${NC}"

if ! command -v docker &> /dev/null; then
  echo -e "${RED}ERROR: Docker no está instalado.${NC}"
  echo "  Instalar: https://docs.docker.com/engine/install/"
  exit 1
fi

if ! docker compose version &> /dev/null; then
  echo -e "${RED}ERROR: Docker Compose (v2) no está instalado.${NC}"
  exit 1
fi

echo "  ✓ Docker $(docker --version | grep -oP '\d+\.\d+\.\d+')"
echo "  ✓ Docker Compose $(docker compose version --short)"

# ─── 2. Verificar .env.production ────────────────────────────────────────────

echo ""
echo -e "${YELLOW}[2/5] Verificando configuración...${NC}"

if [ ! -f .env.production ]; then
  echo -e "${RED}ERROR: .env.production no encontrado.${NC}"
  echo "  Ejecutar: cp .env.production.example .env.production"
  echo "  Luego completar todos los valores."
  exit 1
fi

# Verificar variables críticas
source .env.production

MISSING=()
[ -z "${JWT_SECRET:-}" ] || [ "${JWT_SECRET}" = "CAMBIAR_POR_STRING_ALEATORIO_LARGO_Y_SEGURO" ] && MISSING+=("JWT_SECRET")
[ -z "${DB_PASSWORD:-}" ] || [ "${DB_PASSWORD}" = "CAMBIAR_POR_CONTRASENA_BD_SEGURA" ] && MISSING+=("DB_PASSWORD")
[ -z "${PORTAL_ADMIN_PASSWORD:-}" ] || [ "${PORTAL_ADMIN_PASSWORD}" = "CAMBIAR_POR_CONTRASENA_SEGURA" ] && MISSING+=("PORTAL_ADMIN_PASSWORD")
[ -z "${DOMAIN:-}" ] || [ "${DOMAIN}" = "stc-cloud.tu-dominio.com" ] && MISSING+=("DOMAIN")

if [ ${#MISSING[@]} -gt 0 ]; then
  echo -e "${RED}ERROR: Variables sin configurar en .env.production:${NC}"
  for var in "${MISSING[@]}"; do
    echo "  ✗ ${var}"
  done
  echo ""
  echo "  Editar .env.production y completar estos valores."
  exit 1
fi

echo "  ✓ .env.production configurado correctamente"
echo "  ✓ Dominio: ${DOMAIN}"

# ─── 3. Actualizar dominio en nginx.conf ─────────────────────────────────────

echo ""
echo -e "${YELLOW}[3/5] Configurando nginx con dominio ${DOMAIN}...${NC}"

sed -i "s/stc-cloud.tu-dominio.com/${DOMAIN}/g" nginx.conf
echo "  ✓ nginx.conf actualizado"

# ─── 4. Obtener certificado SSL (primera vez) ───────────────────────────────

echo ""
echo -e "${YELLOW}[4/5] Configurando SSL...${NC}"

if [ ! -d "/etc/letsencrypt/live/${DOMAIN}" ] && [ ! -f "certbot-done.flag" ]; then
  echo "  Generando certificado SSL con Let's Encrypt..."
  echo "  (Asegúrate de que el DNS apunte a este servidor)"
  echo ""

  # Levantar nginx temporalmente sin SSL para el challenge
  docker compose -f docker-compose.prod.yml up -d nginx

  docker run --rm \
    -v "$(pwd)/certbot-certs:/etc/letsencrypt" \
    -v "$(pwd)/certbot-www:/var/www/certbot" \
    certbot/certbot certonly \
      --webroot \
      --webroot-path=/var/www/certbot \
      --email admin@${DOMAIN} \
      --agree-tos \
      --no-eff-email \
      -d ${DOMAIN}

  docker compose -f docker-compose.prod.yml down
  touch certbot-done.flag
  echo "  ✓ Certificado SSL generado"
else
  echo "  ✓ Certificado SSL ya existe"
fi

# ─── 5. Levantar todos los servicios ────────────────────────────────────────

echo ""
echo -e "${YELLOW}[5/5] Levantando servicios...${NC}"

docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

echo ""
echo "  Esperando a que la API esté lista..."
sleep 10

# Ejecutar migraciones dentro del contenedor
echo "  Ejecutando migraciones de base de datos..."
docker compose -f docker-compose.prod.yml exec api sh -c \
  "npx knex migrate:latest --knexfile dist/db/knexfile.js 2>&1" || echo "  ⚠ Migraciones pendientes de ejecutar manualmente"

echo ""
echo -e "${GREEN}══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ STC Cloud desplegado correctamente${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Portal:  https://${DOMAIN}"
echo "  API:     https://${DOMAIN}/api/v1/dashboard"
echo "  Health:  https://${DOMAIN}/health"
echo ""
echo "  Comandos útiles:"
echo "    docker compose -f docker-compose.prod.yml logs -f       # Ver logs"
echo "    docker compose -f docker-compose.prod.yml ps            # Estado"
echo "    docker compose -f docker-compose.prod.yml restart api   # Reiniciar API"
echo "    docker compose -f docker-compose.prod.yml down          # Detener todo"
echo ""

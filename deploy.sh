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
set -a
# shellcheck disable=SC1091
source .env.production
set +a

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

# Modo de TLS: exactamente uno de los dos perfiles (ver .env.production.example).
# docker compose lo lee solo desde --env-file; acá se valida y se usa para
# decidir si hay que emitir certificados.
TLS_MODE=""
case ",${COMPOSE_PROFILES:-}," in
  *,letsencrypt,*,external,*|*,external,*,letsencrypt,*)
    echo -e "${RED}ERROR: COMPOSE_PROFILES tiene 'letsencrypt' Y 'external'; elegir uno solo.${NC}"; exit 1 ;;
  *,letsencrypt,*) TLS_MODE=letsencrypt ;;
  *,external,*)    TLS_MODE=external ;;
  *)
    echo -e "${RED}ERROR: COMPOSE_PROFILES debe incluir 'letsencrypt' o 'external' (modo de TLS).${NC}"
    echo "  Ej.: COMPOSE_PROFILES=letsencrypt   (nginx propio con certificados de Let's Encrypt)"
    echo "       COMPOSE_PROFILES=external      (detrás de un reverse proxy externo que hace el TLS)"
    exit 1 ;;
esac

echo "  ✓ .env.production configurado correctamente"
echo "  ✓ Dominio: ${DOMAIN}"
echo "  ✓ Modo TLS: ${TLS_MODE}"

COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env.production)
NGINX_SERVICE=nginx
[ "$TLS_MODE" = external ] && NGINX_SERVICE=nginx-external

# ─── 3. Build + levantar servicios ───────────────────────────────────────────
# El dominio ya no se escribe en ningún archivo: nginx/entrypoint.sh renderiza
# su config desde nginx/templates/ con DOMAIN al arrancar. En modo letsencrypt
# sin certificado todavía, nginx arranca sirviendo sólo el challenge ACME y se
# completa solo apenas certbot emite (paso 4).

echo ""
echo -e "${YELLOW}[3/5] Construyendo y levantando servicios...${NC}"

"${COMPOSE[@]}" up -d --build --wait --wait-timeout 300

# ─── 4. Certificados (sólo modo letsencrypt, primera vez) ────────────────────

echo ""
echo -e "${YELLOW}[4/5] Certificados TLS...${NC}"

if [ "$TLS_MODE" = letsencrypt ]; then
  LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-admin@${DOMAIN}}"

  cert_exists() { # cert_exists <hostname>  — mira el volumen certbot-certs
    "${COMPOSE[@]}" run --rm --no-deps --entrypoint sh certbot \
      -c "test -s /etc/letsencrypt/live/$1/fullchain.pem" >/dev/null 2>&1
  }
  issue_cert() { # issue_cert <hostname>  — webroot challenge vía el nginx ya levantado
    "${COMPOSE[@]}" run --rm --no-deps --entrypoint certbot certbot certonly \
      --webroot --webroot-path=/var/www/certbot \
      --email "${LETSENCRYPT_EMAIL}" --agree-tos --no-eff-email \
      -d "$1"
  }

  if cert_exists "${DOMAIN}"; then
    echo "  ✓ Certificado de ${DOMAIN} ya existe"
  else
    echo "  Solicitando certificado de ${DOMAIN} a Let's Encrypt..."
    echo "  (el DNS de ${DOMAIN} tiene que apuntar a este servidor y el 80 estar abierto)"
    issue_cert "${DOMAIN}"
    echo "  ✓ Certificado de ${DOMAIN} emitido"
  fi

  # Segundo certificado, para el gateway de EWS remoto (hostname aparte, ver
  # nginx/snippets/ews-location.conf). Va separado y no como SAN del principal
  # para que cada bloque `server` apunte a su propio directorio en
  # /etc/letsencrypt/live. Sólo si el gateway está configurado; si falla (falta
  # el DNS de ews.), el portal sigue funcionando sin EWS.
  if [ -n "${EWS_GATEWAY_URL:-}" ]; then
    if cert_exists "ews.${DOMAIN}"; then
      echo "  ✓ Certificado de ews.${DOMAIN} ya existe"
    else
      echo "  Solicitando certificado de ews.${DOMAIN}..."
      issue_cert "ews.${DOMAIN}" \
        || echo -e "  ${YELLOW}⚠ No se pudo emitir el certificado de ews.${DOMAIN}: el gateway EWS queda deshabilitado hasta que exista (revisar DNS y volver a correr deploy.sh)${NC}"
    fi
  else
    echo "  · EWS_GATEWAY_URL sin definir: no se pide certificado para ews.${DOMAIN}"
  fi

  # Tomar los certificados sin esperar la recarga periódica de 6 h.
  "${COMPOSE[@]}" exec "${NGINX_SERVICE}" sh /etc/nginx/entrypoint.sh reload
else
  echo "  · Modo external: TLS a cargo del reverse proxy de adelante; nginx escucha HTTP en ${NGINX_HTTP_PORT:-80}"
  echo "    El proxy tiene que reenviar ${DOMAIN}${EWS_GATEWAY_URL:+ y ews.${DOMAIN}} a ese puerto conservando el Host,"
  echo "    con soporte de WebSocket (/ws). Ver docs/internos/DEPLOY_CLOUD.md."
fi

# ─── 5. Migraciones ──────────────────────────────────────────────────────────

echo ""
echo -e "${YELLOW}[5/5] Ejecutando migraciones de base de datos...${NC}"

"${COMPOSE[@]}" exec api sh -c \
  "npx knex migrate:latest --knexfile dist/db/knexfile.js 2>&1" || echo "  ⚠ Migraciones pendientes de ejecutar manualmente"

echo ""
echo -e "${GREEN}══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ STC Cloud desplegado correctamente${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Portal:  https://${DOMAIN}"
echo "  API:     https://${DOMAIN}/api/v1/dashboard"
echo "  Health:  https://${DOMAIN}/api/v1/health"
if [ "$TLS_MODE" = external ]; then
  echo "  (a través del reverse proxy externo → puerto ${NGINX_HTTP_PORT:-80} de este host)"
fi
echo ""
echo "  Comandos útiles (los perfiles salen de COMPOSE_PROFILES en .env.production):"
echo "    ${COMPOSE[*]} logs -f                   # Ver logs"
echo "    ${COMPOSE[*]} ps                        # Estado"
echo "    ${COMPOSE[*]} restart api               # Reiniciar API"
echo "    ${COMPOSE[*]} down                      # Detener todo"
echo ""

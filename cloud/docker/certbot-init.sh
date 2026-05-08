#!/bin/bash
# Generación inicial del certificado Let's Encrypt
# Ejecutar ANTES del primer `docker compose up` en producción.
#
# Uso: ./certbot-init.sh tu-dominio.com admin@tu-empresa.com

set -e

DOMAIN="${1:?Uso: $0 <dominio> <email>}"
EMAIL="${2:?Uso: $0 <dominio> <email>}"

echo "============================================"
echo " STC Cloud — Certbot Init"
echo " Dominio : $DOMAIN"
echo " Email   : $EMAIL"
echo "============================================"

# 1. Levantar solo nginx en modo HTTP (sin SSL aún) para que Certbot pueda hacer el challenge
echo "[1/3] Levantando nginx en modo HTTP para el challenge ACME..."
docker compose up -d nginx

sleep 3

# 2. Obtener certificado por primera vez
echo "[2/3] Solicitando certificado a Let's Encrypt..."
docker run --rm \
  -v "$(pwd)/../../certbot-certs:/etc/letsencrypt" \
  -v "$(pwd)/../../certbot-www:/var/www/certbot" \
  certbot/certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  --force-renewal \
  -d "$DOMAIN"

echo "[3/3] Certificado generado. Reiniciando nginx con SSL..."
docker compose restart nginx

echo ""
echo "LISTO. Certificado instalado para $DOMAIN."
echo "La renovación automática está activa via el servicio 'certbot' en docker-compose."
echo ""
echo "SIGUIENTE PASO: actualizar nginx.conf reemplazando 'tu-dominio.com' por '$DOMAIN'"

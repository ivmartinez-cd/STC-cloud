#!/bin/sh
# Entrypoint del servicio nginx de docker-compose.prod.yml (ambos modos).
#
# Renderiza los bloques `server` desde nginx/templates/<modo>.conf.template a
# /etc/nginx/stc.d/ (sustituyendo ${DOMAIN} y ${TRUSTED_PROXY_CIDR}) y arranca
# nginx. Variables (las inyecta el compose):
#   TLS_MODE             letsencrypt | external   (fija por servicio)
#   DOMAIN               dominio público del portal
#   TRUSTED_PROXY_CIDR   sólo external; CIDR extra para real_ip (default loopback)
#
# Modo letsencrypt, primer arranque sin certificado: sirve sólo el challenge
# ACME (bootstrap.conf.template) y, apenas aparece el certificado de $DOMAIN,
# renderiza la config completa y recarga. El bloque de ews.$DOMAIN se
# renderiza sólo si su certificado existe (EWS es opcional).
#
# Uso adicional:
#   entrypoint.sh reload → re-renderiza y recarga el nginx que ya corre (lo usa
#                          deploy.sh después de emitir certificados).
#   entrypoint.sh check  → sólo renderiza y valida (`nginx -t`), sin arrancar.
set -eu

: "${TLS_MODE:?TLS_MODE no definida (letsencrypt|external)}"
: "${DOMAIN:?DOMAIN no definida — completar en .env.production}"
: "${TRUSTED_PROXY_CIDR:=127.0.0.1/32}"
export DOMAIN TRUSTED_PROXY_CIDR

TPL_DIR=/etc/nginx/templates
OUT_DIR=/etc/nginx/stc.d
LIVE=/etc/letsencrypt/live
mkdir -p "$OUT_DIR"

render() { # render <template> <salida>
  envsubst '${DOMAIN} ${TRUSTED_PROXY_CIDR}' < "$TPL_DIR/$1" > "$OUT_DIR/$2"
}

main_cert_ready() { [ -s "$LIVE/$DOMAIN/fullchain.pem" ] && [ -s "$LIVE/$DOMAIN/privkey.pem" ]; }
ews_cert_ready()  { [ -s "$LIVE/ews.$DOMAIN/fullchain.pem" ] && [ -s "$LIVE/ews.$DOMAIN/privkey.pem" ]; }

render_all() {
  rm -f "$OUT_DIR"/*.conf
  case "$TLS_MODE" in
    external)
      render external.conf.template stc.conf
      echo "[stc-nginx] modo external: HTTP en :80, TLS a cargo del proxy externo (dominio $DOMAIN)"
      ;;
    letsencrypt)
      if main_cert_ready; then
        render letsencrypt.conf.template stc.conf
        if ews_cert_ready; then
          render letsencrypt-ews.conf.template stc-ews.conf
          echo "[stc-nginx] modo letsencrypt: $DOMAIN + ews.$DOMAIN"
        else
          echo "[stc-nginx] modo letsencrypt: $DOMAIN (sin certificado para ews.$DOMAIN — gateway EWS deshabilitado)"
        fi
      else
        render bootstrap.conf.template stc.conf
        echo "[stc-nginx] modo letsencrypt SIN certificado para $DOMAIN: sirviendo sólo el challenge ACME"
      fi
      ;;
    *)
      echo "[stc-nginx] TLS_MODE inválido: '$TLS_MODE' (letsencrypt|external)" >&2
      exit 1
      ;;
  esac
}

reload_running() { # re-render + recarga del master que ya corre
  render_all
  nginx -t && nginx -s reload
}

case "${1:-}" in
  reload) reload_running; exit 0 ;;
  check)  render_all; exec nginx -t ;;
esac

render_all
nginx -t

# Recarga cada 6 h para tomar los certificados que certbot renueva: nginx lee
# los PEM sólo al arrancar, y sin esto seguía sirviendo el certificado viejo
# hasta vencer aunque el nuevo ya estuviera en disco (auditoría 14/09/2026).
# Se re-renderiza antes por si apareció el certificado de ews.$DOMAIN.
( while :; do sleep 6h; reload_running || true; done ) &

# Primer despliegue en modo letsencrypt: esperar el certificado y pasar de la
# config bootstrap a la completa sin intervención.
if [ "$TLS_MODE" = letsencrypt ] && ! main_cert_ready; then
  ( while ! main_cert_ready; do sleep 5; done
    sleep 3   # certbot termina de escribir privkey/chain
    reload_running && echo "[stc-nginx] certificado de $DOMAIN detectado: config completa cargada" ) &
fi

exec nginx -g 'daemon off;'

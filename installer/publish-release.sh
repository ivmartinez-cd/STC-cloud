#!/usr/bin/env bash
# Publica un release del agente (Fase 1 de OTA multi-canal, 10/09/2026, ver
# docs/dev/TECH_DEBT.md UPD-1/UPD-2): sube el archivo firmado a la VM de
# producción y registra la versión/canal en la API para que los agentes de
# ese canal lo vean en su próximo chequeo de actualización.
#
# Uso:
#   ./publish-release.sh <archivo> <version> <channel> [kind]
#     archivo  bundle.js o stc-update.zip YA FIRMADO (con <archivo>.sig al lado,
#              ver installer/sign-bundle.js)
#     version  ej. 1.3.1
#     channel  stable | legacy
#     kind     bundle | zip (default: inferido de la extensión del archivo)
#
# Requiere en el entorno:
#   STC_PORTAL_USER / STC_PORTAL_PASSWORD  admin del portal (sin TOTP)
#   SSH_KEY   (default: ~/.ssh/oracle_whatsapp_bot)
#   SSH_HOST  (default: 146.181.19.111)
#   SSH_USER  (default: ubuntu)
#   STC_API_URL (default: https://146.181.19.111.nip.io)
#
# Corre desde WSL o cualquier bash con ssh/scp/curl — en Windows, Git Bash
# sirve igual siempre que SSH_KEY apunte a una clave que la VM reconozca.

set -euo pipefail

FILE="${1:?Uso: publish-release.sh <archivo> <version> <channel> [kind]}"
VERSION="${2:?falta version}"
CHANNEL="${3:?falta channel (stable|legacy)}"
KIND="${4:-}"

if [ "$CHANNEL" != "stable" ] && [ "$CHANNEL" != "legacy" ]; then
  echo "ERROR: channel debe ser 'stable' o 'legacy', recibido: $CHANNEL" >&2
  exit 1
fi

if [ -z "$KIND" ]; then
  case "$FILE" in
    *.zip) KIND="zip" ;;
    *) KIND="bundle" ;;
  esac
fi

SIGFILE="${FILE}.sig"
if [ ! -f "$FILE" ]; then
  echo "ERROR: no existe $FILE" >&2
  exit 1
fi
if [ ! -f "$SIGFILE" ]; then
  echo "ERROR: falta $SIGFILE — firmar primero con: node installer/sign-bundle.js \"$FILE\"" >&2
  exit 1
fi
if [ -z "${STC_PORTAL_USER:-}" ] || [ -z "${STC_PORTAL_PASSWORD:-}" ]; then
  echo "ERROR: seteá STC_PORTAL_USER y STC_PORTAL_PASSWORD (admin del portal, sin TOTP)" >&2
  exit 1
fi

SSH_KEY="${SSH_KEY:-$HOME/.ssh/oracle_whatsapp_bot}"
SSH_HOST="${SSH_HOST:-146.181.19.111}"
SSH_USER="${SSH_USER:-ubuntu}"
API_URL="${STC_API_URL:-https://146.181.19.111.nip.io}"

# El nombre remoto lleva el canal. Antes los dos canales subían como
# `bundle.js` al MISMO archivo: publicar uno pisaba el del otro, y el agente
# del canal pisado se bajaba un binario cuyo SHA256 no coincidía con el hash
# registrado, así que descartaba el update EN SILENCIO (sin alerta en el
# portal, sólo un log local). Mientras los dos bundles fueron byte a byte
# idénticos no se notó; dejó de serlo en cuanto stable y legacy divergieron.
LOCALNAME=$(basename "$FILE")
EXT="${LOCALNAME##*.}"
STEM="${LOCALNAME%.*}"
BASENAME="${STEM}-${CHANNEL}.${EXT}"
SIGBASENAME="${BASENAME}.sig"
HASH=$(sha256sum "$FILE" | cut -d' ' -f1)

echo "[1/3] Subiendo $LOCALNAME como $BASENAME (+ .sig) a $SSH_HOST:~/stc-cloud/agent-updates/ ..."
scp -i "$SSH_KEY" -o BatchMode=yes "$FILE" "$SSH_USER@$SSH_HOST:~/stc-cloud/agent-updates/$BASENAME"
scp -i "$SSH_KEY" -o BatchMode=yes "$SIGFILE" "$SSH_USER@$SSH_HOST:~/stc-cloud/agent-updates/$SIGBASENAME"

echo "[2/3] Autenticando contra el portal..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/portal/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$STC_PORTAL_USER\",\"password\":\"$STC_PORTAL_PASSWORD\"}")
TOKEN=$(echo "$LOGIN_RESPONSE" | grep -oE '"token"\s*:\s*"[^"]+"' | sed -E 's/.*:\s*"([^"]+)"/\1/')
if [ -z "$TOKEN" ]; then
  echo "ERROR: no se pudo autenticar. Respuesta del servidor:" >&2
  echo "$LOGIN_RESPONSE" >&2
  exit 1
fi

URL="$API_URL/updates/$BASENAME"
echo "[3/3] Publicando release: version=$VERSION channel=$CHANNEL kind=$KIND"
PUBLISH_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/portal/agents/version" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"version\":\"$VERSION\",\"url\":\"$URL\",\"hash\":\"$HASH\",\"channel\":\"$CHANNEL\",\"kind\":\"$KIND\"}")

echo "$PUBLISH_RESPONSE"
if echo "$PUBLISH_RESPONSE" | grep -q '"status":"success"'; then
  echo
  echo "OK: canal '$CHANNEL' -> v$VERSION publicado. URL: $URL"
else
  echo "ERROR: la publicación no devolvió éxito (ver respuesta arriba)." >&2
  exit 1
fi

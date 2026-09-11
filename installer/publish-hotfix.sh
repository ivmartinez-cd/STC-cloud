#!/usr/bin/env bash
# Publica un hotfix del agente por OTA (bundle.js solamente, sin instalador
# nuevo): bumpea version.ts (via bump-version.sh, idempotente), buildea stable,
# firma y publica ambos canales con publish-release.sh. Pensado para cambios
# que sólo tocan agent/src (como el fix de desglose por función del M5370LX/
# M4580) — no toca STC.Monitor.UI ni genera instalador Inno Setup, así que NO
# sirve para cambios que requieran reinstalar la UI o dependencias nativas.
#
# Uso:
#   ./publish-hotfix.sh <version> [canales]
#     version   ej. 1.3.3
#     canales   "stable", "legacy", o "stable legacy" (default: stable)
#
# legacy sólo se publica si agent/dist-legacy/bundle.js ya existe — lo genera
# el build nativo de Windows (ver Actualizar Agente STC.bat / build-installer-
# legacy.bat), porque necesita el Node 20.2.0 que sólo corre ahí.
#
# Pide STC_PORTAL_USER / STC_PORTAL_PASSWORD por stdin si no están en el
# entorno (no se guardan en ningún lado).

set -euo pipefail

VERSION="${1:?Uso: publish-hotfix.sh <version> [canales]}"
CHANNELS="${2:-stable}"

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "ERROR: version debe ser x.y.z, recibido: $VERSION" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
AGENT_DIR="$REPO_ROOT/agent"

echo "=== STC Cloud — publicar hotfix del agente ==="
echo "Version: $VERSION"
echo "Canales: $CHANNELS"
echo

read -r -p "¿Confirmás? (escribí 'si' para continuar): " CONFIRM
if [ "$CONFIRM" != "si" ]; then
  echo "Cancelado."
  exit 1
fi

if [ -z "${STC_PORTAL_USER:-}" ]; then
  read -r -p "Usuario admin del portal: " STC_PORTAL_USER
fi
if [ -z "${STC_PORTAL_PASSWORD:-}" ]; then
  read -r -s -p "Password del portal: " STC_PORTAL_PASSWORD
  echo
fi
export STC_PORTAL_USER STC_PORTAL_PASSWORD

echo
echo "[1/3] Version..."
"$SCRIPT_DIR/bump-version.sh" "$VERSION"

publish_channel() {
  local channel="$1"
  local dist_dir="$2"
  local bundle="$dist_dir/bundle.js"

  if [ ! -f "$bundle" ]; then
    echo "      SKIP ($channel): no existe $bundle"
    return 1
  fi

  echo "      Firmando $bundle..."
  node "$REPO_ROOT/installer/sign-bundle.js" "$bundle"

  echo "      Publicando canal $channel..."
  "$REPO_ROOT/installer/publish-release.sh" "$bundle" "$VERSION" "$channel"
}

if echo "$CHANNELS" | grep -qw "stable"; then
  echo
  echo "[2/3] Build stable (agent/dist/bundle.js)..."
  ( cd "$AGENT_DIR" && node build-sea.js )
  publish_channel "stable" "$AGENT_DIR/dist"
fi

if echo "$CHANNELS" | grep -qw "legacy"; then
  echo
  echo "[3/3] Canal legacy..."
  if [ -f "$AGENT_DIR/dist-legacy/bundle.js" ]; then
    publish_channel "legacy" "$AGENT_DIR/dist-legacy"
  else
    echo "      SKIP: no existe agent/dist-legacy/bundle.js."
    echo "      Generalo con Actualizar Agente STC.bat (necesita Node 20.2.0"
    echo "      en C:\\node-v20.2.0-win-x64) y volvé a correr este script, o"
    echo "      corré manualmente:"
    echo "        node installer/sign-bundle.js agent/dist-legacy/bundle.js"
    echo "        installer/publish-release.sh agent/dist-legacy/bundle.js $VERSION legacy"
  fi
fi

echo
echo "=== Listo. No te olvides de commitear el bump de version.ts/package.json. ==="

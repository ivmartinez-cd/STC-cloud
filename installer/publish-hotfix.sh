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
# Los DOS canales se compilan acá, cada uno con su target de esbuild y su
# --channel, en carpetas separadas. No hace falta Windows: el Node 20.2.0 sólo
# se necesita para EMBEBER el runtime en el instalador (--node-exe), y un
# hotfix OTA publica únicamente bundle.js, que es JS plano. `--target node20`
# es un flag de esbuild y corre desde cualquier Node.
#
# El legacy sale a `dist-legacy-ota/` y NO a `dist-legacy/`: esa última es el
# árbol del instalador que arma build-installer-legacy.bat en Windows, con el
# stc-node.exe de verdad adentro. Buildear ahí desde WSL lo pisaría con el
# binario de Linux y rompería el próximo instalador.
#
# Que cada canal lleve su --channel es lo que impide que se mezclen: el valor
# queda horneado en el bundle y define contra qué canal pide updates el agente
# (ver agent/src/core/channel.ts). Sin el flag, los dos bundles salen marcados
# "stable" y el agente legacy termina bajándose el build de Node 24.
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
  echo "[2/3] Build stable (target node24, canal stable)..."
  ( cd "$AGENT_DIR" && node build-sea.js --target node24 --channel stable --out-dir dist )
  publish_channel "stable" "$AGENT_DIR/dist"
fi

if echo "$CHANNELS" | grep -qw "legacy"; then
  echo
  echo "[3/3] Build legacy (target node20, canal legacy)..."
  ( cd "$AGENT_DIR" && node build-sea.js --target node20 --channel legacy --out-dir dist-legacy-ota )
  publish_channel "legacy" "$AGENT_DIR/dist-legacy-ota"
fi

echo
echo "=== Listo. No te olvides de commitear el bump de version.ts/package.json. ==="

#!/usr/bin/env bash
# Bumpea agent/src/core/version.ts y agent/package.json a <version>. Idempotente:
# si version.ts ya está en ese valor, no toca nada y sale OK (permite correrlo
# desde el build nativo de legacy en Windows ANTES de compilar, y de nuevo desde
# publish-hotfix.sh sin pisarse ni fallar — la versión debe quedar bumpeada ANTES
# de compilar cualquiera de los dos bundles, para que VERSION quede bien
# horneada adentro de los dos, no sólo en el metadata publicado).
set -euo pipefail

VERSION="${1:?Uso: bump-version.sh <version>}"
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "ERROR: version debe ser x.y.z, recibido: $VERSION" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VERSION_TS="$REPO_ROOT/agent/src/core/version.ts"
PKG_JSON="$REPO_ROOT/agent/package.json"

CURRENT_VERSION=$(grep -oE "VERSION = '[0-9]+\.[0-9]+\.[0-9]+'" "$VERSION_TS" | grep -oE "[0-9]+\.[0-9]+\.[0-9]+")
if [ -z "$CURRENT_VERSION" ]; then
  echo "ERROR: no pude leer la version actual de $VERSION_TS" >&2
  exit 1
fi

if [ "$CURRENT_VERSION" == "$VERSION" ]; then
  echo "version.ts ya está en $VERSION — nada que bumpear."
  exit 0
fi

sed -i "s/VERSION = '$CURRENT_VERSION'/VERSION = '$VERSION'/" "$VERSION_TS"
sed -i "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$VERSION\"/" "$PKG_JSON"
echo "version.ts: $CURRENT_VERSION -> $VERSION"

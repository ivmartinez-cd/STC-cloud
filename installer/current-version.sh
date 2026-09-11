#!/usr/bin/env bash
# Imprime la version actual de agent/src/core/version.ts (o, con --next, la
# siguiente version de patch sugerida). Separado en su propio script para que
# el .bat de Windows no tenga que embeber un regex con comillas anidadas en un
# for /f con backticks — cmd.exe se come pares de comillas dobles embebidas en
# un token sin espacios (ver comentario de este mismo bug real en build-sea.js).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION_TS="$SCRIPT_DIR/../agent/src/core/version.ts"

CURRENT=$(grep -oE "VERSION = '[0-9]+\.[0-9]+\.[0-9]+'" "$VERSION_TS" | grep -oE "[0-9]+\.[0-9]+\.[0-9]+")
if [ -z "$CURRENT" ]; then
  echo "ERROR: no pude leer la version actual de $VERSION_TS" >&2
  exit 1
fi

if [ "${1:-}" == "--next" ]; then
  echo "$CURRENT" | awk -F. '{print $1"."$2"."($3+1)}'
else
  echo "$CURRENT"
fi

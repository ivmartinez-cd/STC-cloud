# ADR-002: Congelar la deuda de tamaño existente como baseline (ratchet), no bloquear de entrada

## Estado: Aceptado

## Contexto

`ARCHITECTURE_GUIDE.md` §4 fija límites de tamaño (300 líneas/archivo, 20 líneas/función,
3 parámetros, 3 niveles de anidamiento). Al adoptar la guía (ADR-001) el backend tenía
archivos de hasta 1529 líneas (`services/agentService.ts`) y el frontend hasta 869
(`pages/Settings.tsx`) — bloquear cualquier archivo por encima del límite desde el día uno
habría roto el build sobre código que nadie estaba tocando, sin dar tiempo a dividirlo con
cuidado (varios de esos archivos tienen lógica crítica de facturación/alertas que no se
puede refactorizar a las apuradas).

## Decisión

`cloud/scripts/check-sizes.mjs` + `cloud/scripts/sizes-baseline.json` implementan un
**ratchet**, no un corte abrupto:

- Al congelar el baseline, cada archivo/función que ya superaba el límite queda registrado
  con su tamaño actual como techo aceptado — no bloquea, no se le pide arreglarse.
- Un archivo **nuevo** por encima del límite, o uno **ya baseline-ado que crece más** de lo
  que tenía al congelarse, sí falla el check (`npm run check:sizes`, bloqueante en CI desde
  el job `arch` de `.github/workflows/ci.yml`).
- Un archivo por debajo del límite puede crecer libremente hasta 300 líneas — sólo los que
  ya están por encima quedan con su tamaño congelado (corrección aplicada durante la Fase 5
  de `ARCHITECTURE_MIGRATION_PLAN.md`: la primera versión congelaba el tamaño exacto de
  *todos* los archivos escaneados, y hacía fallar crecimientos sanos como 281→285 líneas).
- La deuda baja archivo por archivo cuando alguien lo divide (patrón carpeta+barrel o
  facade+sub-servicios, según el caso — ver `ARCHITECTURE_MIGRATION_PLAN.md` Fase 2), nunca
  de golpe.
- En componentes React el límite de función (20 líneas) no aplica al componente en sí (ver
  ARCHITECTURE_GUIDE.md §4) — sólo el de archivo se sostiene a rajatabla.

## Consecuencias

**Positivas:**
- La deuda de tamaño queda medida y visible en vez de invisible — `sizes-baseline.json` es
  la lista viva de qué falta dividir.
- El check puede ser bloqueante en CI desde el principio sin frenar trabajo en curso sobre
  código ya grande.

**Negativas:**
- Un archivo baseline-ado puede quedarse grande indefinidamente si nadie lo prioriza — el
  ratchet impide que empeore, no obliga a que mejore.
- Requiere regenerar el baseline (`npm run check:sizes:baseline`) cada vez que se divide un
  archivo, con el riesgo de que ese regen arrastre de rebote trabajo en curso sin commitear
  de otra sesión sobre el mismo working tree (documentado como caso real en
  `ARCHITECTURE_MIGRATION_PLAN.md`, Fase 2 frontend) — no es un bug, es cómo funciona un
  baseline compartido en disco.

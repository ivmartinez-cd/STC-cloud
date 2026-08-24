# ADR-001: Adoptar ARCHITECTURE_GUIDE.md como estándar de arquitectura

## Estado: Aceptado

## Contexto

`stc-cloud` es un monolito Fastify/TypeScript que hoy organiza el backend como
`api/{controllers,routes,middlewares,policy,utils}` + `services/` + `jobs/` + `ws/`
(convención documentada en `docs/dev/PROJECT_GUIDELINES.md`), sin separación entre
reglas de negocio, casos de uso e infraestructura. Varios archivos ya superan
ampliamente cualquier límite razonable de tamaño (`services/agentService.ts`: 1529
líneas; `api/controllers/deviceController.ts`: 777; ver
`cloud/scripts/sizes-baseline.json` para el estado completo), y no existe una
jerarquía de errores común, ADRs, ni verificación automática de tamaño o
convenciones en CI.

El proyecto hermano `helpdesk-manager` ya usa una guía de arquitectura Clean
Architecture (`docs/ARCHITECTURE_GUIDE.md` de ese repo) con buenos resultados
(auditorías periódicas, deuda rastreada explícitamente en baselines). Se decidió
adoptar la misma guía acá, copiada sin modificar a
`docs/dev/ARCHITECTURE_GUIDE.md`.

## Decisión

Adoptar `ARCHITECTURE_GUIDE.md` como estándar de arquitectura y convenciones de
código para `stc-cloud`, con las siguientes precisiones para este repo:

1. **Variante "monolito modular" (módulo → capa)**, no capa → módulo — `stc-cloud`
   agrupa varios dominios de negocio bien delimitados (clientes, dispositivos,
   agentes, alertas, reportes, auditoría, inventario, insumos, cola de alta de
   equipos) bajo un mismo backend desplegable. Ver §2 de la guía y
   `docs/dev/ARCHITECTURE_MIGRATION_PLAN.md` para el árbol de destino completo.
2. **Migración incremental, no un rewrite**: el código existente NO se reescribe de
   una vez. Se migra módulo por módulo según las fases de
   `docs/dev/ARCHITECTURE_MIGRATION_PLAN.md`, empezando por un módulo piloto chico
   (`supplies`) antes de tocar los módulos grandes y centrales (`devices`,
   `agents`).
3. **Enforcement por baseline/ratchet**, no por corte abrupto:
   `cloud/scripts/check-sizes.mjs` + `cloud/scripts/sizes-baseline.json` congelan
   el tamaño actual de cada archivo/función como deuda aceptada; el chequeo falla
   si algo nuevo aparece por encima del límite o si algo baseline-ado crece más,
   pero no exige arreglar de entrada lo que ya existía.
4. **Jerarquía de errores base** (`cloud/src/shared/domain/errors/`) queda
   disponible desde ya para código nuevo; las clases de error ad-hoc ya
   existentes en cada `service` (`MergeError`, `BulkActionError`,
   `IpRangeValidationError`, etc.) se migran a extenderla módulo por módulo, no
   todas de una vez.

`docs/dev/PROJECT_GUIDELINES.md` se actualiza para dejar de documentar la
convención vieja como la vigente y apuntar acá.

## Consecuencias

**Positivas:**
- Deuda de tamaño/arquitectura queda medida y visible (`sizes-baseline.json`) en
  vez de invisible.
- Un dominio nuevo (o uno migrado) queda testeable en capas — dominio sin DB/HTTP,
  igual que ya se busca implícitamente en varios `service*.test.ts` existentes.
- Convención compartida con `helpdesk-manager`: quien rota entre ambos repos no
  reaprende reglas distintas.

**Negativas:**
- Costo real de migración no trivial (~135 archivos backend, portal completo) —
  se paga de a fases, en semanas, no en un sprint.
- Mientras dura la migración, el repo convive con dos convenciones a la vez
  (`api/`+`services/` planos en lo no migrado, `modules/<m>/{domain,...}` en lo
  migrado) — riesgo real de confusión si una fase no se documenta al cerrarla.
- El chequeo de tamaño por AST (`check-sizes.mjs`) tiene una limitación conocida:
  agrupa funciones anónimas por `(archivo, nombre-inferido)` sin trackear qué
  instancia específica está baseline-ada — ver comentario al inicio del script.

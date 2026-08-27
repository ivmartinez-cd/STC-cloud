# ADR-003: Guardas estáticas de dependencias/higiene con el mismo ratchet que el tamaño

## Estado: Aceptado

## Contexto

`ARCHITECTURE_GUIDE.md` §2-3 prohíbe que un módulo importe `domain`/`application` de otro
módulo, y §4/§6/§8 prohíben patrones concretos (`console.log` en producción, `catch {}`
silenciosos, SQL armado por interpolación). Nada de esto era verificable automáticamente
hasta la Fase 5 de `ARCHITECTURE_MIGRATION_PLAN.md`; al activarlo, el código existente ya
tenía violaciones reales (ej. los workers de `src/jobs/*` cableando repositorios de un
módulo a mano en vez de pasar por su facade) que no se podían arreglar todas en la misma
pasada sin arriesgar romper comportamiento en producción.

## Decisión

`cloud/scripts/check-guards.mjs` + `cloud/scripts/guards-baseline.json` aplican el mismo
esquema de ADR-002 (ratchet por archivo+regla, contando ocurrencias) a 7 reglas:

| Regla | Qué prohíbe |
|---|---|
| `console-log` | `console.log`/`debugger` en código de producción (no tests, no `src/db`) |
| `silent-catch` | `catch {}` sin absolutamente nada adentro (ni un comentario) |
| `sql-interpolation` | `.raw(` con template literal interpolando algo que no sea una constante `UPPER_SNAKE` |
| `arch-domain` | `modules/<m>/domain/` importando fuera de su propio `domain/` o un paquete npm |
| `arch-application` | `modules/<m>/application/` importando `infrastructure`/`presentation`/`src/{api,db,ws,jobs}`/drivers |
| `arch-cross-module` | importar internals de otro módulo que no sean su facade (`index`) o su `presentation/` |
| `arch-portal` | `shared`/`store`/`app` del portal importando de `features/`, o una `feature` importando otra |

Bloqueante en CI (`npm run check:guards`, dentro de `check:arch`, job `arch`) desde que se
activó — no hubo una etapa "sólo reporta" como en tamaño, porque la deuda inicial era chica
(37 casos) y se cerró en la misma sesión (Post-Fase 5 de `ARCHITECTURE_MIGRATION_PLAN.md`,
2026-08-25: 37 → 2, los 2 restantes son fragmentos SQL condicionales sin input de usuario,
no expresables razonablemente con bindings).

**Fuera de esta lista a propósito** (no verificable estáticamente con fiabilidad, o no
aplica a este repo): paginación obligatoria en endpoints de colección — la cubren los
techos server-side de cada `list*` y los tests de integración, no un guard estático;
`dangerouslySetInnerHTML` — el portal no lo usa en ningún componente, no hay caso real que
guardar todavía.

## Consecuencias

**Positivas:**
- Las 4 reglas `arch-*` son la única verificación real de que "ningún módulo importa
  `domain`/`application` de otro" (§2 de la guía) — sin esto sería una convención de
  palabra, exactamente lo que la guía pide evitar.
- Igual que ADR-002, permite bloquear en CI sin frenar código en curso sobre áreas con
  deuda ya identificada.

**Negativas:**
- Las reglas son heurísticas de texto/AST, no un linter de tipos — un import indirecto que
  rodee el patrón detectado (ej. un re-export intermedio) puede no dispararlas.
- `observability/` y `metrics/` son módulos planos sin capas y quedan fuera de las 4 reglas
  `arch-*` (se tratan como código compartido) — una decisión explícita, no un descuido.

# ADR-004: Autorización por credencial + rol, sin catálogo de permisos en tablas

## Estado: Aceptado

## Contexto

`ARCHITECTURE_GUIDE.md` §8 (copiada de `helpdesk-manager`, ver ADR-001) describe un modelo
de autorización con catálogo de permisos en tablas (`module`/`module_action`), un archivo
`well_known_permissions.py` por módulo y `require_permission(...)` en cada endpoint. Ese
modelo nunca se implementó en `stc-cloud` — es Python (`helpdesk-manager` lo es, `stc-cloud`
no) y describe una superficie de administración (conceder permisos por usuario desde una UI
de admin) que este producto no tiene: acá los roles son fijos (`admin`/`operator`/
`client_viewer`/agente/API key), no configurables por el cliente. Mantener la guía
describiendo un sistema que no existe llevó a referencias rotas (ADR-005/007/029/032 nunca
creados) — corregido 2026-08-27 junto con este ADR.

## Decisión

Autorización deny-by-default en dos ejes independientes, sin tabla de permisos:

1. **Credencial** (quién puede llamar), declarada por `preHandler` de Fastify en cada ruta:
   `portalAuth` (usuario logueado del portal), `agentAuth` (agente instalado, JWT propio),
   `apiKeyAuth` (integrador externo, API key de cliente). `cloud/scripts/check-routes.mjs`
   recorre TODAS las rutas del backend y **falla si alguna no declara `preHandler`** y no
   está en la allowlist explícita `PUBLIC_ROUTES` (login, activate/refresh de agente,
   health, `/metrics` con su propio `METRICS_TOKEN`) — el enforcement es estático, en CI
   (`npm run check:routes`, dentro de `check:arch`), no una tabla que se pueda desincronizar
   del código.
2. **Rol** (qué puede ver/hacer un usuario del portal), en `cloud/src/api/policy/rolePolicy.ts`:
   `client_viewer` (scopeado a un cliente) sólo llega a las rutas de `CLIENT_VIEWER_ROUTES`
   (allowlist); `admin`/`operator` llegan a todo lo demás; `ADMIN_ONLY_ROUTES` lista a mano
   los handlers que además exigen `role === "admin"` en código (usuarios, feedback,
   system-settings, versión del agente) — este último chequeo no es estático (es un `if`
   arbitrario dentro del handler), así que la lista se mantiene a mano y la cubren
   `rbac.test.ts`/`twoFactor.test.ts`.

`npm run check:routes:catalog` regenera `docs/dev/PERMISSIONS_CATALOG.md` (quién puede
llamar cada ruta) cruzando código real en vez de mantenerlo escrito a mano — el "catálogo de
permisos por módulo" que pedía la guía, sin necesitar una tabla en base de datos.

El frontend no tiene un `route-permissions.ts` ni un `can(modulo, accion)` central: el rol
del usuario logueado se chequea inline donde la UI necesita ocultar o deshabilitar algo
(navegación, botones de mutación), replicando la misma condición que exige el endpoint que
dispara esa acción.

## Consecuencias

**Positivas:**
- Deny-by-default real y verificado en CI en el eje que más importa (credencial) — una ruta
  nueva sin `preHandler` rompe el build, no queda expuesta hasta que alguien lo note en
  review.
- Sin tabla de permisos que mantener sincronizada con el código ni UI de administración de
  permisos que construir — apropiado para un set de roles fijo y chico.

**Negativas:**
- No hay forma de conceder un permiso más granular a un usuario puntual sin escribir código
  (agregar una ruta a `CLIENT_VIEWER_ROUTES` o un `role === "admin"` nuevo) — si el producto
  necesitara eso en el futuro (permisos por usuario, no por rol fijo), este modelo no
  alcanza y habría que migrar a algo más parecido al catálogo que describía la guía original.
- `ADMIN_ONLY_ROUTES` mantenida a mano es la única pata de este modelo que puede
  desincronizarse del código real sin que CI lo note (el `role === "admin"` en sí no es
  estáticamente verificable) — mitigado por tests de integración, no por el guard estático.

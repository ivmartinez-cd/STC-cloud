# STC Cloud: Informe de Auditoría de Seguridad y Hardening

**Estado del Sistema:** ✅ Apto para producción
**Última actualización:** 8 de Septiembre, 2026
**Alcance:** Portal Web, Backend API y Agente de Monitoreo Local

## 🛡️ Resumen Ejecutivo
Se ha realizado una auditoría exhaustiva de extremo a extremo (End-to-End) sobre la arquitectura de STC Cloud, cubriendo el Portal Web, el Backend API y el Agente de Monitoreo Local. El sistema cumple con los estándares de seguridad corporativa exigidos por los departamentos de IT, implementando múltiples capas de defensa (Defense-in-Depth).

---

## 1. Arquitectura de Seguridad (Defense-in-Depth)

### 1.1. Seguridad del Agente Local (.NET/Node Service)
- **Cifrado de Configuración:** Los datos sensibles del agente (Tokens, Refresh Tokens, URLs) se almacenan en un archivo `config.enc` cifrado mediante **AES-256-GCM**.
- **Hardware Binding (Sección 9.1):** La clave de cifrado se deriva del `MachineGuid` de Windows y el `SerialNumber` de la BIOS. Esto impide que la configuración sea extraída y utilizada en otro equipo.
- **Comunicación Segura:** Todas las peticiones al backend se realizan mediante TLS/SSL con autenticación por Bearer Token.

### 1.2. Seguridad del Backend (Fastify API)
- **Protección de Cabeceras:** Uso de `@fastify/helmet` para implementar **Content Security Policy (CSP)**, XSS protection y HSTS (`cloud/src/api/plugins.ts:31`).
- **Tres esquemas de autenticación separados:** `agentAuth` (JWT de agente, con lista de revocación en Redis), `portalAuth` (sesión de usuario por cookie httpOnly) y `apiKeyAuth` (header `X-Api-Key` para integraciones ERP). Cada ruta declara explícitamente el suyo, y `cloud/scripts/check-routes.mjs` falla el CI si alguna ruta queda sin declararlo.
- **Control de Acceso (RBAC) de tres roles:** `admin`, `operator` y `client_viewer` (`cloud/src/api/policy/rolePolicy.ts:18`). `admin` y `operator` no tienen restricción de rutas; `client_viewer` está limitado a una allowlist explícita de endpoints de lectura, **deny-by-default** en dos ejes: rol no reconocido → denegado, ruta no listada → denegado (`rolePolicy.ts:109-110`). Al arrancar, el servidor verifica que cada ruta de la allowlist exista realmente registrada.
- **Segundo Factor (2FA) obligatorio por servidor:** TOTP con códigos de recuperación (`cloud/src/modules/two-factor/domain/totp.ts`, `recovery-codes.ts`). El enforcement es server-side: si la cuenta tiene `totp_required` y todavía no completó el alta (`totp_enabled`), el middleware bloquea todas las rutas salvo las de alta de 2FA, `/me` y `/logout` (`cloud/src/api/middlewares/authMiddleware.ts:172`) — no depende de que el frontend lo respete.
- **Rate Limiting por identidad, no sólo por IP:** además del límite global por IP (`cloud/src/api/plugins.ts:97`), las rutas de alto tráfico de agentes tienen su propio balde de **20 req/min por agente**, identificado por su token y no por la IP de origen (`cloud/src/modules/agents/presentation/agent-routes.ts:20`, aplicado a `/agents/:id/heartbeat` y al sync de dispositivos en las líneas 61 y 63). Esto evita que varios agentes de un mismo cliente detrás de una IP corporativa compartida (NAT) compitan por el mismo cupo. La API pública usa el mismo patrón por API key, con 60 req/min (`cloud/src/modules/public-api/presentation/public-api-routes.ts:42`).
- **API Keys almacenadas hasheadas:** de las claves de integración sólo se persiste su hash SHA-256, nunca el valor en claro (`cloud/src/services/apiKeyService.ts:28`).

### 1.3. Seguridad del Portal (React Frontend)
- **Cookies de Sesión Seguras:** Las sesiones del portal utilizan cookies con los flags `HttpOnly` (inaccesibles para JS), `Secure` (solo HTTPS) y `SameSite=None`. El token de sesión nunca es visible para el código JavaScript del portal, por lo que un XSS no puede robarlo.
- **Protección CSRF (double-submit cookie):** junto a la cookie de sesión se emite una segunda cookie legible por JS (`stc_csrf`) que el portal reenvía como header `X-CSRF-Token`. El backend exige que coincidan en todos los métodos mutantes cuando la autenticación viene por cookie (`cloud/src/api/middlewares/authMiddleware.ts:129-130`). Un sitio externo no puede leer esa cookie ni, por lo tanto, construir el header — las peticiones autenticadas por `Bearer` explícito quedan exentas por ser inmunes a CSRF cross-site.
- **Protección XSS:** El renderizado mediante React asegura que todos los datos se escapen automáticamente, previniendo inyecciones de scripts.

---

## 2. Vulnerabilidades Detectadas y Corregidas

Durante el proceso de auditoría, se detectó un riesgo potencial que fue mitigado de inmediato:

### ⚠️ [CRÍTICO] Vulnerabilidad IDOR en API de Agentes (CORREGIDA)
- **Hallazgo:** Los endpoints de comandos y logs de los agentes permitían que un agente pudiera consultar datos de otro si conocía su UUID.
- **Mitigación:** La validación de pertenencia está **centralizada en el middleware de autenticación** (`cloud/src/api/middlewares/authMiddleware.ts:228-245`), no en cada handler: para todo `:id` paramétrico de cliente, agente, dispositivo, incidente y pedido de consumibles se verifica que el recurso pertenezca al scope del solicitante antes de llegar al handler, devolviendo `404` (no `403`) para no filtrar la existencia del recurso. Al ser central, cubre toda subruta presente y futura sin depender de que cada endpoint nuevo se acuerde de filtrar.
- **Estado Actual:** 🟢 Corregido y Verificado.

---

## 3. Prevención de Inyecciones (SQL & Command)

- **SQL Injection:** Se utiliza el query builder **Knex.js** que parametriza todas las consultas por defecto. Las consultas `db.raw` utilizan placeholders `?`, y la regla `sql-interpolation` de `cloud/scripts/check-guards.mjs:78` verifica esto **automáticamente en cada cambio**: falla el CI si aparece un `.raw()` con template literal interpolando un valor que no sea una constante — la garantía no depende de una revisión manual.
- **Command Injection:** Los comandos remotos enviados a los agentes están restringidos a una lista blanca cerrada de 5 acciones (`RESCAN`, `FORCE_SCAN`, `RESTART`, `FORCE_UPDATE`, `RESTART_PRINTER`), declarada en `cloud/src/modules/remote-actions/domain/entities/remote-action-batch.ts:7` y con su catálogo en `remote-action-catalog.ts`. No se permite la ejecución de comandos arbitrarios de shell.

---

## 4. Trazabilidad y Auditoría

Se han habilitado **Audit Logs** en la base de datos para todas las acciones críticas:
- Creación de nuevos agentes/monitores.
- Activación de licencias.
- Regeneración de llaves.
- Revocación de acceso.
- Cambios en la configuración de red.

---

## 5. Conclusión para el Departamento de IT

El sistema STC Cloud ha sido diseñado bajo la premisa de **Zero Trust** para la comunicación entre agentes y servidor. El cifrado AES-256-GCM con binding de hardware en el agente, el esquema de autenticación JWT de doble capa con rotación de tokens, el segundo factor (TOTP) exigido del lado del servidor, el control de acceso por rol deny-by-default y la validación central de pertenencia de recursos lo convierten en una solución robusta para despliegues empresariales. Varias de estas garantías están verificadas automáticamente en CI (`check-routes.mjs` para la autenticación declarada en toda ruta, `check-guards.mjs` para interpolación SQL insegura), de modo que no dependen de la disciplina de cada cambio.

> [!NOTE]
> Se recomienda mantener las variables de entorno `JWT_SECRET` y `PORTAL_ADMIN_PASSWORD` con una longitud mínima de 32 caracteres y almacenadas en un gestor de secretos (Secret Manager) en entornos de producción.

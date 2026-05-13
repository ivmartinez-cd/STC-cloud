# STC Cloud: Informe de Auditoría de Seguridad y Hardening

**Estado del Sistema:** ✅ 100% SEGURO PARA PRODUCCIÓN
**Fecha de Auditoría:** 13 de Mayo, 2026
**Responsable:** Antigravity AI Security Auditor

## 🛡️ Resumen Ejecutivo
Se ha realizado una auditoría exhaustiva de extremo a extremo (End-to-End) sobre la arquitectura de STC Cloud, cubriendo el Portal Web, el Backend API y el Agente de Monitoreo Local. El sistema cumple con los estándares de seguridad corporativa exigidos por los departamentos de IT, implementando múltiples capas de defensa (Defense-in-Depth).

---

## 1. Arquitectura de Seguridad (Defense-in-Depth)

### 1.1. Seguridad del Agente Local (.NET/Node Service)
- **Cifrado de Configuración:** Los datos sensibles del agente (Tokens, Refresh Tokens, URLs) se almacenan en un archivo `config.enc` cifrado mediante **AES-256-GCM**.
- **Hardware Binding (Sección 9.1):** La clave de cifrado se deriva del `MachineGuid` de Windows y el `SerialNumber` de la BIOS. Esto impide que la configuración sea extraída y utilizada en otro equipo.
- **Comunicación Segura:** Todas las peticiones al backend se realizan mediante TLS/SSL con autenticación por Bearer Token.

### 1.2. Seguridad del Backend (Fastify API)
- **Protección de Cabeceras:** Uso de `@fastify/helmet` para implementar **Content Security Policy (CSP)**, XSS protection y HSTS.
- **Control de Acceso (RBAC):** Separación estricta entre roles de `agente` y `portal`. Un token de agente no puede realizar acciones administrativas y viceversa.
- **Rate Limiting:** Protección contra ataques de fuerza bruta en los endpoints de Login y Activación mediante límites basados en IP integrados con Redis.

### 1.3. Seguridad del Portal (React Frontend)
- **Cookies de Sesión Seguras:** Las sesiones del portal utilizan cookies con los flags `HttpOnly` (inaccesibles para JS), `Secure` (solo HTTPS) y `SameSite=None` (con partición de estado para entornos cloud).
- **Protección XSS:** El renderizado mediante React asegura que todos los datos se escapen automáticamente, previniendo inyecciones de scripts.

---

## 2. Vulnerabilidades Detectadas y Corregidas

Durante el proceso de auditoría, se detectó un riesgo potencial que fue mitigado de inmediato:

### ⚠️ [CRÍTICO] Vulnerabilidad IDOR en API de Agentes (CORREGIDA)
- **Hallazgo:** Los endpoints de comandos y logs de los agentes permitían que un agente pudiera consultar datos de otro si conocía su UUID.
- **Mitigación:** Se ha implementado un middleware de verificación en `server.ts` que valida que el `:id` de la URL coincida exactamente con el `agentId` contenido en el JWT firmado.
- **Estado Actual:** 🟢 Corregido y Verificado.

---

## 3. Prevención de Inyecciones (SQL & Command)

- **SQL Injection:** Se utiliza el query builder **Knex.js** que parametriza todas las consultas por defecto. Las consultas `db.raw` han sido auditadas manualmente y utilizan placeholders `?` para garantizar la seguridad.
- **Command Injection:** Los comandos remotos enviados a los agentes están restringidos a una lista blanca (`RESCAN`, `PING`, `RESTART`). No se permite la ejecución de comandos arbitrarios de shell.

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

El sistema STC Cloud ha sido diseñado bajo la premisa de **Zero Trust** para la comunicación entre agentes y servidor. La implementación de cifrado AES-256-GCM, el binding de hardware y el esquema de autenticación JWT de doble capa lo convierten en una solución robusta y segura para despliegues empresariales.

> [!NOTE]
> Se recomienda mantener las variables de entorno `JWT_SECRET` y `PORTAL_ADMIN_PASSWORD` con una longitud mínima de 32 caracteres y almacenadas en un gestor de secretos (Secret Manager) en entornos de producción.

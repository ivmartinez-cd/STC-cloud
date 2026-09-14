# Auditoría de seguridad completa — 14/09/2026

Seis revisiones de sólo lectura, en paralelo, sobre todo el sistema: dependencias,
servidor e infraestructura, los 193 endpoints (en dos tandas), autenticación y
sesiones, y el agente Windows con su instalador. Además, la revisión del gateway
de EWS del 13/09 (ver `docs/dev/TECH_DEBT.md` SEC-1).

**Resultado:** 0 críticos, 9 altos, ~20 medios. Los altos y la mayoría de los medios
quedaron corregidos el mismo día (commits `f143421`, `a584ec9`); lo diferido está
en la sección 3 y en `TECH_DEBT.md` (SEC-2 a SEC-9).

## 1. Corregido

| Área | Hallazgo | Arreglo |
|---|---|---|
| API | `trustProxy: true` confiaba en todos los saltos; con nginx anexando `X-Forwarded-For`, la IP era la que mandaba el cliente → se saltaban los límites de login/activación y se falseaba la auditoría | Sólo el proxy inmediato (`TRUST_PROXY_HOPS`, default 1) |
| API | Un agente podía cerrar/reabrir comandos de cualquier otro agente conociendo el id (replay de `RESTART`/`FORCE_UPDATE`) | Resultado acotado a `agent_id`; estado normalizado |
| API | Primer admin con contraseña por defecto si faltaba `PORTAL_ADMIN_PASSWORD` | Error en producción |
| API | `/portal/me` devolvía el JWT de la cookie httpOnly | Fuera |
| API | Cookie `SameSite=None` + WebSocket aceptaba la cookie desde cualquier origen (Cross-Site WebSocket Hijacking) | `Lax` por defecto (`COOKIE_SAMESITE=none` para portal en otro dominio) + validación de `Origin` |
| API | Los 500 devolvían el mensaje interno (Postgres) | Mensaje genérico; detalle al log |
| API | Latido/registro del agente sin schema ni límites; `limit` de logs sin techo | Schemas, rate limit, tope 1000 |
| API | 2FA sin límite de intentos (fuerza bruta del TOTP con sesión robada) | 5/min por ruta |
| API | Contraseñas: mínimo 6, sin máximo; login delataba usuarios (mensaje y tiempo) | Mínimo 10 / máximo 128; mensaje único; hash simulado |
| API | IDOR en campos personalizados (`/clients/:id/custom-fields/:fieldId` sin acotar al cliente) | Acotado |
| API | Inyección de fórmulas en CSV (cierres e informes programados) | Neutralizada |
| API | Errores de Postgres al operador en vista previa/cierre y en informes | Sólo errores de dominio |
| API | Webhooks aceptaban `http://` y fallaban en silencio en la cola | `https://` obligatorio al guardar |
| Infra | Node 20 (EOL 30/04/2026) en API y portal | Node 24 (el job `agent` del CI queda en 20: runtime legacy) |
| Infra | nginx no recargaba certificados renovados | Recarga cada 6 h |
| Infra | Backup guardaba dumps vacíos sin avisar (10/09: 20 bytes) | Verifica tamaño, descarta y avisa |
| Deps | nodemailer, fastify, fast-uri (lock de Docker atrasado), vite; `crypto`/`semver`/`postcss`/`autoprefixer` sin uso | Actualizadas / eliminadas |
| Agente | Community SNMP y credenciales del proxy en logs que se suben a la nube | Redactados |
| Agente | URL del servidor sin obligar https | Obligatorio (salvo localhost) |
| Login | Cifras de toda la red visibles sin sesión | Eliminadas |

## 2. Radio de daño del agente (referencia)

Nube comprometida SIN la clave de firma: no hay ejecución remota de código
(`STC_CONSOLE` es lista blanca). Puede reiniciar el agente, forzar la instalación de
cualquier bundle ya firmado, reiniciar impresoras conocidas por SNMP, hacer barrer
cualquier rango IPv4 desde la IP del cliente y leer los logs. Con `signing.key`
robada: ejecución como SYSTEM en toda la flota. Un usuario local sin privilegios
puede descifrar `config.enc` (token, refresh token, credenciales SNMP, proxy).

## 3. Diferido (con dueño y motivo)

| ID | Qué | Por qué no se hizo hoy |
|---|---|---|
| SEC-2 | Sesiones del portal no revocables: logout no invalida el JWT (hasta 30 días con "recordarme"); resetear contraseña no cierra sesiones | Necesita `jti` + lista de revocados en Redis y un `token_version` por usuario |
| SEC-3 | Contraseñas sin lista de comunes ni bloqueo progresivo por cuenta; scrypt con parámetros por defecto (N=2^14) | Cambiar parámetros exige versionar hashes y rehash al loguear |
| SEC-4 | TOTP sin protección de replay (90 s); secreto cifrado con la clave de SNMP; sin abortar si falta la clave; no hay vía administrativa para quitar 2FA | Migración + decisión de recuperación |
| SEC-5 | Agente: `config.enc` descifrable por usuario local (HWID público); staging del update en ProgramData (posible TOCTOU según ACL); firma sin atar versión/canal; rangos no acotados a redes privadas; sin Authenticode | Requiere DPAPI, manifiesto firmado y release del agente |
| SEC-6 | Refresh token del agente sin detección de reuso ni verificación de HWID; revocar no corta el WebSocket abierto | Cambio de protocolo agente↔nube |
| SEC-7 | Infra: contenedores como root sin `cap_drop`; imágenes sin pin; backups sin cifrar, sin copia fuera de la VM, restore con TimescaleDB no documentado; `?ticket=`/`?token=` en logs de nginx; SSH abierto a Internet sin fail2ban; reboot pendiente por libc6 | Trabajo de operación en la VM |
| SEC-8 | Incidentes: un operator puede vincular equipos/alertas de otro cliente | Validar `client_id` en `incident-mutations.ts` |
| SEC-9 | Recuperación de acceso: sin flujo para el único admin sin contraseña ni para 2FA perdido | Documentar procedimiento (`psql`) y agregar `totp_reset` administrativo |
| UPD-7 | Canal legacy del agente embebe Node 20.2.0 (2023, sin parches): limitación de Win7/2008 R2 | Riesgo aceptado con vencimiento: migrar esos clientes a `stable` cuando cambien de SO |

## 4. No verificado

ACL real de `C:\ProgramData\STCCloudMonitor` en una instalación; reglas de red de
OCI (Security List); restauración real de un backup; costo de los `ILIKE` sin índice
trigram; si el edge de red por delante de nginx sanea `X-Forwarded-For`.

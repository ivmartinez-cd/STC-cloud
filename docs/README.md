# 🗺️ Mapa y Catálogo de Documentación - STC Cloud

Documentación del proyecto **STC Cloud**, organizada por audiencia. Todo lo listado acá fue verificado contra el código real en septiembre 2026. Lo que quedó obsoleto o superado está archivado en [`docs/old/`](old/) y no refleja el estado actual del sistema.

---

## 🚀 1. Documentos para PRESENTAR / ENTREGAR (Print-Ready HTML)
*Ubicados en `docs/cliente/`, diseñados con estilos A4. Ábralos en el navegador y presione `Ctrl + P` (con "Gráficos de fondo" activos) para exportarlos a PDF.*

### Para aceptación del cliente — un solo archivo
| Documento | Propósito |
| :--- | :--- |
| **[Documento de Aceptación Técnica y de Seguridad](cliente/STC_Documento_Aceptacion_Seguridad_v1.0.html)** `v1.0` | **El único archivo a enviar para que el área de Seguridad Informática del cliente apruebe el despliegue.** Resume en 9 páginas: cómo funciona el sistema, el diagrama general de infraestructura (agentes, impresoras, API, protocolos y puertos), la arquitectura de seguridad, el estado honesto de la última auditoría, los dos modos de despliegue y el alcance exacto de los datos recolectados — cierra con una sección de firma. Referencia el resto de los documentos de esta tabla para el detalle exhaustivo de cada tema. **ENTREGAR.** |

### Para la Gerencia de Sistemas (IT) — detalle exhaustivo
| Documento | Propósito |
| :--- | :--- |
| **[Auditoría de Sistemas e IT](cliente/STC_Auditoria_Sistemas_IT_v2.1.html)** `v2.1` | Documento ancla para IT. Controles de seguridad vigentes: red Zero-Inbound, criptografía y HWID binding, descubrimiento de impresoras, autenticación de doble token, firma Ed25519 de firmware, tráfico SNMP, acceso remoto a EWS y retención de datos. Cubre en profundidad **el agente**. |
| **[Arquitectura de la App Web](cliente/STC_Arquitectura_App_Web_v1.0.html)** `v1.0` | El complemento de la Auditoría: **portal + backend en la nube**. Despliegue, módulos, autenticación/roles/multi-cliente, base de datos, jobs, tiempo real y guardas de CI. |
| **[Análisis de Escalabilidad](cliente/STC_Analisis_Escalabilidad_Limites_v2.0.html)** `v2.0` | Cómo está hecha la infraestructura, cómo se comporta bajo carga concurrente y cómo escala a 200+ clientes y miles de equipos: sizing del servidor y camino de crecimiento. |
| **[Estándar de Arquitectura e Ingeniería](cliente/STC_Estandar_Arquitectura_Ingenieria_v1.0.html)** `v1.0` | La versión para el cliente de [`dev/ARCHITECTURE_GUIDE.md`](dev/ARCHITECTURE_GUIDE.md): qué estándar sigue el equipo, qué reglas impone y —lo que lo hace auditable— cómo las verifican las 4 guardas de CI en cada cambio. Incluye el inventario de deuda congelada y los límites de la verificación automática. |
| **[Modelo de Datos](cliente/STC_Modelo_de_Datos_v1.0.html)** `v1.0` | El esquema PostgreSQL/TimescaleDB explicado para acompañar la revisión con DBeaver: cómo leer el DER, convenciones transversales (multi-cliente, políticas de borrado, checks, índices parciales), las 35 tablas por dominio y las decisiones de diseño justificadas. Versión imprimible de [`dev/DATA_MODEL.md`](dev/DATA_MODEL.md). |

> Los cinco se presentan juntos y no se pisan entre sí: agente (Auditoría), plataforma web (Arquitectura App Web), capacidad (Escalabilidad), proceso de construcción (Estándar de Arquitectura) y base de datos (Modelo de Datos).

### Para otras audiencias
| Documento | Perfil Destinatario | Propósito |
| :--- | :--- | :--- |
| **[Dossier de Operaciones](cliente/STC_Dossier_Gerencia_Operaciones_v1.7.html)** | Gerencia de Operaciones y Contadores | Flujo de recolección de contadores, conciliación de dúplex, alertas "Just-in-Time", pedidos automáticos de insumos y prevención de fugas de facturación. **PRESENTAR.** |
| **[Comparativa HP SDS vs STC Cloud](cliente/STC_Comparativa_HP_SDS_vs_STC_Cloud_v2.0.html)** | Comercial / Gerencia | Análisis competitivo frente a HP SDS Manager. |
| **[Manual del Administrador de IT](cliente/STC_Manual_Administrador_IT_v1.5.html)** | Personal de Sistemas del Cliente | Configuración del portal, gestión de accesos y tokens, despliegue masivo, códigos de salida. **ENTREGAR.** |
| **[Requisitos del Sistema Cliente](cliente/STC_Requisitos_Sistema_Cliente_v1.6.html)** | IT del Cliente Final | Requisitos de hardware y SO, puertos, cuenta de servicio, verificación SHA-256 del instalador y directorio de datos del agente. **ENTREGAR.** |
| **[Manual de Usuario Cliente](cliente/STC_Manual_Usuario_Cliente_v1.7.html)** | Clientes Finales / Operadores | Guía visual del portal y lectura de reportes de impresión. **ENTREGAR.** |

### Referencia técnica secundaria
| Documento | Nota |
| :--- | :--- |
| **[Arquitectura del Agente](cliente/STC_Arquitectura_Agente_v1.0.html)** `v1.0` | Arquitectura del agente en tono neutro (no de auditoría): componentes, zero-inbound, HWID binding, motor de captura, persistencia y actualizaciones firmadas. Cubre el mismo terreno que la Auditoría de Sistemas — **no presentar ambos** a la misma persona. Útil para onboarding técnico. |

---

## 🔧 2. Guías de Ingeniería y Desarrollo (`docs/dev/`)
*Para desarrolladores del equipo y auditores que vayan a inspeccionar el código fuente. No son para presentación ejecutiva.*

* **[ARCHITECTURE_GUIDE.md](dev/ARCHITECTURE_GUIDE.md):** Estándar de arquitectura y convenciones **vigente** para código nuevo (capas domain/application/infrastructure/presentation, modelo de autorización por endpoint, reglas de seguridad específicas del repo). Referencia central de los ADR y del CI.
* **[CODE_MAP.md](dev/CODE_MAP.md):** Mapa de la base de código verificado contra el árbol real: agente (motor `capture/`), backend (24 módulos hexagonales + 11 jobs), portal (feature-based) y guardas de arquitectura.
* **[STC_Technical_Architecture_Guide.md](dev/STC_Technical_Architecture_Guide.md):** Deep-dive del motor de captura por modelo del agente (`identify` → `resolve` → `collect`), SQLite/WAL, doble token y Ed25519.
* **[STC_Capture_Drivers_Master_Prompt.md](dev/STC_Capture_Drivers_Master_Prompt.md):** Documento rector para agregar o mantener drivers de captura por modelo de impresora.
* **[printer_endpoints.md](dev/printer_endpoints.md):** Endpoints HTTP (EWS) y metodos SNMP de consulta directa a impresoras (Samsung, HP, Lexmark) y orden critico de deteccion para prevenir regresiones.
* **[DATA_MODEL.md](dev/DATA_MODEL.md):** Modelo de datos de la base PostgreSQL/TimescaleDB, verificado contra el esquema real: DER en Mermaid, convenciones transversales (multi-tenant, políticas de borrado, checks, índices parciales), las 35 tablas explicadas por dominio y las decisiones de diseño justificadas (para acompañar la revisión con DBeaver).
* **[PERMISSIONS_CATALOG.md](dev/PERMISSIONS_CATALOG.md):** Catálogo de rutas y permisos. **Auto-generado** — regenerar con `node cloud/scripts/check-routes.mjs --write-catalog`, no editar a mano.
* **[TECH_DEBT.md](dev/TECH_DEBT.md):** Registro vivo de deuda técnica conocida y aceptada: lo que funciona a medias, depende de un paso manual o falla en silencio. Hoy cubre los 5 gaps del pipeline de actualización remota del agente (OTA).

---

## 💼 3. Operación Interna (`docs/internos/`)

* **[DEPLOY_CLOUD.md](internos/DEPLOY_CLOUD.md):** Procedimiento de despliegue self-hosted (Docker en VPS propio) vía `deploy.sh` / `docker-compose.prod.yml`, incluido el perfil opcional de observabilidad (Prometheus + Grafana + Alertmanager) y los backups automáticos.

---

## 🔒 4. Seguridad

* **[SECURITY_AUDIT.md](../SECURITY_AUDIT.md) (raíz del proyecto):** Reporte de hardening del backend: 2FA TOTP, CSRF double-submit, RBAC de 3 roles deny-by-default, rate limiting por identidad, API keys hasheadas, protección IDOR centralizada y mitigación de XSS.
* **[data_collection_inventory.md](security/data_collection_inventory.md):** Inventario de datos que recolecta el agente y su tratamiento (cubre 2FA, API pública, acciones remotas y retención). Documento vivo, con changelog.
* **[DEPENDENCY_AUDIT_2026-09.md](security/DEPENDENCY_AUDIT_2026-09.md):** Auditoría de dependencias (`npm audit`) de backend, portal y agente, con evaluación de riesgo real y plan de acción. Incluye cómo reproducirla. Regenerar cuando cambien las dependencias.

---

## 📚 5. Referencia Técnica y Material de Terceros

* **[docs/adr/](adr/):** Architecture Decision Records — decisiones de arquitectura con su justificación (adopción de `ARCHITECTURE_GUIDE.md`, ratchets de tamaño/guards, modelo de autorización). Son registros históricos: no se reescriben, aunque citen archivos que hoy viven en `docs/old/`.
* **[docs/api/openapi.yaml](api/openapi.yaml):** Especificación OpenAPI de la API pública (verificada 1:1 contra las rutas reales).
* **[docs/pdfs/hp_sds/](pdfs/hp_sds/):** Material técnico de HP SDS Manager usado como referencia de investigación interna. Material de terceros — no redistribuir fuera del equipo.

---

## 🗑️ 6. Archivo Histórico (`docs/old/`)

Documentos que ya cumplieron su ciclo: versiones superadas, planes y roadmaps completados, auditorías puntuales ya resueltas, y documentación que describe implementaciones anteriores del sistema. **Se conservan por trazabilidad y no reflejan el estado actual.**

Los más relevantes y por qué se archivaron:

| Archivo | Motivo |
| :--- | :--- |
| `old/cliente/STC_Agente_Funcionamiento_Interno_v1.0.html` | Describe el motor de escaneo anterior (`scanner.ts`/`readDevice`), reemplazado por el motor `capture/`. |
| `old/cliente/STC_Guia_Arquitectura_Tecnica_v1.6.html` | ~95% cubierto por la Auditoría de Sistemas v2.1, con datos más viejos. |
| `old/cliente/STC_Prerrequisitos_Despliegue_v1.5.html` | Fusionado dentro de Requisitos del Sistema Cliente v1.6. |
| `old/cliente/versiones_anteriores/` | Versiones anteriores de dossiers y requisitos. |
| `old/dev/ARCHITECTURE_MIGRATION_PLAN.md` | Bitácora de la migración de arquitectura, completada el 2026-08-27. |
| `old/dev/PROJECT_GUIDELINES.md` | Convención pre-migración, reemplazada por `ARCHITECTURE_GUIDE.md`. |
| `old/dev/ANTIGRAVITY_SKILLS.md` | Sus 3 reglas útiles se fusionaron en `ARCHITECTURE_GUIDE.md` §8; el resto no tenía valor operativo. |
| `old/dev/PRINTER_COUNTER_METHODS.md` | Nota de investigación pre-implementación (snippets en C#); el sistema real lo documenta `STC_Technical_Architecture_Guide.md`. |
| `old/dev/STC_Gap_Analysis_vs_HP_SDS_2026-08.md` | Análisis competitivo cuyas 20 fases figuran completas; bitácora histórica. |
| `old/dev/WIKI_CATALOGUE.json` | Config huérfana de una herramienta que no está en el repo. |
| `old/internos/PROD_READINESS_GUIDE.md` | Checklist de mayo con claims ya falsos (intervalos y almacenamiento del agente). |
| `old/internos/ESTRATEGIA_INSTALADOR.md` | Roadmap del instalador, ya construido (`installer/`). |
| `old/internos/CLIENT_VALUE_PROPOSITION.md` | Material comercial cubierto por la Comparativa HP SDS y el Dossier de Operaciones. |
| `old/security/agent_audit.md`, `frontend_audit.md` | Snapshots de mayo cuyos hallazgos ya están corregidos y que describen una estructura de código inexistente. |
| `old/security/VULNERABILITY_REPORT_v1.5.md` | Snapshot de `npm audit` de mayo; para uno vigente hay que regenerarlo. |
| `old/AUDIT_DOSSIER.md` | Resumen con links rotos y la cascada de descubrimiento en orden incorrecto; consolidado en los HTML de `docs/cliente/`. |

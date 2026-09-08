# 🗺️ Mapa y Catálogo de Documentación - STC Cloud

Este directorio contiene la documentación unificada del proyecto **STC Cloud**, organizada por perfiles y propósitos. Utilice este índice para saber qué documentos presentar a gerencia, cuáles son de referencia de desarrollo y cuáles quedaron archivados.

---

## 🚀 1. Documentos Principales para PRESENTAR (Print-Ready HTML)
*Estos documentos están ubicados en `docs/cliente/` y han sido diseñados con estilos A4 premium. Ábralos en su navegador y presione `Ctrl + P` (con "Gráficos de fondo" activos) para exportarlos a PDF corporativos impecables.*

| Documento | Perfil Destinatario | Propósito del Informe | Estado / Versión |
| :--- | :--- | :--- | :--- |
| **[Dossier de Operaciones](cliente/STC_Dossier_Gerencia_Operaciones_v1.7.html)** | **Gerente de Operaciones y Contadores** | Explicación comercial del flujo de recolección de contadores, conciliación de dúplex, alertas "Just-in-Time" y prevención de fugas de facturación. **PRESENTAR.** | `v1.7` (Última) |
| **[Auditoría de Sistemas e IT](cliente/STC_Auditoria_Sistemas_IT_v1.7.html)** | **Gerente de Sistemas (IT) y Auditor** | Demostración técnica de seguridad de red (Zero-Inbound), HWID binding, cascada de descubrimiento, motor EWS, SQLite local, tokens y firma digital Ed25519 de firmware — cubre en profundidad el **agente**. **PRESENTAR.** | `v1.7` (Última) |
| **[Arquitectura de la App Web](cliente/STC_Arquitectura_App_Web_v1.0.html)** | **Gerente de Sistemas (IT)** | Visión de arquitectura del portal y el backend en la nube: despliegue, módulos, autenticación/roles/multi-cliente, base de datos, jobs, tiempo real y calidad de CI — el complemento de la Auditoría para cubrir la **app web**, que la Auditoría no trata. **PRESENTAR junto con la Auditoría de Sistemas.** | `v1.0` (Nueva) |
| **[Análisis de Escalabilidad y Límites](cliente/STC_Analisis_Escalabilidad_Limites_v1.7.html)** | **IT, Sistemas y Operaciones** | Auditoría de capacidad real (self-hosted en VPS propio vía Docker) pensada para 200+ clientes: sizing de servidor y hallazgos de código priorizados. **PRESENTAR.** | `v1.7` (Última) |
| **[Manual del Administrador de IT](cliente/STC_Manual_Administrador_IT_v1.5.html)** | **Personal de Sistemas del Cliente** | Guía de configuración del portal, gestión de accesos, tokens y monitorización. **ENTREGAR.** | `v1.5` (Activo) |
| **[Requisitos del Sistema Cliente](cliente/STC_Requisitos_Sistema_Cliente_v1.6.html)** | **IT del Cliente Final** | Requisitos mínimos de hardware y sistemas operativos para instalar el agente DCA local. **ENTREGAR.** | `v1.6` (Activo) |
| **[Prerrequisitos de Despliegue de Red](cliente/STC_Prerrequisitos_Despliegue_v1.5.html)** | **SysAdmins / NetEngineers** | Puertos WAN requeridos (443 outbound) y permisos locales en la intranet. **ENTREGAR.** | `v1.5` (Activo) |
| **[Manual de Usuario Cliente](cliente/STC_Manual_Usuario_Cliente_v1.6.html)** | **Clientes Finales / Operadores** | Guía de uso visual de la interfaz del portal y lectura de reportes de impresión. **ENTREGAR.** | `v1.6` (Activo) |
| **[Arquitectura del Agente](cliente/STC_Arquitectura_Agente_v1.0.html)** | **Referencia (Ingeniería / onboarding)** | Visión de arquitectura del agente en tono neutro (no de auditoría): componentes, red zero-inbound, HWID binding, descubrimiento, persistencia y actualizaciones firmadas. Cubre el mismo terreno que la Auditoría de Sistemas — **no presentar los dos juntos** a la misma persona, son la misma info narrada distinto. Útil para onboarding técnico o como referencia sin el framing de "auditoría". | `v1.0` |
| **[Funcionamiento Interno del Agente](cliente/STC_Agente_Funcionamiento_Interno_v1.0.html)** | **Ingeniería / IT avanzado** | Deep-dive de implementación del agente: ciclo de vida, cascada de descubrimiento, motor EWS, parsers por fabricante, SQLite y sincronización. | `v1.0` |
| **[Guía Técnica de Arquitectura](cliente/STC_Guia_Arquitectura_Tecnica_v1.6.html)** | **Ingeniería / IT avanzado** | Deep-dive técnico de red, HWID binding, motor EWS, almacenamiento, auth y firma de firmware. | `v1.6` |
| **[Comparativa HP SDS vs STC Cloud](cliente/STC_Comparativa_HP_SDS_vs_STC_Cloud_v1.0.html)** | **Comercial / Gerencia** | Comparativa competitiva orientada a venta. | `v1.0` |

---

## 🛡️ 2. Reportes de Respaldo e Integridad (Formatos Markdown)
*Documentos internos en Markdown muy útiles como lectura técnica intermedia, para adjuntar en correos o consultas rápidas.*

* **[AUDIT_DOSSIER.md](AUDIT_DOSSIER.md):** *Dossier de Auditoría Unificado*. Resumen condensado de las secciones de operaciones y sistemas. Incluye las mitigaciones de red (timeouts nativos de 65s) recientemente implementadas.
* **[SECURITY_AUDIT.md](../SECURITY_AUDIT.md) (en la raíz del proyecto):** *Reporte de Hardening y Ciberseguridad*. Contiene las directivas de seguridad aplicadas al backend Fastify y la base de datos (protección IDOR, rate-limiting, mitigación de XSS).

---

## 🔧 3. Guías de Ingeniería y Desarrollo (`docs/dev/`)
*Exclusivos para ingenieros de software, desarrolladores del equipo o auditores que vayan a inspeccionar el código fuente. No son para presentación ejecutiva.*

* **[ARCHITECTURE_GUIDE.md](dev/ARCHITECTURE_GUIDE.md):** Estándar de arquitectura y convenciones de código **vigente** para código nuevo (capas domain/application/infrastructure/presentation). Referencia central de `docs/adr/001-adoptar-architecture-guide.md`.
* **[CODE_MAP.md](dev/CODE_MAP.md):** Mapeo de la base de código. Ubicación de controladores, middleware, servicios y esquemas.
* **[PERMISSIONS_CATALOG.md](dev/PERMISSIONS_CATALOG.md):** Catálogo de rutas y permisos, auto-generado por `check-routes.mjs --write-catalog`.
* **[ANTIGRAVITY_SKILLS.md](dev/ANTIGRAVITY_SKILLS.md):** Reglas estrictas de calidad de código y TypeScript del equipo. **Debe ser actualizado al añadir nuevas directivas.**
* **[STC_Technical_Architecture_Guide.md](dev/STC_Technical_Architecture_Guide.md):** Guía de arquitectura profunda (algoritmos de barrido EWS, pings, socket y control frames).
* **[PRINTER_COUNTER_METHODS.md](dev/PRINTER_COUNTER_METHODS.md):** Detalle técnico de extracción de contadores por marca y protocolo (Samsung, HP, Ricoh, Lexmark).
* **[STC_Gap_Analysis_vs_HP_SDS_2026-08.md](dev/STC_Gap_Analysis_vs_HP_SDS_2026-08.md):** Análisis competitivo interno de brechas frente a HP SDS Manager, con hallazgos citados a `archivo:línea`. **Uso interno de ingeniería/producto** — no es material de presentación.
* **[STC_Auditor_Master_Prompt.md](dev/STC_Auditor_Master_Prompt.md)** / **[STC_Capture_Drivers_Master_Prompt.md](dev/STC_Capture_Drivers_Master_Prompt.md):** Prompts maestros para alimentar a un modelo de IA en tareas de auditoría y mantenimiento de los drivers de captura. Son instrucciones para IA, no documentación de producto.
* **[WIKI_CATALOGUE.json](dev/WIKI_CATALOGUE.json):** Catálogo/config de una herramienta interna de generación de wiki (algunas rutas referenciadas están desactualizadas).

---

## 💼 4. Manuales Operativos Internos y Negocio (`docs/internos/`)
*Guías internas de despliegue comercial y configuración técnica del entorno en la nube.*

* **[DEPLOY_CLOUD.md](internos/DEPLOY_CLOUD.md):** Procedimiento para desplegar la base de datos (Postgres/TimescaleDB self-hosted), backend y portal frontend, todo en el VPS propio (self-hosted, Docker) vía `deploy.sh` / `docker-compose.prod.yml`.
* **[PROD_READINESS_GUIDE.md](internos/PROD_READINESS_GUIDE.md):** Lista de chequeo previa al lanzamiento a producción.
* **[CLIENT_VALUE_PROPOSITION.md](internos/CLIENT_VALUE_PROPOSITION.md):** Argumentos comerciales de venta y valor del software para clientes.
* **[ESTRATEGIA_INSTALADOR.md](internos/ESTRATEGIA_INSTALADOR.md):** Brainstorming y roadmap del instalador profesional del agente.

---

## 🔒 5. Auditorías de Seguridad Estática (`docs/security/`)
*Análisis profundos de vulnerabilidades realizados por el equipo de ciberseguridad sobre el código fuente:*
* **[agent_audit.md](security/agent_audit.md):** Análisis de seguridad del agente empaquetado.
* **[frontend_audit.md](security/frontend_audit.md):** Análisis del portal (React + Vite).
* **[data_collection_inventory.md](security/data_collection_inventory.md):** Inventario de datos recolectados por el agente y su tratamiento.
* **[VULNERABILITY_REPORT_v1.5.md](security/VULNERABILITY_REPORT_v1.5.md):** Matriz estática de riesgos iniciales corregidos.

---

## 📚 6. Referencia Técnica y Material de Terceros

* **[docs/adr/](adr/):** Architecture Decision Records — decisiones de arquitectura con su justificación (adopción de `ARCHITECTURE_GUIDE.md`, ratchets de tamaño/guards, modelo de autorización). Son registros históricos: no se reescriben, aunque citen archivos que hoy viven en `docs/old/`.
* **[docs/api/openapi.yaml](api/openapi.yaml):** Especificación OpenAPI de la API del backend.
* **[docs/pdfs/hp_sds/](pdfs/hp_sds/):** Material técnico público de HP SDS Manager (competidor), usado como referencia de investigación interna. Material de terceros — no redistribuir fuera del equipo.

---

## 🗑️ 7. Archivos Históricos u Obsoletos (`docs/old/`)
*Documentos que ya cumplieron su ciclo de vida: versiones superadas, planes de migración cerrados, informes de incidentes puntuales ya resueltos, o material consolidado en documentos más nuevos. Se conservan por trazabilidad, pero no reflejan el estado actual del proyecto.*

* `old/cliente/STC_Conclusion_Ejecutiva_v1.5.html`, `STC_Data_Collection_Inventory_v1.5.html`, `STC_Manifiesto_Seguridad_v1.5.html`: consolidados en `cliente/STC_Auditoria_Sistemas_IT_v1.7.html`.
* `old/cliente/versiones_anteriores/`: versiones anteriores de los dossiers técnicos y de requisitos.
* `old/dev/PROJECT_GUIDELINES.md`: convención de estructura pre-migración, reemplazada por `dev/ARCHITECTURE_GUIDE.md`.
* `old/dev/ARCHITECTURE_MIGRATION_PLAN.md`: bitácora de la migración de arquitectura (Fases 0-5), completada el 2026-08-27.
* `old/dev/STC_Feature_Scheduler_IPRanges_Master_Prompt.md`: prompt de una feature que terminó implementada con un diseño distinto (auto-marcado "histórico/superado" en el propio archivo).
* `old/dev/EWS_SCANNER_AUDIT.md`, `old/dev/STC_Codebase_Audit_Report.md`, `old/dev/STC_System_Requirements_Spec.md`: auditorías/specs tempranas (mayo 2026), superadas por documentación más reciente y detallada.
* `old/dev/samsung_counters_investigation_report.md`: informe de un incidente puntual de un cliente específico, ya resuelto.
* `old/internos/GEMINI_BRIEFING.md`: resumen de cambios de una sesión de trabajo puntual, no una guía viva.
* `old/pdfs/stc/`: PDFs de requisitos y white paper de STC Cloud, superados por los documentos HTML de `docs/cliente/`.
* `old/metodos_extraccion_contadores.md`: consolidado y expandido en `dev/PRINTER_COUNTER_METHODS.md`.
* `old/prompt_senior_dev_toner.md`: borrador de desarrollo inicial del scanner de tóner.

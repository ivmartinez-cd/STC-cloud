# 🗺️ Mapa y Catálogo de Documentación - STC Cloud

Este directorio contiene la documentación unificada del proyecto **STC Cloud**, organizada por perfiles y propósitos. Utilice este índice para saber qué documentos presentar a gerencia, cuáles archivar y cuáles sirven como referencias de desarrollo.

---

## 🚀 1. Documentos Principales para PRESENTAR (Print-Ready HTML)
*Estos documentos están ubicados en `docs/cliente/` y han sido diseñados con estilos A4 premium. Ábralos en su navegador y presione `Ctrl + P` (con "Gráficos de fondo" activos) para exportarlos a PDF corporativos impecables.*

| Documento | Perfil Destinatario | Propósito del Informe | Estado / Versión |
| :--- | :--- | :--- | :--- |
| **[Dossier de Operaciones](cliente/STC_Dossier_Gerencia_Operaciones_v1.7.html)** | **Gerente de Operaciones y Contadores** | Explicación comercial del flujo de recolección de contadores, conciliación de dúplex, alertas "Just-in-Time" y prevención de fugas de facturación. **PRESENTAR.** | `v1.7` (Última) |
| **[Auditoría de Sistemas e IT](cliente/STC_Auditoria_Sistemas_IT_v1.7.html)** | **Gerente de Sistemas (IT) y Auditor** | Demostración técnica de seguridad de red (Zero-Inbound), firma digital Ed25519 de firmware, cifrado de HWID (AES-256-GCM) e integridad de código. **PRESENTAR.** | `v1.7` (Última) |
| **[Análisis de Escalabilidad y Límites](cliente/STC_Analisis_Escalabilidad_Limites_v1.7.html)** | **IT, Sistemas y Operaciones** | Auditoría de capacidad real (self-hosted en VPS propio vía Docker) pensada para 200+ clientes: sizing de servidor y hallazgos de código priorizados. **PRESENTAR.** | `v1.7` (Última) |
| **[Manual del Administrador de IT](cliente/STC_Manual_Administrador_IT_v1.5.html)** | **Personal de Sistemas del Cliente** | Guía de configuración del portal, gestión de accesos, tokens y monitorización. **ENTREGAR.** | `v1.5` (Activo) |
| **[Requisitos del Sistema Cliente](cliente/STC_Requisitos_Sistema_Cliente_v1.6.html)** | **IT del Cliente Final** | Requisitos mínimos de hardware y sistemas operativos para instalar el agente DCA local. **ENTREGAR.** | `v1.6` (Activo) |
| **[Prerrequisitos de Despliegue de Red](cliente/STC_Prerrequisitos_Despliegue_v1.5.html)** | **SysAdmins / NetEngineers** | Puertos WAN requeridos (443 outbound) y permisos locales en la intranet. **ENTREGAR.** | `v1.5` (Activo) |
| **[Manual de Usuario Cliente](cliente/STC_Manual_Usuario_Cliente_v1.6.html)** | **Clientes Finales / Operadores** | Guía de uso visual de la interfaz del portal y lectura de reportes de impresión. **ENTREGAR.** | `v1.6` (Activo) |

---

## 🛡️ 2. Reportes de Respaldo e Integridad (Formatos Markdown)
*Documentos internos en Markdown muy útiles como lectura técnica intermedia, para adjuntar en correos o consultas rápidas.*

* **[AUDIT_DOSSIER.md](AUDIT_DOSSIER.md):** *Dossier de Auditoría Unificado*. Resumen condensado de las secciones de operaciones y sistemas. Incluye las mitigaciones de red (timeouts nativos de 65s) recientemente implementadas.
* **[SECURITY_AUDIT.md](../SECURITY_AUDIT.md) (en la raíz del proyecto):** *Reporte de Hardening y Ciberseguridad*. Contiene las directivas de seguridad aplicadas al backend Fastify y la base de datos (protección IDOR, rate-limiting, mitigación de XSS).

---

## 🔧 3. Guías de Ingeniería y Desarrollo (`docs/dev/`)
*Exclusivos para ingenieros de software, desarrolladores del equipo o auditores que vayan a inspeccionar el código fuente. No son para presentación ejecutiva.*

* **[CODE_MAP.md](dev/CODE_MAP.md):** Mapeo de la base de código. Ubicación de controladores, middleware, servicios y esquemas.
* **[ANTIGRAVITY_SKILLS.md](dev/ANTIGRAVITY_SKILLS.md):** Reglas estrictas de calidad de código y TypeScript del equipo. **Debe ser actualizado al añadir nuevas directivas.**
* **[STC_Technical_Architecture_Guide.md](dev/STC_Technical_Architecture_Guide.md):** Guía de arquitectura profunda (algoritmos de barrido EWS, pings, socket y control frames).
* **[PRINTER_COUNTER_METHODS.md](dev/PRINTER_COUNTER_METHODS.md):** Detalle técnico de extracción de contadores por marca y protocolo (Samsung, HP, Ricoh, Lexmark).

---

## 💼 4. Manuales Operativos Internos y Negocio (`docs/internos/`)
*Guías internas de despliegue comercial y configuración técnica del entorno en la nube.*

* **[DEPLOY_CLOUD.md](internos/DEPLOY_CLOUD.md):** Procedimiento para desplegar la base de datos (Postgres/TimescaleDB self-hosted), backend y portal frontend, todo en el VPS propio (self-hosted, Docker) vía `deploy.sh` / `docker-compose.prod.yml`.
* **[PROD_READINESS_GUIDE.md](internos/PROD_READINESS_GUIDE.md):** Lista de chequeo previa al lanzamiento a producción.
* **[CLIENT_VALUE_PROPOSITION.md](internos/CLIENT_VALUE_PROPOSITION.md):** Argumentos comerciales de venta y valor del software para clientes.

---

## 🔒 5. Auditorías de Seguridad Estática (`docs/security/`)
*Análisis profundos de vulnerabilidades realizados por el equipo de ciberseguridad sobre el código fuente:*
* **[agent_audit.md](security/agent_audit.md):** Análisis de seguridad del agente empaquetado.
* **[frontend_audit.md](security/frontend_audit.md):** Análisis del portal (React + Vite).
* **[VULNERABILITY_REPORT_v1.5.md](security/VULNERABILITY_REPORT_v1.5.md):** Matriz estática de riesgos iniciales corregidos.

---

## 🗑️ 6. Archivos Históricos u Obsoletos (Para archivar o ignorar)
*Estos archivos han cumplido su ciclo de vida y ya no representan el estado actual o han sido consolidados en documentos superiores.*

* `docs/metodos_extraccion_contadores.md` (raíz): **OBSOLETO**. Consolidado y expandido con mayor detalle técnico en `docs/dev/PRINTER_COUNTER_METHODS.md`.
* `docs/prompt_senior_dev_toner.md`: **OBSOLETO**. Borrador de desarrollo inicial para el scanner de tóner.
* `docs/cliente/STC_Conclusion_Ejecutiva_v1.5.html`, `STC_Data_Collection_Inventory_v1.5.html`, `STC_Manifiesto_Seguridad_v1.5.html`: **OBSOLETOS**. Consolidados de forma unificada en el dossier de auditoría premium `STC_Auditoria_Sistemas_IT_v1.7.html`.

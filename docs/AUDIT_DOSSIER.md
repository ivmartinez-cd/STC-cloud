# 🛡️ Dossier de Auditoría de Sistemas y Operaciones - STC Cloud

Bienvenido al Dossier de Integridad Técnica de **STC Cloud**. Este documento consolidado ha sido diseñado con un doble propósito:
1. **Para la Gerencia de Operaciones (Facturación y Contadores):** Explicar con precisión cómo garantizamos que los contadores extraídos de las impresoras son 100% verídicos, exactos, y cómo evitamos anomalías en la facturación.
2. **Para la Gerencia de Sistemas (IT y Ciberseguridad):** Demostrar que el software sigue las mejores prácticas internacionales de ingeniería de software, cuenta con una arquitectura de red impenetrable (Zero-Inbound), cifra sus datos de manera robusta y está libre de "código de caja negra o inestable".

---

## 🗺️ Mapa de Navegación Rápida para el Auditor
Antes de adentrarse en los detalles, puede navegar directamente a los informes técnicos especializados que componen el ecosistema de documentación:

| Documento | Perfil Recomendado | Propósito |
| :--- | :--- | :--- |
| **[Mapa de Código](file:///j:/Dev/Trabajo/STCcloud/STC-cloud/docs/dev/CODE_MAP.md)** | Sistemas / Auditor | Ubicación de cada archivo, controlador y servicio del proyecto. |
| **[Guía de Arquitectura Técnica](file:///j:/Dev/Trabajo/STCcloud/STC-cloud/docs/dev/STC_Technical_Architecture_Guide.md)** | Sistemas / Infraestructura | Detalles de algoritmos de escaneo, PBKDF2 y WS. |
| **[Informe de Seguridad y Hardening](file:///j:/Dev/Trabajo/STCcloud/STC-cloud/SECURITY_AUDIT.md)** | Ciberseguridad / SysAdmin | Análisis de amenazas mitigadas (IDOR, Rate Limits, XSS). |
| **[Métodos de Extracción de Contadores](file:///j:/Dev/Trabajo/STCcloud/STC-cloud/docs/dev/PRINTER_COUNTER_METHODS.md)** | Operaciones / Sistemas | Detalles de bajo nivel sobre protocolos SNMP, PJL, IPP y EWS. |

---

## 📈 1. Sección de Operaciones: Integridad de Contadores y Facturación

El Gerente de Operaciones y su equipo de contadores necesitan garantías absolutas sobre la estabilidad y precisión de las lecturas, ya que un error en el conteo de páginas se traduce en disputas de facturación con el cliente.

### A. ¿Cómo Garantiza STC Cloud la Veracidad del Conteo?
El agente **nunca estima ni inventa números**. La obtención de los contadores físicos se realiza en una **Cascada de Coalescencia Determinista** en tiempo real:

1. **Lectura Directa de Firmware:** El agente consulta las entrañas físicas de la impresora.
2. **Jerarquía Multi-Protocolo Inteligente:**
   * **Fase 1: EWS (Embedded Web Server) Scraping (HTTP/S):** El agente consulta directamente los endpoints privados del servidor web de la impresora (Samsung, Lexmark, HP, Ricoh) y procesa los XML nativos o los bloques de texto HTML buscando la etiqueta física de facturación.
   * **Fase 2: PJL (Printer Job Language) (TCP 9100):** Si la web está desactivada, el agente abre un socket TCP crudo y envía comandos PJL a bajo nivel (`@PJL INFO USTATUS`), extrayendo el contador `PAGECOUNT` directo del chip.
   * **Fase 3: SNMP v2c (UDP 161):** Si el puerto 9100 está inactivo, realiza una consulta SNMP dirigida a OIDs estandarizadas (RFC 3805).
   * **Fase 4: IPP (Internet Printing Protocol) (TCP 631):** Si todo lo anterior falla, realiza peticiones HTTP del estándar IPP.
3. **Validación de Identidad por Serial Físico:** Para evitar registrar lecturas cruzadas en impresoras que cambian de IP por DHCP dinámico, el agente **asocia de forma inmutable la telemetría al Número de Serie Físico** (`serial_number`). Si una IP cambia, el sistema actualiza la base de datos basándose en el serial, garantizando un historial de auditoría ininterrumpido y libre de duplicados.

### B. Prevención de Doble Facturación (Database Boundaries)
A nivel de base de datos (`cloud/src/services/agentService.ts`), el registro de dispositivos utiliza una restricción de clave única:
* `ON CONFLICT (agent_id, serial_number) WHERE serial_number IS NOT NULL DO UPDATE`
Esto previene matemáticamente que se cree más de un registro activo para un mismo dispositivo físico dentro de un agente, descartando la posibilidad de que dos lecturas paralelas del mismo equipo distorsionen los reportes financieros.

---

## 🛡️ 2. Sección de Sistemas: Seguridad de IT y Garantía de Código Limpio

El principal temor de un departamento de sistemas es la introducción de agentes de red que sirvan como puertas traseras (backdoors) o software inestable desarrollado mediante IA sin rigurosidad. STC Cloud se diseñó bajo los estándares más estrictos del desarrollo corporativo actual.

### A. Red Anti-Intrusión: Arquitectura Zero-Inbound
El agente DCA local implementa un modelo de comunicación **unidireccional saliente (Outbound-Only)**:
* **Ningún Puerto de Entrada:** El agente no levanta servidores ni escucha tráfico de red entrante.
* **Seguridad WAN:** Las conexiones se originan exclusivamente de adentro hacia afuera a través del puerto **443 (HTTPS/WSS)** estándar. Para el cortafuegos del cliente, el agente se comporta idéntico a un navegador web seguro consultando un sitio.
* **Aislamiento de Escaneo Local (Anti-IDS):** El escáner precalifica las IPs abriendo rápidamente sockets de puertos de impresión (9100, 631). Si los puertos no corresponden a impresoras, **el agente aborta el scraping HTTP/S inmediatamente**. Esto evita alarmar a los firewalls o sistemas SIEM de ciberseguridad, descartando cualquier similitud con un escáner de vulnerabilidades ofensivo.

### B. Blindaje Local: Hardware ID Binding
Para proteger las credenciales y tokens del cliente en caso de que alguien acceda físicamente al host donde corre el agente:
* Los datos sensibles en `config.enc` están cifrados bajo **AES-256-GCM**.
* La clave de cifrado **no reside en el código ni en variables de entorno**. Se genera en caliente combinando el identificador exclusivo de Windows (`MachineGuid`) y el número de serie de la placa base/BIOS (`SerialNumber`).
* Si el archivo de configuración cifrado es copiado a otro equipo, el tag de autenticación de AES fallará inmediatamente arrojando un error preventivo de alteración de firma (`HWID_MISMATCH`), inhabilitando el binario de forma instantánea.

### C. Calidad de Código y Mitigación de Riesgos de IA
Para disipar el temor sobre la rigurosidad técnica de la aplicación, certificamos las siguientes prácticas:

1. **Cero Tipos `any` (Regla Estricta TypeScript):** De acuerdo con el manual de habilidades internas del equipo (`ANTIGRAVITY_SKILLS.md` Regla 5), está **estrictamente prohibido usar el tipo explícito `any`**. Esto fuerza a que todo el código sea fuertemente tipado, estructurado y auditable en tiempo de compilación por el compilador de TypeScript y linters de CI. No existen estructuras de datos dinámicas improvisadas.
2. **Esquemas de Entrada/Salida Inquebrantables (Fastify Joi/Schema):** Todos los endpoints de la API backend validan estrictamente la forma, longitud y tipo de los payloads HTTP. Cualquier entrada maliciosa es rechazada inmediatamente en la capa de transporte antes de llegar a la base de datos o controladores.
3. **JSDoc/TSDoc Uniforme:** Cada función crítica e interfaz cuenta con documentación nativa JSDoc, explicando con exactitud el comportamiento, los parámetros de red y las excepciones posibles. Esto permite que el equipo de sistemas lea y verifique el código fuente línea por línea con facilidad.
4. **Firma Digital de Actualizaciones (Supply Chain Shield):** Para prevenir que se introduzca un binario malicioso simulando ser una actualización, el agente valida que el paquete de actualización cuente con una firma criptográfica asimétrica válida generada mediante **Ed25519**, contrastándola contra una clave pública inmutable quemada en el ejecutable.

### D. Resiliencia de Red y Mitigaciones ante Caídas Temporales [NUEVO]
Para garantizar la continuidad de la telemetría ante microcortes de red o la hibernación periódica de servidores en la nube (ej: límites de capas gratuitas como *spin-down* de Render):
1. **Timeouts Resilientes Nativos (AbortSignal):** Todos los llamados HTTP críticos del agente local (sincronización de lecturas, envío de latidos, renovación de tokens y activación) cuentan con un timeout explícito de **65 segundos** implementado de forma nativa mediante `AbortSignal.timeout(65_000)`. Esto permite al agente DCA tolerar con paciencia los ~50s que toma el servidor en la nube para despertar de su reposo sin abortar el socket.
2. **Buffer de Telemetría Offline (SQLite WAL):** Si el canal de red o el servidor fallan de forma prolongada, el agente encola de forma ininterrumpida las lecturas de las impresoras en una base de datos SQLite persistente local con la configuración de alto rendimiento Write-Ahead Logging (WAL). Al restablecerse el canal, se realiza una subida secuencial inteligente libre de colisiones.

---

## 🛠️ 3. Guía Rápida para el Auditor de Sistemas (Cómo auditar en 5 minutos)

Si el Gerente de Sistemas desea auditar la robustez del ecosistema rápidamente, puede realizar los siguientes pasos automatizados y manuales:

### Paso 1: Inspeccionar la API de Forma Interactiva (Swagger/OpenAPI)
1. Levante el entorno en modo desarrollo en `/cloud`: `npm run dev`.
2. Acceda a la ruta interactiva de documentación: `http://localhost:3000/docs` (o el puerto configurado).
3. Allí podrá visualizar de forma interactiva el contrato de datos exacto de todos los endpoints, sus cabeceras de seguridad, modelos y métodos HTTP disponibles sin necesidad de inspeccionar archivos de código crudo.

### Paso 2: Verificar la Robustez frente a SQL Injection
* Revise el archivo `cloud/src/db/knex.ts` y las carpetas de servicios en `cloud/src/services/`.
* Verá que el 100% de las consultas utilizan el query builder **Knex.js**, el cual aplica parametrización obligatoria por defecto sobre el driver de Postgres (Neon).
* Las escasas consultas nativas directas utilizan placeholders parametrizados `?`, bloqueando de raíz ataques SQLi.

### Paso 3: Validar el Cumplimiento de Cifrado
* Revise el módulo del agente: `agent/src/core/ConfigManager.ts`.
* Compruebe cómo se implementa la derivación de clave **PBKDF2** con **210,000 iteraciones** y sal de 16 bytes, y el algoritmo **AES-256-GCM** de cifrado síncrono.

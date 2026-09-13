# ADR-005: Traer el parque de Siges por wsAyC, no por ORION, para compararlo contra lo que reporta STC Cloud

## Estado: Propuesto

Investigado y documentado el 12/09/2026, a la espera de que Iván lo habilite en una reunión
antes de implementarse. Nada de lo que describe este documento existe todavía en el código
(ni la migración, ni el módulo, ni las rutas).

## Contexto

STC Cloud sólo conoce las impresoras que su propio agente descubre por SNMP. No tiene forma
de saber qué equipos **debería** estar monitoreando por cliente — ese dato vive en Siges, el
ERP legacy de Canal Directo. Iván pidió traer la conexión que la app hermana
`helpdesk-manager` usa para consultar Siges, con el objetivo de: (1) traer las impresoras
que Siges dice que están asignadas a un cliente, (2) mostrarlas en el portal, y (3) marcar
cuáles de ellas están reportando en STC Cloud y cuáles no.

## Decisión: wsAyC (SOAP), no ORION (SQL Server)

`helpdesk-manager` (repo hermano — no forma parte de este repo, así que las rutas de abajo
son de ese otro checkout, no de éste) consulta Siges por dos vías — ver ahí
`docs/adr/039-siges-desde-orion-en-vez-de-mercurio.md` y `docs/INTEGRACIONES_EXTERNAS.md`:

- **ORION** (`reportes.cdsa.com.ar`, SQL Server, réplica de solo lectura de la base `Siges`,
  cuenta `SiGesReadOnly`). Es lo que "usa helpdesk-manager" en el sentido que probablemente
  tenía en mente el pedido original.
- **wsAyC** (`https://wsg.cdsisa.com.ar/wsAyC_server.php`), el SOAP de Canal Directo que
  `helpdesk-manager` ya consume para insumos y liquidaciones.

**ORION vive en la LAN corporativa** (`192.168.176.21`, confirmado por DNS interno el
12/09/2026: `orion.cdsa.com.ar` / `reportes.cdsa.com.ar` resuelven ahí). La VM de producción
de STC Cloud es una instancia Oracle Cloud con IP pública `146.181.19.111` (sin VPN a la LAN
corporativa; esa IP es la misma que usan `installer/publish-release.sh:18-20` y el acceso
SSH operativo del equipo) — **no tiene ruta a esa red interna**. Y es justo en esa VM donde
ya existe en producción el primer usuario `client_viewer` real (cliente ISSN) — el mismo rol
para el que Iván quiere esta pantalla. Montar la integración sobre ORION la dejaría
funcionando en desarrollo (esta máquina sí resuelve esa IP) pero rota en el único entorno de
producción que existe hoy.

**wsAyC es alcanzable por internet** (detrás de Cloudflare, sin VPN) y **no exige
credenciales propias** — helpdesk-manager no configura usuario/contraseña para él, sólo la
URL del WSDL. Eso resuelve el problema de red y además evita meter un driver de SQL Server
(`mssql`/`tedious`, o el equivalente del `pyodbc` + ODBC Driver 18 que usa el Python de
enfrente) en la imagen Docker del backend de STC Cloud, que hoy no tiene ninguna dependencia
de ese tipo.

### Verificado en vivo el 12/09/2026 (llamadas de sólo lectura, sin tocar nada)

El WSDL público (`https://wsg.cdsisa.com.ar/wsAyC_server.php?wsdl`) declara operaciones que
`helpdesk-manager` nunca usa pero que sirven exactamente para esto:

- **`getTopMachines(IdEmpresa, IdSucursal, IdSector, IdCentroDeCostos, IdRubro, OrderBy, Top,
  IdPrestador)`** — el parque de equipos de una empresa (cliente), filtrable por rubro.
- **`getEmpresas(usuario_id)`** — el padrón completo de empresas de Canal Directo (`id` +
  `Nombre`). Probado con `usuario_id` vacío: devuelve las **468 empresas**. `ISSN` aparece
  con **`id=879`**.

Probado contra `IdEmpresa=879` (ISSN), `IdRubro=4` ("Impresoras"), `Top=3000`:

- **165 equipos**, 95 KB de respuesta, **0,25 segundos**.
- Estados devueltos: 142 "Activa en Cliente", 15 "Baja Solicitada", 5 "Backup", 3 "Backup
  Fijo". Catálogo completo vía `getMachineStatuses` (sin parámetros): 14 estados, id→nombre
  (`2` = "De Baja", `8` = "Backup Fijo" — los dos que el legacy excluye del parque activo,
  según `SIGES_READONLY_CATALOGO_DATOS.md` de `helpdesk-manager`).
- Todos los equipos de ISSN con `IdRubro=4` vinieron con prefijo `MFP` en `ArtGen`
  (`"MFP Mono Samsung SL-M5370LX"`, etc.) — consistente con que `Rubro=4` mezcla impresoras
  reales con `PrintBox` (cajas de monitoreo), así que además del rubro hace falta filtrar por
  prefijo `PRT `/`MFP ` de `ArtGen` (mismo criterio que usa el módulo `preventivos` de
  helpdesk-manager).
- **Los seriales matchean 1:1 entre sistemas** con normalización `upper(trim())`: el serial
  `CNB1R4C0KK` está en Siges asignado a ISSN (empresa 879) y **existe en la base de
  desarrollo de STC Cloud** — pero bajo el cliente `"Cliente de Prueba"`, en estado
  `pending`. Es exactamente el tipo de desfasaje ("Siges dice que es de este cliente, STC
  Cloud no lo tiene reportando para ese cliente") que esta pantalla tiene que sacar a la
  luz.
- Forma de la respuesta: cada operación de lectura devuelve un **string con JSON adentro**
  (no XML tipado), ej. `getTopMachines` → `[{"Machine":{"id":"32595","NroSerie":"...",
  "empresa_id":"706","Estado":"Activa en Cliente","ArtGen":"PRT Mono Samsung SL-M4020ND",
  "Sucursal":"...", ...}}, ...]`.
- **`Top` vacío devuelve 0 filas**, no "todas" — probado explícitamente. Siempre hay que
  mandar un techo (3000 alcanza sobrado para cualquier cliente real).
- El WSDL declara la dirección interna `http://wsayc/wsAyC_server.php` como `soap:address`;
  hay que forzar el endpoint público al armar el cliente (mismo motivo por el que
  `helpdesk-manager` tiene `WSAYC_ENDPOINT` en vez de confiar en el WSDL).
- El WS **no autentica ni valida el `IdEmpresa`** contra ningún usuario — acepta cualquier
  id. El `empresa_id` que se manda en la consulta tiene que salir **siempre** de una columna
  del cliente en la base de STC Cloud, nunca de un parámetro de la URL/query string: si no,
  un `client_viewer` podría leer el parque de cualquier empresa de Canal Directo cambiando
  un número.

### Qué no se decidió (más allá del transporte elegido)

No se investigó si la VM de producción efectivamente alcanza `wsg.cdsisa.com.ar` (es
probable, por ser un servicio público detrás de Cloudflare, pero no se probó desde ahí). Es
lo primero a confirmar antes de implementar.

## Diseño previsto (para cuando se apruebe)

### Vínculo cliente ↔ empresa de Siges

No existe hoy ninguna columna que vincule un `client` de STC Cloud con una empresa de Siges.
Decisión ya tomada con Iván: columna nueva y manual `clients.siges_empresa_id` (nullable),
cargada a mano por cliente desde el portal (selector buscable alimentado por
`getEmpresas`, no un campo de texto libre con el id a mano). Cliente sin este campo → la
pantalla nueva no existe (ni para admin ni para el cliente), en vez de mostrarse vacía.

### Definición de "reporta"

Un equipo de Siges "reporta" si existe un `device` en STC Cloud con el mismo serial
normalizado (`upper(trim())`, igual criterio que el índice único de `devices`), con
`registration_state = 'registered'`, no dado de baja ni fusionado, y con `last_seen` dentro
del umbral configurable `system_settings.device_offline_threshold_minutes` (el mismo cutoff
que ya usa `devices/infrastructure/database/knex-device-directory-queries.ts` para "sin
contacto" — no un tercer umbral inventado).

### Módulo nuevo, arquitectura hexagonal (`cloud/src/modules/siges-fleet/`)

Puerto de dominio (`domain/repositories/siges-fleet-gateway.ts`) con un único adapter
`infrastructure/wsayc/` en esta primera etapa. Sin dependencia npm nueva: el WSDL es
RPC/encoded y el dato útil es JSON dentro de un string, así que alcanza con un cliente SOAP
mínimo hecho a mano (envelope + `fetch`) en vez de una librería completa — evita regenerar
`cloud/package-lock.json` (lockfile separado del root que usa el Dockerfile).

Rutas nuevas: `GET /api/v1/clients/:id/siges-fleet` (la reconciliación; agregar a
`CLIENT_VIEWER_ROUTES` en `rolePolicy.ts`, el ownership del `:id` ya lo cubre
`clientIdParamMatchesScope`) y `GET /api/v1/siges/empresas` (el padrón para el selector del
mapeo — sólo admin/operator). Rutas nuevas sin `preHandler` declarado rompen
`npm run check:routes` (CI); al agregarlas hay que correr
`node cloud/scripts/check-routes.mjs --write-catalog` para regenerar
[`PERMISSIONS_CATALOG.md`](../dev/PERMISSIONS_CATALOG.md) — es auto-generado, no se edita a
mano, y quedaría desactualizado si se olvida ese paso.

Portal: pestaña nueva en `ClientDetailTabs.tsx`, visible sólo si el cliente tiene
`siges_empresa_id` cargado (evita el bug de "pestaña visible sin contenido" que el equipo ya
viene cerrando en otras pantallas para el rol `client_viewer`).

Sin credenciales que gestionar ni variable de entorno obligatoria: `WSAYC_ENDPOINT` con
default al público; si el WS no responde, la pantalla degrada con un mensaje claro (502), el
resto del portal sigue funcionando igual — mismo criterio de degradación que
`helpdesk-manager` aplica a todas sus integraciones externas.

## Alcance futuro: cargar pedido de insumo o de servicio técnico desde el portal

Pedido explícito de Iván (12/09/2026): ya que el portal muestra el nivel de cartucho por
equipo (`devices.toner_black/cyan/magenta/yellow`, ver
[`DATA_MODEL.md` §5.3](../dev/DATA_MODEL.md#53-dispositivos)), sumar
la posibilidad de que, desde esa misma pantalla, se pueda **generar un pedido de insumo** o
**un pedido de servicio técnico** en Canal Directo, sin salir del portal ni pasarlo por
teléfono/mail.

`wsAyC` ya expone las dos operaciones que hacen falta — `helpdesk-manager` las usa hoy para
lo mismo desde su propio módulo `insumos`:

- **`persistNewSupply(Datos)`** — crea un pedido de insumo. `Datos` es un JSON-string con
  dos secciones: `Supply` (contacto solicitante/destinatario completo — nombre, apellido,
  teléfono, email, sector — más `NroSerie`, `NroIncidenteCliente` como referencia de
  idempotencia, `Detalle`) y `Detail` (`familia_id` + `insumo_id` + `cantidad` +
  `motivo_id`). El `insumo_id` correcto para un equipo sale de
  `getArticleParts(IdFamilia)`, y la familia del equipo de `getMachineBySerial`. Devuelve un
  id numérico "exitoso" **aunque no haya insertado fila** (comentario explícito en el código
  de `helpdesk-manager`,
  `backend/src/modules/insumos/domain/services/order_creation.py:1-8`): la verificación
  post-creación con reintentos cortos (`getSupplyById` hasta confirmar) **no es opcional**,
  es la única forma de saber si el pedido se creó de verdad.
- **`persistNewIncident(Datos)`** — crea un incidente (servicio técnico). `Datos` es más
  simple: `{Incident: {NroSerie, Ingreso, Falla, NroIncidenteCliente, origen_id, +
  contacto solicitante/destinatario}}`. Mismo patrón de verificación obligatoria post-creación
  (`getIncidentById`).
- Ninguna de las dos operaciones admite reintento automático si falla el POST: reintentar
  `persistNewSupply`/`persistNewIncident` a ciegas duplica el pedido real en Canal Directo.
  Es una regla dura documentada en el código fuente de `helpdesk-manager` y que aplicaría
  igual acá.

Lo que falta decidir cuando esto se retome (no es parte de este ADR, son preguntas abiertas
para esa instancia):

1. **Quién puede disparar el pedido** desde STC Cloud: ¿sólo admin/operator (a pedido del
   cliente, como intermediarios) o también el propio `client_viewer` directamente? Esto
   último requeriría credenciales/contacto de "solicitante" resueltas automáticamente
   (¿de dónde: `clients.contact_name/email/phone` ya existentes, o un contacto nuevo por
   pedido?).
2. **Umbral de disparo**: ¿un botón manual en la ficha del equipo, o además una sugerencia
   automática cuando `toner_*` cruza el umbral bajo (ya existe ese concepto para las alertas
   de insumos internas, `supply_requests`)? Si es automático, cómo evitar duplicar un pedido
   que ya se disparó por otra vía (teléfono, o el propio flujo de `insumos` de
   `helpdesk-manager`, que apunta al mismo Canal Directo).
3. **`familia_id`/`insumo_id`** no son datos que STC Cloud tenga hoy — hay que resolverlos en
   el momento contra `getMachineBySerial` + `getArticleParts`, y decidir qué pasa si el
   serial no está en Canal Directo (mismo caso `SerieNoActivaEnCanalDirectoError` que ya
   maneja `helpdesk-manager`).
4. Esta escritura es la primera vez que STC Cloud modificaría un sistema externo (hasta acá
   todo lo que toca Siges/Canal Directo, incluida la reconciliación de este ADR, es de sólo
   lectura) — vale una revisión de seguridad/autorización específica antes de habilitarla,
   no sólo extender el patrón de lectura.

## Consecuencias

**Positivas:**
- Ninguna todavía en el código: no hay nada implementado. Este documento deja la
  investigación y el diseño acordado por escrito, para retomar sin tener que re-investigar
  transporte, filtros ni forma de la respuesta.
- El transporte elegido (wsAyC) funciona igual en desarrollo y en la única VM de producción
  real, a diferencia de la alternativa descartada (ORION), y no agrega ninguna dependencia
  npm nueva ni credencial que gestionar.

**Negativas:**
- Agrega la primera dependencia de STC Cloud hacia un sistema externo a Canal Directo/Siges
  — hasta ahora el backend sólo habla con Postgres, Redis y el propio agente. Un problema de
  ese WS externo (caído, lento, WSDL cambiado) ahora puede degradar una pantalla del portal.
- El acoplamiento es a un string-JSON-dentro-de-XML sin schema real (`xsd:string` en el
  WSDL): un cambio de forma en la respuesta de Canal Directo rompe el parseo en silencio si
  no hay tests con fixtures reales cubriéndolo.
- No se verificó que la VM de producción alcance `wsg.cdsisa.com.ar` (sección "Qué no se
  decidió" arriba) — es un supuesto sin confirmar que sostiene toda la elección de
  transporte.

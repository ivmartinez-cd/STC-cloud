# Master Prompt: Motor de Captura por Modelo de Impresora (Capture Drivers) - STC Cloud

Este archivo contiene las especificaciones y la directiva técnica para que un modelo de IA o un desarrollador sénior mantenga y extienda el **motor de captura de datos de impresoras** del agente DCA (`agent/src/capture/`), con **un archivo por modelo de impresora** y familias de protocolo compartidas, al nivel de las plataformas MPS líderes (HP SDS / Web Jetadmin, ECi FMAudit / PrintFleet, MPS Monitor, PaperCut, Lexmark MVE), cumpliendo estrictamente con `docs/dev/ANTIGRAVITY_SKILLS.md`.

---

## 📋 Instrucciones de Uso
1. Copie el contenido del bloque **"MASTER PROMPT"** ubicado a continuación.
2. Péguelo en el chat de su asistente de IA junto con `agent/src/capture/**` y las páginas/JSON/XML capturados del EWS del modelo a incorporar (o un `snmpwalk` de `1.3.6.1.2.1.43`).
3. El asistente creará/ajustará el perfil del modelo, la familia si hace falta, los tests con fixtures y la documentación, paso a paso.

---

```markdown
# ROLE: PRINCIPAL DCA ENGINEER & MPS DATA-COLLECTION ARCHITECT

Actúa como Ingeniero Principal de agentes colectores (DCA) para Managed Print Services. Tu objetivo es que el agente STC Cloud (Node.js, Windows) capture **identidad, contadores, insumos, alertas y bandejas** de cualquier impresora de red con la misma fidelidad y disciplina que HP SDS, FMAudit o MPS Monitor, y que **cada modelo de impresora tenga su lógica aislada en un archivo propio**.

Debes respetar al 100% las reglas de **TypeScript estricto (cero `any`)**, **JSDoc profesional en español**, **cero dependencias externas nuevas de red** (sólo `http`/`https`/`net` nativos y `net-snmp`), y **compatibilidad total con el contrato `DeviceReading` → `/api/v1/devices/sync`** (no se cambian nombres de campo sin migración coordinada servidor + cola SQLite).

---

## 🧭 BENCHMARK: CÓMO LO HACEN LAS MEJORES PLATAFORMAS (y qué adoptamos)

| Plataforma | Práctica clave | Adoptado en STC |
|---|---|---|
| **HP SDS Manager** (white paper *Monitoring Loops*) | 5 loops independientes con intervalos en/fuera de horario: Alert 3/15 min, Identity 10/60, Meter 20/240, Consumables 60/240, Tray 480. Cada loop pide **sólo su scope**. | `CaptureScope = identity\|meters\|supplies\|alerts\|trays`; `ScanService` mapea Discovery→identity+todo, Meter→meters, Supplies→supplies+alerts+trays. (Roadmap: loop Alert dedicado.) |
| **FMAudit / PrintFleet** | Base de "descriptores de dispositivo": un registro por modelo con cómo leerlo; fallback universal a Printer-MIB; *best value per field* entre fuentes. | `capture/models/<marca>/<modelo>.ts` (perfil declarativo) + `capture/families/*` (protocolo) + `generic.printer-mib` como red de seguridad + `mergeResults()` campo a campo. |
| **MPS Monitor / Nubeprint** | Identidad por `sysObjectID` (enterprise OID) antes que por texto; tóner por **prtMarkerSuppliesTable + prtMarkerColorantTable** (tipo/clase/colorante), no por regex de descripción. | `snmpIdentity()` usa sysObjectID → marca, `hrDeviceDescr` → modelo (evita "HP ETHERNET MULTI-ENVIRONMENT"); `snmpSupplies()` clasifica tóner/tambor/fusor/banda/residuo por tipo+clase y color por colorante. |
| **PaperCut / Printix** | Alertas desde `prtAlertTable` + `hrPrinterDetectedErrorState`; estado de bandejas desde `prtInputTable`. | `snmpAlerts()` y `snmpTrays()` en la familia genérica. |
| **Lexmark MVE / HP WJA** | Endpoints XML/JSON del fabricante como fuente primaria cuando existen (más ricos que SNMP: part numbers, páginas restantes, CRUM serial). | Familias `hp.devmgmt` (DevMgmt XML), `samsung.syncthru` (JSON), `samsung.sws` (XOA), `lexmark.cgi`. |

### Diagnóstico de la implementación anterior (por qué se rediseñó)
1. La cascada estaba organizada **por protocolo** (EWS→SNMP→PJL→IPP), no por modelo: un `scanner.ts` de 640 líneas con ramas por puertos y 3 copias del mapeo `EwsData→DeviceReading`.
2. `ews.ts` probaba una **lista plana de 30 URLs** para cualquier marca y se cortaba al primer `totalPages`, mezclando identidad, contadores e insumos.
3. Samsung tenía **tres implementaciones paralelas** (parsers genéricos, `scanSamsung4020`, `x4300`) con regex duplicadas.
4. El *fast path* por `poll_method` producía lock-in (PJL sólo devuelve total → se perdía color) y no guardaba **qué driver** leyó el equipo.
5. El modelo se tomaba de `sysDescr` (en HP viejos es la tarjeta JetDirect: "HP ETHERNET MULTI-ENVIRONMENT").
6. Se inventaba `color_pages = 0` en parsers que no distinguen color (Lexmark, HP HTML).
7. Tóner por SNMP leía 16 índices fijos y clasificaba por regex de descripción; sin alertas ni bandejas por SNMP.
8. **Cero tests** del scanner (`scanner.test.ts` referenciado en `package.json` no existía).

---

## 📐 ARQUITECTURA OBJETIVO (ya implementada en `agent/src/capture/`)

```
identify()  →  resolve()  →  collect(scopes)  →  completar huecos  →  normalize()
   │              │               │                    │                  │
 SNMP            perfil de      familia           Printer-MIB /        DeviceReading
 (sysObjectID,   modelo →       (protocolo del    PJL / IPP            (contrato server,
 hrDeviceDescr)  familia →      firmware)         campo a campo        sin cambios)
 EWS probe       puntaje →
 PJL / IPP       genérico
```

### Archivos
| Archivo | Rol |
|---|---|
| `capture/types.ts` | Contratos: `CaptureFamily`, `ModelProfile` (+`defineModel`), `CaptureContext`, `CaptureResult`, `CaptureScope`, `DeviceIdentity`. |
| `capture/index.ts` | Motor: `captureDevice({ ip, community, scopes, hint, trustHint })` → `CaptureOutcome`. Precalifica puertos (9100/631/80/443), identifica, resuelve driver, ejecuta familia, completa huecos con `generic.printer-mib` → PJL → IPP, aplica hooks del perfil, normaliza. Semáforo de 20 capturas concurrentes. |
| `capture/registry.ts` | Lista de familias y perfiles; `resolve(identity, ports, preferredDriverId)`: perfil explícito → familia con mejor `score()` → genérico. |
| `capture/normalize.ts` | `toDeviceReading()`: único mapeo `CaptureResult → DeviceReading` (snake_case del servidor). Aplica `expect.color === false` ⇒ `mono = total`, `color = 0`. |
| `capture/bridge.ts` | `fromEwsData()` (reutiliza los parsers existentes) y `mergeResults()` (best value per field; dedupe de alertas). |
| `capture/transport/http.ts` | `fetchHttp` (redirecciones, gzip, TLS autofirmado, timeout configurable), `xmlVal`, `toInt`, `clampPct`. |
| `capture/transport/snmp.ts` | `SnmpClient` perezoso con cache por ciclo, `getMany` en lotes, `getFirst*`, `subtree` (GETBULK) y modo `raw` para MAC/bits. |
| `capture/families/generic-printer-mib.ts` | RFC 3805/2790/2737: identidad, contadores, insumos (tabla+colorantes), alertas, bandejas. |
| `capture/families/hp-futuresmart.ts` | HP FutureSmart (E-series, Managed/Enterprise): contadores **autoritativos por SNMP** (prtMarkerLifeCount + OIDs HP .2.6.0/.2.7.0 = SDS), `DeviceInformation/View` (SKU, alias, ubicación), `ConfigurationPage` (revisión+datecode, paquete FS, formateador, RAM, ciclos del motor, bandejas), `UsagePage` (print/copy/fax, equivalentes A4, dúplex, escaneos), `SuppliesStatus` (part number, nº pedido, serial CRUM, páginas impresas/restantes, fechas). Sign-in "Administrator" sin clave si el EWS está protegido. Validado contra el E47528 con fixtures reales. |
| `capture/families/hp-devmgmt.ts` | HP LaserJet Pro + FutureSmart: `ProductConfigDyn.xml`, `ProductUsageDyn.xml`, `ConsumableConfigDyn.xml`, `InternalPages?id=SuppliesStatus/UsagePage`; HTTPS tras HTTP. |
| `capture/families/hp-jetdirect-legacy.ts` | HP con JetDirect: SNMP privado (`hpPrinterModel`) + PJL para serial/total + HTML legado de insumos. |
| `capture/families/samsung-syncthru.ts` | SyncThru V4/V5/V6 JSON (`home/counters/supplies/fwupgrade/activealert`). |
| `capture/families/samsung-sws.ts` | XOA / Solution Web Service (copiadoras MultiXpress). |
| `capture/families/lexmark-cgi.ts` | Lexmark clásico `cgi-bin/dynamic` (T/X 6xx). |
| `capture/families/generic-ews.ts` | Endpoints conocidos de Ricoh/Brother/Xerox/Epson/Canon/Konica (baja prioridad). |
| `capture/models/<marca>/<modelo>.ts` | **Un archivo por modelo**: `defineModel({...})`. Hoy: Samsung SL-M4020ND, SL-M4072FD, SCX-483x, CLX-6260, CLP-680, X4300LX, M5370LX; HP M479fdw, M428fdw, E47528, E78625, E40040, E50145, E52645 (FutureSmart), LaserJet JetDirect legado; Lexmark T652, T654, X656de. |
| `capture/models/index.ts` | Catálogo ordenado (más específico primero). |
| `snmp/scanner.ts` | Fachada de compatibilidad (`readDevice`, `readViaSNMP`, `readViaEWSCounters`, `readViaEWSSupplies`). |
| `core/ScanService.ts` | Loops: `scan()` (discovery, registra y persiste `driver`), `runMeterTask()` (`['meters']`), `runSuppliesTask()` (`['supplies','alerts','trays']`), ambos con `trustHint` (sin re-identificar). |
| `sync/database.ts` | `known_devices.driver` (nuevo) para la ruta rápida por driver. |
| `tests/capture.test.ts` | 35 tests sin red: resolución de toda la flota, familias con fixtures HTTP/SNMP, merge, normalización. |

### Plantilla de archivo por modelo
```typescript
import { defineModel } from '../../types';

/** <Marca> <Modelo> — <tipo: mono/color, MFP/impresora, A4/A3, ADF>. <Firmware/EWS>. */
export default defineModel({
  id: '<marca>.<modelo-kebab>',           // estable: se persiste en known_devices.driver
  brand: '<hp|samsung|lexmark|...>',
  displayName: '<Nombre comercial>',
  family: '<familia>',                     // hp.devmgmt | samsung.syncthru | samsung.sws | lexmark.cgi | hp.jetdirect-legacy | generic.printer-mib
  match: { brand: '<marca>', model: /<regex contra model|sysDescr|sysName>/i },  // o sysObjectId: '1.3.6.1.4.1.236.'
  expect: { color: false, duplex: true, adf: true, scopes: ['identity', 'meters', 'supplies', 'alerts', 'trays'] },
  hooks: {
    // afterCollect(result, ctx) { ...ajustes (bandeja ADF fija, corregir total, etc.)...; return result; },
    // collect(ctx, scopes)     { ...reemplazo total para firmware atípico...; },
  },
  notes: '<quirks: endpoints que no existen, 302 a login, OIDs alternativos, unidades>',
});
```

### Datos por campo (quién es el dueño)
| Dato | Fuente primaria | Completa / respaldo |
|---|---|---|
| total / mono / color | SNMP (`prtMarkerLifeCount` + OIDs de marca) | EWS (`EngineCycles`, `counters.json`) si SNMP está filtrado |
| desglose print/copy/fax/escaneos/equivalentes | EWS (UsagePage, counters.json) | — |
| modelo / serie / SKU / alias / ubicación | EWS (DeviceInformation, home.json) | SNMP (`hrDeviceDescr`, 1284 `MDL:`, `prtGeneralSerialNumber`) |
| firmware | SNMP (OIDs de marca → Entity-MIB → `hrSWInstalledName` → `sysDescr`) | EWS (ConfigurationPage, fwupgrade.json) |
| MAC / hostname DNS | SNMP (`ifPhysAddress`, `sysName`) | EWS |
| tóners (% / part number / pedido / serial / páginas) | EWS (SuppliesStatus, supplies.json, ConsumableConfigDyn) | SNMP `prtMarkerSuppliesTable` × colorantes |
| kits (fusor, rodillos, residuo) | SNMP `prtMarkerSuppliesTable` | EWS supplies.json (Samsung) |
| alertas | SNMP `prtAlertTable` + `hrPrinterDetectedErrorState` | EWS activealert.json |
| bandejas | SNMP `prtInputTable` (capacidad/nivel) **fusionado por nombre** con EWS (tamaño/tipo) | — |

### Reglas de oro
1. **Nunca** pongas lógica de protocolo en un perfil de modelo: si dos modelos comparten endpoints, comparten familia. El perfil sólo declara y, a lo sumo, ajusta con `hooks.afterCollect`.
2. **Nunca inventes datos**: si una fuente no distingue color, `color = null` (la normalización aplica `expect.color === false` de forma explícita).
3. Cada scope se pide y se completa por separado; el método principal (`poll_method`) es el que aportó los **contadores**.
4. Toda familia debe ser tolerante a fallos (devuelve `null`/parcial, nunca lanza) y **testeable con fixtures** (`CaptureContext.http` y `snmp` se inyectan).
5. El `id` de perfil/familia es un contrato persistido (`known_devices.driver`): no se renombra.
6. Un perfil nuevo = **4 entregables**: archivo del modelo, alta en `models/index.ts`, caso en `tests/capture.test.ts` (resolución + fixture si trae lógica), nota en `docs/dev/STC_Technical_Architecture_Guide.md §4`.

---

## 📋 PROCEDIMIENTO PARA INCORPORAR UN MODELO NUEVO

### Paso 1: Levantar evidencia del equipo real (ws160)
1. `snmpwalk -v2c -c public <IP> 1.3.6.1.2.1.1` y `... 1.3.6.1.2.1.43` (guardar en `agent/src/tests/fixtures/<modelo>/snmp.txt` si se agrega la carpeta).
2. Capturar con el navegador/curl los endpoints EWS candidatos de la familia (ver cabecera de cada `families/*.ts`) y guardar los cuerpos crudos.
3. Anotar: ¿responde a SNMP? ¿qué puertos (9100/631/80/443)? ¿HTTP redirige a HTTPS? ¿algún endpoint pide login?

### Paso 2: Decidir familia
- Si los cuerpos coinciden con una familia existente → sólo perfil.
- Si es un firmware nuevo (p. ej. Lexmark moderno `/webglue/rawcontent`, HP Web Services `/hp/device/this.LCDispatcher`, Kyocera Command Center, Ricoh Web Image Monitor) → crear `families/<marca>-<firmware>.ts` implementando `CaptureFamily` (`score`, `probeIdentity`, `collect`) y registrarla en `registry.ts`.

### Paso 3: Crear el perfil
- `capture/models/<marca>/<modelo>.ts` con la plantilla. Matcher tolerante a variantes (`/M479|M477|M478/i`) pero sin capturar modelos de otra familia.
- Sumarlo a `models/index.ts` **antes** de perfiles más genéricos de la misma marca.

### Paso 4: Tests
- Caso de resolución en `describe('registro de perfiles y familias')`.
- Si hay familia nueva o hook: test con fixtures (HTTP por `path`, SNMP por OID) verificando identidad, total/mono/color, % de tóner, códigos, alertas y bandejas.

### Paso 5: QA
1. `cd agent && npx tsc --noEmit && npm test` (todo verde, cero `any`).
2. En ws160: `stc-cloud-monitor.exe --status` y revisar `agent.log`: la línea `Driver: <id>` debe mostrar el perfil nuevo (no `(sin perfil)`).
3. Verificar en el portal que `total/mono/color`, tóner, `supplies_details` y `firmware` del equipo son coherentes con el EWS.

---

## 🗺️ ROADMAP SUGERIDO (prioridad descendente)
1. **Loop de alertas dedicado** (3/15 min) en `TaskScheduler` con scope `['alerts']` y envío incremental (hoy las alertas viajan con el loop de insumos).
2. Familias nuevas: `lexmark.webservices` (MS/MX/CS/CX), `hp.webservices` (OXPd/`/hp/device/...` para FutureSmart sin DevMgmt), `kyocera.ccx`, `ricoh.wim`, `brother.bms`, `xerox.ws`.
3. **SNMPv3** (usuario/auth/priv por agente) en `SnmpClient` para clientes que deshabilitan v2c.
4. Login SWS opcional (usuario/clave por dispositivo) para copiadoras Samsung con `supplies.json` protegido.
5. Fixtures reales por modelo en `agent/src/tests/fixtures/` y test de regresión automático por perfil.
6. Portal: columna "Driver" y "Cobertura de scopes" por dispositivo (qué scopes no se están resolviendo vs `expect.scopes`).
7. Descubrimiento complementario por mDNS/WS-Discovery para reducir el barrido de rangos.

Procede con la implementación garantizando un código de alta costura informática, 100% tipado, testeado con fixtures y documentado.
```

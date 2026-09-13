# Guía Técnica de Arquitectura - Ecosistema STC Cloud

Este documento detalla la arquitectura de software interna, flujos de seguridad, protocolos de red y diseño de base de datos de la plataforma STC Cloud. Está diseñado para desarrolladores, auditores de seguridad e ingenieros de sistemas.

---

## 1. Visión General de la Arquitectura

El ecosistema de **STC Cloud** está dividido en tres componentes principales desacoplados que cooperan para recolectar, procesar y presentar telemetría de dispositivos de impresión corporativos de forma segura y eficiente:

```
  ┌────────────────────────────────────────────────────────┐
  │                   Infraestructura WAN                  │
  │                                                        │
  │                  ┌──────────────────┐                  │
  │                  │ STC Cloud Portal │                  │
  │                  │  (Fastify API)   │                  │
  │                  └────────┬─────────┘                  │
  │                           │                            │
  └───────────────────────────┼────────────────────────────┘
                              │ HTTPS / WSS (Port 443)
  ┌───────────────────────────┼────────────────────────────┐
  │                   Red Local del Cliente                │
  │                           │                            │
  │                           ▼                            │
  │                  ┌──────────────────┐                  │
  │                  │ STC Cloud Agent  │                  │
  │                  │   (Single Exec)  │                  │
  │                  └────────┬─────────┘                  │
  │                           │                            │
  │         ┌─────────────────┼─────────────────┐          │
  │         │ UDP 161 (SNMP)  │ TCP 80/443 (EWS)│          │
  │         ▼                 ▼                 ▼          │
  │    ┌───────────┐     ┌───────────┐     ┌───────────┐   │
  │    │ Impresora │     │ Impresora │     │ Impresora │   │
  │    │   HP M404 │     │ Lexmark   │     │ Samsung   │   │
  │    └───────────┘     └───────────┘     └───────────┘   │
  │                                                        │
  └────────────────────────────────────────────────────────┘
```

---

## 2. Arquitectura de Red: Zero-Inbound

Para garantizar la máxima seguridad y cumplimiento en redes empresariales restrictivas, STC Cloud utiliza una arquitectura de **Cero Entrada (Zero-Inbound)**:

*   **Sin Puertos de Entrada Abiertos:** El agente nunca escucha peticiones desde el exterior. No se abre ningún puerto de firewall entrante en la infraestructura del cliente.
*   **Conexiones de Salida Seguras (Outbound-Only):** Todas las comunicaciones se inician desde el agente hacia la nube a través de peticiones HTTP/S (HTTPS) estándar y túneles de comunicación bidireccional mediante WebSockets Seguros (WSS) en el puerto **443 TCP**.
*   **Tolerancia a Inestabilidad:** En caso de fallas de conexión WAN o caídas del servidor web de la nube, el agente implementa un algoritmo de **Reconexión Progresiva (Exponential Backoff)** en su flujo de conectividad inicial (`waitForConnectivity`), que escala el retraso entre intentos de forma segura desde los 10 segundos hasta un techo de 5 minutos, protegiendo tanto la red interna como el servidor externo de ataques involuntarios de denegación de servicio (DoS).

---

## 3. Derivación de Claves por Hardware (HWID Binding)

El agente protege sus credenciales almacenadas localmente (`config.enc`) mediante cifrado simétrico robusto ligado inequívocamente al hardware físico del equipo host:

### A. Algoritmo de Flujo de Cifrado

```
[MachineGuid] + [BIOS Serial] ──► [String Crudo] ──► [SHA-256 Hash] ──► [Hardware ID (32 chars hex)]
                                                                                  │
                                                                                  ▼
                                                                       [PBKDF2 (100k iter, sha256)]
                                                                                  │
                                                                                  ▼
[JSON de Config] ──► [Cifrado Simétrico AES-256-GCM] ◄────────────────────── [Derived Key]
                                 │
                                 ▼
                     [config.enc en Disco]
```

1.  **Recolección de Identificadores (Windows):**
    *   Lee la clave del registro `MachineGuid` de la instalación de Windows mediante PowerShell:
        `Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Cryptography\MachineGuid`
    *   Lee el número de serie físico de la BIOS por consulta CIM/WMI:
        `Win32_BIOS.SerialNumber`
2.  **Derivación de Hardware ID:**
    *   Combina los identificadores: `${guid}-${bios}`.
    *   Calcula el hash SHA-256 del string crudo y extrae los primeros 32 caracteres hexadecimales como el Hardware ID persistente.
3.  **Generación de Clave por KDF:**
    *   Aplica la función de derivación de claves por contraseña **PBKDF2** utilizando el Hardware ID obtenido, una sal aleatoria criptográfica de 16 bytes generada en caliente y **210,000 iteraciones** del algoritmo de hash `sha256` para derivar una clave fuerte de 32 bytes (`aes-256-gcm` key).
4.  **Cifrado Criptográfico (AES-256-GCM):**
    *   Genera un vector de inicialización (IV) de 12 bytes aleatorios.
    *   Cifra el JSON del archivo de configuración.
    *   Genera un tag de autenticación criptográfica de 16 bytes.
    *   Escribe en disco un único buffer binario estructurado: `[salt(16 bytes)][iv(12 bytes)][tag(16 bytes)][payload cifrado]`.
5.  **Detección de Manipulación (HWID Mismatch):**
    *   Durante el descifrado (`ConfigManager.load`), si se detectan firmas de tag inválidas (`BAD_DECRYPT` o `Invalid authentication tag`), el agente arroja inmediatamente un error del tipo `HWID_MISMATCH`. Esto indica que la configuración ha sido copiada a otro equipo o la BIOS ha sido modificada, forzando la desvinculación preventiva.

---

## 4. Motor de Captura por Modelo (Capture Drivers)

> Rediseño (agosto 2026). Documento rector: `docs/dev/STC_Capture_Drivers_Master_Prompt.md`. Código: `agent/src/capture/`.

El agente ya no ejecuta una cascada fija por protocolo. Cada dispositivo se **identifica**, se **resuelve a un driver** (perfil de modelo → familia de firmware → Printer-MIB genérico) y se **captura por scopes** (`identity`, `meters`, `supplies`, `alerts`, `trays`), completando huecos campo a campo con las fuentes restantes. El resultado se normaliza al contrato `DeviceReading` que consume `/api/v1/devices/sync` (sin cambios de esquema).

### A. Precalificación de Puertos (`checkOpenPorts`)
Sondeo TCP en paralelo a `9100` (RAW/JetDirect), `631` (IPP), `80` y `443` con timeouts de 500 ms (puertos de impresora) y 2000 ms (web, EWS lentos). Semáforo global de **20 capturas concurrentes**. Un host sin ningún puerto abierto sólo recibe la identificación SNMP (2 PDUs) y, si no es impresora (`hrDeviceType` ≠ printer / sin Printer-MIB), se descarta sin tráfico HTTP — cero ruido en IDS/SIEM.

### B. Identidad (`identify`)
1. **SNMP**: `sysObjectID` → marca (enterprise OID); `hrDeviceDescr` → modelo comercial (se ignora `sysDescr` cuando describe la tarjeta de red, p. ej. "HP ETHERNET MULTI-ENVIRONMENT"); serie por OIDs privados + `prtGeneralSerialNumber` + `entPhysicalSerialNum`; `sysName`, `sysLocation`, firmware (Entity-MIB), MAC (`ifPhysAddress`).
2. Sin SNMP: **sondas EWS** de cada familia (1 request, 4 s) — `home.json` (SyncThru), `homeDeviceInfo.sws` (XOA), `ProductConfigDyn.xml` (HP), `deviceinfo.html` (Lexmark).
3. **PJL** `@PJL INFO ID/SERIALNUMBER` (9100) y **IPP** `Get-Printer-Attributes` (631) como últimos recursos.

### C. Resolución de driver (`resolve`)
1. Si el equipo ya fue leído, se usa el `driver` persistido en `known_devices.driver` (ruta rápida; los loops además pasan `trustHint` y no re-identifican).
2. **Perfil de modelo** (`capture/models/<marca>/<modelo>.ts`): el primer perfil cuyo `match` (regex sobre modelo/sysDescr/sysName o prefijo de sysObjectID) acierta.
3. **Familia por puntaje** (`score(identity, ports)`): `hp.devmgmt`, `hp.jetdirect-legacy`, `samsung.syncthru`, `samsung.sws`, `lexmark.cgi`, `generic.ews`.
4. **`generic.printer-mib`** (RFC 3805) si nada aplica.

### D. Captura y completado (`collect` + `mergeResults`)
La familia pide **sólo los endpoints del scope solicitado** (el loop de contadores no descarga insumos). Luego el motor completa lo que falte con Printer-MIB (contadores por `prtMarkerLifeCount`/OIDs privados, insumos por `prtMarkerSuppliesTable` × `prtMarkerColorantTable`, alertas por `prtAlertTable` + `hrPrinterDetectedErrorState`, bandejas por `prtInputTable`), después PJL para el total y IPP para identidad. `mergeResults` toma el mejor valor por campo y deduplica alertas. El perfil puede ajustar con `hooks.afterCollect` (p. ej. la bandeja ADF fija del SL-M4072FD). `poll_method` refleja la fuente que aportó los **contadores**.

### E. Loops de monitoreo (alineados a HP SDS)
| Loop (`TaskScheduler`) | Scopes | Intervalo laboral / fuera |
|---|---|---|
| Discovery (`scan`) | identity + meters + supplies + alerts + trays | 10 / 60 min |
| Meter (`runMeterTask`) | meters | 20 / 240 min |
| Supplies (`runSuppliesTask`) | supplies + alerts + trays | 60 / 240 min |

### F. Familias y perfiles vigentes
- **Samsung**: `samsung.syncthru` (SL-M4020ND, SL-M4072FD, SCX-483x, CLX-6260, CLP-680), `samsung.sws` (X4300LX, M5370LX).
- **HP**: `hp.devmgmt` (M479fdw, E47528, E78625, E40040, E50145, E52645), `hp.jetdirect-legacy` (LaserJet con JetDirect).
- **Lexmark**: `lexmark.cgi` (T652, T654, X656de).
- **Genéricos**: `generic.ews` (Ricoh/Brother/Xerox/Epson/Canon/Konica), `generic.printer-mib` (cualquier marca).

Cada perfil declara `expect` (color/dúplex/ADF/scopes esperados) y `notes` con los quirks del firmware; la normalización usa `expect.color === false` para fijar `mono = total, color = 0` sin inventar desgloses en equipos color.

---

## 5. Arquitectura de Almacenamiento Local del Agente

El agente mantiene las lecturas en disco en una base de datos SQLite administrada a través de `better-sqlite3`:

*   **Paso a WAL (Write-Ahead Logging):** El motor local activa el modo de diario WAL, permitiendo lecturas concurrentes sin bloquear la base de datos y manteniendo la velocidad síncrona.
*   **Manejo de Backpressure:** Para evitar degradaciones de rendimiento y desborde de almacenamiento si el equipo pierde la conexión a Internet indefinidamente, el agente implementa un límite de backpressure estricto de **10,000 registros en cola**. Si se supera dicho umbral, los escaneos automáticos de red se suspenden temporalmente hasta que se liberen lecturas sincronizadas.
*   **Ciclo de Autolimpieza (Retention):** Cada vez que se ejecuta el sincronizador, el agente purga automáticamente las lecturas marcadas como sincronizadas (`synced = 1`) y aquellas que excedan los **7 días** de antigüedad acumulada, manteniendo el archivo `local.db` acotado y estable.

---

## 6. Autenticación Rotativa de Doble Token

Para proteger la comunicación del canal del API sin almacenar credenciales estáticas de larga duración en disco, STC Cloud implementa un esquema híbrido de tokens:

1.  **Clave de Activación Uniuso:** Generada por el portal con un tiempo de vida (TTL) de 24 horas y enviada en la preinstalación.
2.  **Refresh Token Rotativo (Largo Plazo):** Al activarse, la API devuelve un *Refresh Token* seguro de 64 bytes que se almacena de forma cifrada en la configuración local del agente (`config.enc`).
3.  **Access Token JWT (Corto Plazo):** Cada petición de telemetría y comunicación del agente incluye un token JWT en las cabeceras HTTP de autorización. Este JWT tiene una validez efímera (por ejemplo, 8 horas).
4.  **Rotación Automática:** Si una llamada de telemetría devuelve un código HTTP `401 Unauthorized` por token expirado, el agente ejecuta en segundo plano un flujo asíncrono de renovación (`tryRefresh`) enviando su *Refresh Token*. La API valida el token contrastando su hash SHA-256 en base de datos (`refresh_token_hash`), invalida el token viejo y emite un nuevo *Refresh Token* rotativo y un nuevo *Access Token*, los cuales son persistidos de forma segura en disco.

---

## 7. Protocolo de Firma de Actualización de Firmware (Ed25519)

El actualizador del agente realiza una estricta validación criptográfica de dos capas para blindarse contra ataques de cadena de suministro (Supply Chain Attacks):

1.  **Validación de Hash SHA-256:**
    *   Al recibir el JSON de nueva versión, se descarga el paquete y se calcula su hash SHA-256 localmente, contrastándolo con el hash esperado expuesto por el servidor web seguro.
2.  **Validación de Firma Digital Ed25519:**
    *   El agente descarga adicionalmente un archivo de firma digital con extensión `.sig` (que contiene la firma criptográfica asimétrica del binario).
    *   Utilizando la biblioteca criptográfica nativa de Node.js, el agente valida la firma del búfer de bytes del archivo descargado usando la clave pública empaquetada e inmutable de desarrollo `UPDATE_PUBLIC_KEY_HEX`.
    *   Si la firma no es verificada con éxito, el agente detiene inmediatamente el flujo, emite una alerta crítica de violación de integridad y elimina los archivos descargados para prevenir cualquier ejecución de código arbitrario no autorizado.

---

## 8. Gateway de EWS Remoto (navegación de la web embebida sin VPN)

Permite que un operador del portal abra, en una pestaña aparte, la web embebida (EWS) completa de un equipo que está en la LAN de un cliente. Es la contraparte del JAMC de HP SDS: el agente hace de proxy inverso, pero sin abrir ningún puerto entrante (sección 2).

**Flujo:**

1. `POST /api/v1/agents/:id/ews-session` (admin/operator; el flag `remote_ews_enabled` del monitor tiene que estar activo) crea una sesión en Redis con la IP del equipo congelada —tomada de `devices`, nunca del navegador— y devuelve un **ticket** de un solo uso y 60 s.
2. El navegador cruza al hostname propio del gateway, `ews.<dominio>` (`/__stc/open?ticket=…`), que canjea el ticket por una cookie `stc_ews` (`HttpOnly`, `Secure`, `SameSite=Strict`) y entrega una página puente que navega a `/`. Una sola sesión por navegador: abrir otro equipo cierra la anterior.
3. nginx reescribe `ews.<dominio>/x` → `/__ews/x` en la API. Cada petición se relaya al agente como comando `EWS_REQUEST` por el WebSocket saliente que ya tiene abierto; el agente la ejecuta contra la impresora (sólo IPs de su `known_devices`, HTTP y HTTPS, sin seguir redirects, tope de 2 MB) y devuelve status, cabeceras, cuerpo y `Set-Cookie` por separado.
4. Las cookies **del equipo** viven en la sesión del servidor (jar en Redis); el navegador sólo maneja el id opaco. Un `Location` absoluto al propio equipo se reescribe a relativo; si cambia de esquema (http↔https) la sesión aprende el nuevo.

**Por qué un hostname propio y no un prefijo del portal:** las rutas absolutas del firmware (`/sws/app/…`) resuelven solas sin reescribir HTML ni JavaScript de cada marca, y las cookies y políticas del portal no se mezclan con las del equipo. Por eso el gateway quita en su origen las cabeceras de helmet (CSP, `nosniff`, `X-Frame-Options`, `Referrer-Policy`) que romperían páginas de 2009; el aislamiento lo da el origen, no las cabeceras.

**Límites y auditoría:** 3 pedidos en vuelo por sesión (los servidores embebidos se saturan con el paralelismo del navegador), 1000/min por IP en la ruta, sesión de 30 min sin uso y 8 h como máximo absoluto. Se auditan la apertura (`REMOTE_EWS_SESSION_OPEN`), cada pantalla (`REMOTE_EWS_ACCESS`), cada escritura (`REMOTE_EWS_WRITE`) y el cierre (`REMOTE_EWS_SESSION_CLOSE`), con IP del operador y ruta sin query; nunca el cuerpo. Deshabilitar el flag cierra las sesiones abiertas en el acto.

Código: `cloud/src/modules/agents/presentation/ews-gateway-{routes,http}.ts`, `application/use-cases/ews-gateway-use-cases.ts`, `cloud/src/services/ewsGatewayService.ts`, `agent/src/capture/transport/http.ts` (`ewsRequest`) y `agent/src/core/CommandHandler.ts` (`EWS_REQUEST`). Despliegue: bloque `server` de `ews.` en `nginx.conf`, segundo certificado en `deploy.sh`, `EWS_GATEWAY_URL` en `.env.production`.

---

## 9. Canales de Actualización del Agente (`stable` / `legacy`)

El agente se distribuye en dos canales, porque el parque incluye equipos con Windows 7 / Server 2008 R2 donde el runtime moderno no corre:

| Canal | Runtime embebido | Target de esbuild | Instalador |
|---|---|---|---|
| `stable` | Node 24 | `node24` | `STC-Monitor.iss` |
| `legacy` | Node 20.2.0 | `node20` | `STC-Monitor-Legacy.iss` |

El canal se **hornea en el build** (`build-sea.js --channel …`, `define __STC_CHANNEL__`) y queda también como marca legible en la primera línea del bundle. El agente pide actualizaciones sólo de su canal (`GET /api/v1/agents/version?channel=…`) y reporta en cada latido canal y runtime, que el portal contrasta: si el canal declarado no coincide con el Node que corre, la ficha del monitor lo marca en rojo.

Cada canal se publica como `bundle-<canal>.js` + `.sig` en `/updates/` y como fila propia en `agent_releases` (`unique(version, channel)`). `publish-release.sh` se niega a publicar un bundle bajo un canal distinto del que trae horneado; `publish-hotfix.sh` compila los dos canales en carpetas separadas. La verificación de firma de la sección 7 aplica igual a ambos.

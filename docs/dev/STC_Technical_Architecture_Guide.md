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
    *   Aplica la función de derivación de claves por contraseña **PBKDF2** utilizando el Hardware ID obtenido, una sal aleatoria criptográfica de 16 bytes generada en caliente y **100,000 iteraciones** del algoritmo de hash `sha256` para derivar una clave fuerte de 32 bytes (`aes-256-gcm` key).
4.  **Cifrado Criptográfico (AES-256-GCM):**
    *   Genera un vector de inicialización (IV) de 12 bytes aleatorios.
    *   Cifra el JSON del archivo de configuración.
    *   Genera un tag de autenticación criptográfica de 16 bytes.
    *   Escribe en disco un único buffer binario estructurado: `[salt(16 bytes)][iv(12 bytes)][tag(16 bytes)][payload cifrado]`.
5.  **Detección de Manipulación (HWID Mismatch):**
    *   Durante el descifrado (`ConfigManager.load`), si se detectan firmas de tag inválidas (`BAD_DECRYPT` o `Invalid authentication tag`), el agente arroja inmediatamente un error del tipo `HWID_MISMATCH`. Esto indica que la configuración ha sido copiada a otro equipo o la BIOS ha sido modificada, forzando la desvinculación preventiva.

---

## 4. Algoritmo Detallado y Cascada de Descubrimiento de Impresoras

El escáner de red local implementado en el agente (`agent/src/snmp/scanner.ts`) ejecuta un flujo de detección determinista diseñado específicamente para minimizar el ruido en la red local, evitar el disparo de alarmas en Sistemas de Detección de Intrusiones (IDS/SIEM) al interactuar con dispositivos que no son impresoras, y garantizar la recolección óptima de telemetría.

### A. Precalificación de Puertos (`checkOpenPorts`)

Antes de realizar consultas de capa de aplicación, el agente ejecuta un sondeo de puertos TCP en paralelo sobre la dirección IP objetivo utilizando sockets TCP crudos (`net.Socket`). 

*   **Puertos Probados:** `9100` (RAW/JetDirect), `631` (IPP), `80` (HTTP), `443` (HTTPS).
*   **Parámetro de Concurrencia:** Limitado mediante un semáforo interno a un máximo de **20 IPs concurrentes** (`MAX_CONCURRENT = 20`) para evitar la saturación de la pila de red local del host de ejecución.
*   **Timeout Estricto (`REACH_TIMEOUT`):** El socket se configura con un tiempo de espera de conexión de **500 ms** (`socket.setTimeout(500)`). Si no se establece la conexión en este lapso, el socket se destruye preventivamente y el puerto se declara cerrado.
*   **Gestión de Errores de Conexión:**
    *   Si el sistema operativo reporta `ENETUNREACH` (Red inalcanzable) o `EHOSTDOWN` (Host caído), la promesa de precalificación falla inmediatamente destruyendo el socket.
    *   Si se recibe un `ECONNREFUSED` (Conexión rechazada) u otros códigos menores, se procesa de forma segura catalogando el puerto como cerrado sin arrojar una excepción descontrolada en el proceso principal.

### B. Bifurcación de Aislamiento de Red: `hasPrinterPort`

Para evitar que el agente actúe como un escáner de vulnerabilidades web genérico —lo cual provocaría el bloqueo inmediato del agente por parte de firewalls de red o herramientas de ciberseguridad corporativas al escanear servidores, switches o equipos de usuario— el agente implementa un filtro de aislamiento estricto:

```typescript
const hasPrinterPort = openPorts.has(PORT_JETDIRECT) || openPorts.has(PORT_IPP);
```

*   **Caso `hasPrinterPort === false` (Dispositivo no confirmado como Impresora):**
    Si los puertos exclusivos de impresión TCP `9100` (JetDirect) y TCP `631` (IPP) se encuentran **cerrados**, el agente asume de forma inmediata que el host es un dispositivo de infraestructura general (servidores de base de datos, controladores de dominio, PCs, switches, NAS).
    *   **Acción:** El agente aborta cualquier intento de realizar peticiones HTTP/S (puertos `80` y `443`) a dicho host. Ejecuta inmediatamente y en exclusiva una lectura por SNMP (`readViaSNMP`).
    *   **Justificación de Seguridad:** Esto evita enviar tramas HTTP o peticiones de web scraping de Embedded Web Server (EWS) a hosts sensibles de la intranet que no son impresoras, eliminando alertas de intrusión falsas en sistemas SIEM/IDS.
*   **Caso `hasPrinterPort === true` (Dispositivo confirmado como Impresora):**
    Si al menos uno de los puertos de impresión exclusiva (`9100` o `631`) responde positivamente, se valida que el host físico es una impresora activa de la red. El agente queda habilitado para ejecutar la cascada completa de recopilación en caliente (incluyendo protocolos web EWS en puertos 80/443).

### C. Secuencia de Cascada y Mecanismo de Fallback en Caliente

Una vez confirmada la naturaleza del dispositivo de impresión, el agente ejecuta de forma secuencial una cascada de consultas de telemetría. La jerarquía prioriza los métodos que aportan mayor cantidad de información y menor coste de CPU:

```
                  [Inicio de Consulta de Dispositivo]
                                   │
                                   ▼
        1. EWS (HTTP/S Scraping) ──────► ¿Retorna total_pages !== null?
                   │ [NO]                          │ [SÍ]
                   ▼                               ▼
        2. PJL (TCP Port 9100)   ──────► ¿Retorna total_pages !== null?
                   │ [NO]                          │ [SÍ]
                   ▼                               ▼
        3. SNMP (UDP Port 161)   ──────► ¿Retorna total_pages !== null?
                   │ [NO]                          │ [SÍ]
                   ▼                               ▼
        4. IPP (TCP Port 631)    ──────► ¿Responde exitosamente?
                   │ [NO]                          │ [SÍ]
                   ▼                               ▼
    [Retorno Coalescido] ◄───────────────── Retornar Datos
  (ews ?? pjl ?? snmpResult ?? null)
```

1.  **Nivel 1: EWS (Embedded Web Server) via HTTP/S (Puertos 80/443):**
    El agente implementa un motor de raspado de datos quirúrgico y no invasivo en `agent/src/snmp/ews.ts` que se comunica con el servidor web interno de la impresora.
    
    *   **Motor de Transporte de Bajo Nivel (`fetchHttp`):**
        *   Está basado en los módulos nativos `http` y `https` de Node.js. Esto mantiene el ejecutable SEA ultra-ligero y libre de dependencias externas de red pesadas o inseguras.
        *   **Timeout Estricto de Red:** Cada petición HTTP/S tiene un tiempo de espera límite de **4000 ms** (`EWS_TIMEOUT = 4000`). Si el servidor de la impresora se encuentra sobrecargado y no responde a tiempo, el agente destruye el socket de inmediato (`req.destroy()`) para evitar bloquear el hilo del bucle de eventos (Event Loop).
        *   **Bypass de Certificado TLS/SSL:** Para conexiones HTTPS, se configura la propiedad `rejectUnauthorized: false`. Esto es mandatorio en entornos empresariales locales ya que el 99.9% de las impresoras de red exponen interfaces seguras mediante certificados auto-firmados o expirados que de otro modo bloquearían la conexión.
        *   **Soporte de Redirecciones Dinámicas:** Sigue de forma automática códigos de estado de redirección HTTP `301`, `302`, `307` y `308` hasta un límite de **3 saltos** (`redirectDepth = 3`) para evitar bucles infinitos en el direccionamiento local de las impresoras.
        *   **Cero Procesamiento DOM / Navegación Virtual:** El agente **no levanta navegadores embebidos ni motores tipo Chromium (headless browsers)**, lo que reduce el consumo de memoria RAM a pocos kilobytes y evita vulnerabilidades críticas de ejecución de scripts remotos.
    
    *   **Sondeo Quirúrgico por Lista de Candidatos (13 Endpoints):**
        El agente no indexa ni rastrea (crawl) el sitio web de la impresora. En su lugar, realiza peticiones GET dirigidas de forma exclusiva a una lista de **13 endpoints específicos** clasificados por marca y confiabilidad histórica de almacenamiento de datos:
        *   *Samsung (SyncThru V4/V5/V6 y Solution Web Service):*
            *   `/sws.application/home/homeDeviceInfo.sws` (Modelo y Serial)
            *   `/sws.application/information/suppliesView.sws` (Porcentaje de tóner)
            *   `/sws.application/information/countersView.sws` (Contadores Mono/Color/Total)
            *   `/sws/app/information/home/home.json`
            *   `/sws/app/information/identity/identity.json`
            *   `/sws/app/information/supplies/supplies.json`
            *   `/sws/app/information/counters/counters.json`
        *   *Lexmark (PrinterStatus y Device Reports):*
            *   `/cgi-bin/dynamic/printer/PrinterStatus.html` (Tóners)
            *   `/cgi-bin/dynamic/printer/config/reports/deviceinfo.html` (Contadores, serial y modelo)
        *   *HP (FutureSmart y Standard):*
            *   `/hp/device/InternalPages/Index?id=SuppliesStatus` (Nivel de insumos)
            *   `/DevMgmt/ProductUsageDyn.xml` (API XML local nativa de HP)
            *   `/hp/device/InternalPages/Index?id=UsagePage` (Páginas totales impresas)
        *   *Marcas Genéricas (Epson, Canon, Ricoh, Xerox, Brother, Konica Minolta):*
            *   Usa endpoints estandarizados de entrada como `/general/status.html`, `/web/entry.cgi?func=STR_PRTCNT`, `/English/pages/cnc_status.html`, etc.
            
    *   **Acumulación Incremental y Cortocircuito (Short-Circuit):**
        *   **Acumulador Dinámico:** El agente recorre de forma secuencial la lista de candidatos de menor a mayor coste de red, inyectando los datos extraídos en un objeto común (`acc`). Esto permite resolver de forma combinada los atributos de una impresora cuando se hallan expuestos en distintos endpoints (por ejemplo, el modelo se extrae del archivo JSON de identidad y los contadores se parsean desde el archivo JSON de contadores).
        *   **Cortocircuito de Capa 7 (Billing Guard):** Dado que el dato crítico para la facturación y gestión del servicio es el contador de páginas físico, en el instante exacto en que el acumulador dinámico logra poblar la propiedad `totalPages` (`acc.totalPages !== undefined`), la iteración se detiene de forma inmediata (`break`) y el agente retorna la información, evitando realizar las peticiones HTTP/S restantes y aliviando el tráfico local en un 70%.
        
    *   **Mecánica de Parseo y Expresiones Regulares Aplicadas:**
        El agente procesa el contenido de texto plano recuperado a través de algoritmos deterministas rápidos:
        1.  **Parseo de APIs XML Locales (HP XML):** En el endpoint `/DevMgmt/ProductUsageDyn.xml`, el agente lee y busca etiquetas directamente dentro de la respuesta XML. Extrae etiquetas como `<TotalImpressions>`, `<MonochromeImpressions>`, `<ColorImpressions>` y `<SerialNumber>` convirtiendo los textos a enteros seguros eliminando signos de millares.
        2.  **Expresiones Regulares Multilingües (Español / Inglés / Coreano):**
            *   *Lectura de Contadores:* Busca patrones de texto específicos como `/(?:C.mputo de p.g\.|Page Count|Total Pages)[^=]*=\s*(\d+)/i` en Lexmark, u OIDs del maquetado HTML de HP (`id="TotalTotal"`, `id="Total.Total"`).
            *   *Niveles de Tóner:* Para HP FutureSmart y Lexmark, localiza selectores de insumos con expresiones del tipo `/(?:T.ner\s+negro|Black\s+T.ner|T.ner\s+Black)/i` y extrae el porcentaje numérico contiguo.
            *   *Samsung SyncThru (JSON/JS):* Procesa los formatos JS y JSON del firmware SyncThru, extrayendo las propiedades del bloque de tóner (`toner_black : { remaining: 85 }`) o sumando las propiedades de facturación simplex y duplex (`GXI_BILLING_SIMPLEX_BW_TOTAL_CNT` + `GXI_BILLING_DUPLEX_BW_TOTAL_CNT`).

2.  **Nivel 2: PJL (Printer Job Language) via TCP (Puerto 9100):**
    *   Si EWS falla, abre un socket TCP al puerto `9100` y transmite comandos PJL (como `@PJL INFO USTATUS` o consultas directas de contadores).
    *   Si el búfer de respuesta devuelve exitosamente el conteo físico de páginas (`total_pages !== null`), detiene la ejecución y retorna los datos.
3.  **Nivel 3: SNMP v2c via UDP (Puerto 161):**
    *   Si PJL no responde o no entrega contadores, abre una sesión SNMP v2c.
    *   **Métricas de Sesión SNMP:** Tiempo de espera de **3000 ms** (`TIMEOUT_MS = 3000`) y **1 reintento** (`RETRIES = 1`).
    *   **Filtro de Integridad de Dispositivo:** Adicionalmente, el agente valida la OID `hrDeviceType` (`1.3.6.1.2.1.25.3.1.5`). Si el tipo de dispositivo devuelto por SNMP no corresponde estrictamente al tipo impresora física, aborta la transacción para evitar registrar falsos positivos.
    *   Si la lectura de OIDs estándar (Míbs RFC 3805 / RFC 2790) devuelve un total de páginas válido, interrumpe la cascada y retorna.
4.  **Nivel 4: IPP (Internet Printing Protocol) via TCP (Puerto 631):**
    *   Envía un paquete estructurado `Get-Printer-Attributes` solicitando los metadatos de consumibles (`marker-life-count`) y modelo físico.
5.  **Coalescencia Nullish (`Best-Effort`):**
    *   Si ninguna de las fases anteriores logra recuperar de manera aislada un contador de páginas consolidado (`total_pages`), el agente aplica un operador de coalescencia nullish (`ews ?? pjl ?? snmpResult ?? null`) sobre los objetos intermedios. Esto asegura que si una impresora solo reporta marca y número de serie por SNMP, pero falló en dar contadores, esa información básica de inventario sea reportada en lugar de descartar el dispositivo por completo.

### D. Optimización por Ruta Rápida (Fast Path)

Para prevenir el tráfico repetitivo de port-scanning e interrogación secuencial en redes locales extensas, el agente implementa un mecanismo de caché persistente:

1.  El primer escaneo exitoso registra en la tabla `devices` de la base de datos SQLite local (`local.db`) el método exacto con el que se obtuvo la telemetría bajo la columna `poll_method` (valores: `'ews'`, `'pjl'`, `'snmp'`, `'ipp'`).
2.  En los siguientes ciclos de monitoreo (programados periódicamente), el agente consulta esta tabla y, si existe un método rápido válido registrado, **omite por completo el escaneo de puertos (TCP 9100, 631, 80, 443) y el flujo de la cascada**.
3.  El agente invoca directamente la rutina asociada al `poll_method` cacheado. 
4.  **Flujo de Recuperación:** Si el dispositivo de impresión es apagado, sufre un cambio de IP, actualización de firmware o bloqueo de red que haga fallar el método cacheado, el agente descarta el valor persistido, marca el dispositivo como `'unknown'` y re-ejecuta la cascada completa para reevaluar sus puertos y protocolo activo de manera dinámica.

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

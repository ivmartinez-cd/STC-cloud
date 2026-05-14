# STC Cloud — Cambios implementados en esta sesión

Proyecto: agente SNMP para monitoreo de impresoras multimarca.
Stack: Node.js 18 + TypeScript (agente), Fastify + PostgreSQL (backend), WinForms .NET 9 (UI de escritorio).
Todos los cambios compilan sin errores y los tests pasan (11/11).

---

## Archivos modificados

### 1. `agent/src/core/config.ts`
**Qué se hizo:** se agregó el campo `proxyUrl` opcional a la interfaz `AgentConfig`.

```typescript
export interface AgentConfig {
  serverUrl: string;
  agentId: string;
  token: string;
  refreshToken: string;
  ipRanges: IpRange[];
  snmpCommunity: string;
  snmpVersion: 1 | 2;
  scanIntervalMinutes: number;
  proxyUrl?: string; // ← NUEVO: http://[user:pass@]host:puerto
}
```

---

### 2. `agent/src/snmp/scanner.ts`
**Qué se hizo:** se agregó un pre-check TCP antes de intentar SNMP en cada IP. Prueba 3 puertos de impresora en paralelo (9100, 80, 443) con timeout de 500 ms. Si ninguno responde, se descarta la IP sin gastar los 3 s del timeout SNMP.

Cambios concretos:
- Import `net` de Node.js agregado al principio.
- Constante `REACH_TIMEOUT = 500` agregada.
- Función `tryPort(ip, port)` agregada (retorna Promise<boolean>).
- Función `isHostReachable(ip)` agregada (corre `tryPort` en los 3 puertos con `Promise.all`).
- Llamada a `isHostReachable(ip)` agregada al inicio de `readDevice()`, antes de adquirir el semáforo.

```typescript
// Al inicio de readDevice():
if (!await isHostReachable(ip)) return null;
await sem.acquire();
// ... resto igual
```

---

### 3. `agent/src/core/SocketManager.ts`
**Qué se hizo:** dos cambios — Exponential Backoff en reconexión WebSocket, y soporte de proxy HTTP corporativo.

**Exponential Backoff:**
- Campos nuevos: `reconnectDelay = 5_000` y `maxReconnectDelay = 300_000`.
- En `ws.on('open')`: se resetea `reconnectDelay = 5_000`.
- En `scheduleReconnect()`: usa el delay actual y lo duplica para el siguiente.

```typescript
private scheduleReconnect() {
  if (this.reconnectTimer) return;
  const delay = this.reconnectDelay;
  this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  this.reconnectTimer = setTimeout(() => {
    this.reconnectTimer = null;
    this.connect();
  }, delay);
}
```

**Proxy HTTP:**
- Imports agregados: `http`, `https`, `tls`, `net` (todos built-in de Node, sin nuevas dependencias).
- Función `createProxyAgent(proxyUrl)` agregada: crea un `https.Agent` custom con CONNECT tunnel, soporta Basic Auth embebida en la URL.
- Constructor actualizado para aceptar `proxyUrl?: string`.
- En `connect()`: si `proxyUrl` está configurado, pasa el agent al constructor de WebSocket.

```typescript
constructor(serverUrl, token, onCommand, onLog, proxyUrl?: string)
```

---

### 4. `agent/src/core/main.ts`
**Qué se hizo:** tres funciones nuevas y cambios en el startup.

**Función `waitForConnectivity(serverUrl)`** (Exponential Backoff al arrancar):
- Llama `GET /api/v1/health` con timeout de 8 s.
- Si falla, espera 10 s, luego 20 s, luego 40 s… hasta máximo 300 s, y reintenta.
- Se llama una vez al arrancar, ANTES de iniciar los loops. Bloquea hasta que el servidor responda.

**Función `checkForUpdate(serverUrl)`** (auto-update):
- Llama `GET /api/v1/agents/version` → `{ version, url }`.
- Si la versión remota es distinta de la constante `VERSION`, descarga el `url`.
- Escribe el nuevo bundle en `bundle.js.update`, luego lo renombra a `bundle.js` (atómico).
- Llama `process.exit(0)` → NSSM reinicia el servicio con el nuevo binario.
- Solo actúa si `process.argv[1]` termina en `.js` (modo producción). En desarrollo con tsx no hace nada.

**Función `setProxy()`** (handler de `--set-proxy`):
- Lee `args[idx + 1]` tras `--set-proxy`.
- Si la URL está vacía o es `"none"`, elimina `proxyUrl` de la config.
- Si hay URL, valida con `new URL()` y la guarda en la config cifrada.
- Sale con código 0 si OK, 1 si error.

**Cambios en `main()`:**
- Bloque nuevo para inicializar proxy en fetch: si `config.proxyUrl` existe, llama `require('undici').setGlobalDispatcher(new ProxyAgent(proxyUrl))` (undici está incluido en Node 18+, sin dependencia nueva).
- Llama `waitForConnectivity()` antes de arrancar los loops.
- Llama `checkForUpdate()` al arrancar y con `setInterval` cada 4 horas.
- Pasa `proxyUrl` al constructor de `SocketManager`.
- Agrega `--set-proxy` al bloque de flags CLI.

**Cambio en `printStatus()`:**
- Se agrega `proxyUrl: config?.proxyUrl ?? null` al objeto JSON de respuesta.

---

### 5. `cloud/src/api/server.ts`
**Qué se hizo:** se agregó un endpoint público (sin autenticación) para que el agente consulte la versión disponible.

```typescript
fastify.get("/api/v1/agents/version", async () => ({
  version: process.env.AGENT_VERSION ?? "1.0.0",
  url:     process.env.AGENT_DOWNLOAD_URL ?? null,
}));
```

Requiere dos variables de entorno nuevas en Render para funcionar en producción:
- `AGENT_VERSION` → versión actual del agente (ej: `"1.4.0"`)
- `AGENT_DOWNLOAD_URL` → URL pública del `bundle.js` a descargar

Mientras esas variables no estén seteadas, el endpoint devuelve `version: "1.0.0"` y `url: null`, y el agente no hace nada.

---

### 6. `monitor-ui/AgentService.cs`
**Qué se hizo:** dos cambios.

**Propiedad nueva en `AgentStatus`:**
```csharp
[JsonPropertyName("proxyUrl")] public string? ProxyUrl { get; init; }
```

**Método nuevo `SetProxyAsync(proxyUrl)`:**
- Llama `stc-node.exe "bundle.js" --set-proxy <url>` (o `none` si la URL está vacía).
- Retorna `(bool Ok, string? Error)` igual que `ActivateAsync`.

---

### 7. `monitor-ui/ActivationForm.cs`
**Qué se hizo:** se agregó una tercera pestaña "Network / Proxy" al `TabControl`.

Controles nuevos declarados:
```csharp
private readonly TabPage _tabProxy;
private readonly TextBox _txtProxyUrl;
private readonly Label _lblProxyStatus;
private readonly Button _btnSaveProxy;
```

Contenido de la pestaña:
- Título "Configuración de Proxy de Red".
- GroupBox con `_txtProxyUrl` (placeholder: `http://proxy.empresa.com:8080`), texto de ayuda con el formato, `_lblProxyStatus` mostrando el estado actual, y `_btnSaveProxy` ("Guardar").
- Nota al pie: "después de guardar, el servicio se reiniciará automáticamente".

Handler `BtnSaveProxy_Click`:
1. Llama `AgentService.SetProxyAsync(txtProxyUrl.Text)`.
2. Si OK, llama `AgentService.RestartService()`.
3. Actualiza `_lblProxyStatus` con el resultado (verde si OK, rojo si error).

`UpdateDisplay(AgentStatus s)` actualizado:
- Si `s.ProxyUrl` no está vacío, pone ese valor en `_txtProxyUrl` y muestra label verde.
- Si está vacío, muestra "sin proxy configurado" en gris.

Sidebar izquierdo: se agregaron dos labels descriptivos para la nueva pestaña en `Y=340` y `Y=360`.

---

## Archivo nuevo creado

### `docs/STC_System_Requirements_v1.4.html`
Versión actualizada del documento de requisitos del sistema. Cambios respecto a v1.3:
- Versión: 1.4
- TOC con nuevas entradas para proxy y auto-update.
- Recuadro changelog en página 2.
- Intro actualizada mencionando auto-update y resiliencia offline.
- SO: agrega multi-NIC y virtualización.
- Página 4: sección nueva "Soporte de Proxy HTTP Corporativo".
- Página 5 (Puertos): fila nueva para puertos 9100/80/443 LAN (pre-check TCP).
- Página 6 (URLs): fila de `/api/v1/agents/version`, descripción del Exponential Backoff al inicio, sección nueva "Actualización Automática" con tabla de env vars.
- Página 7 (Apéndice 2): WSS con mención de Exponential Backoff, fila de Auto-Update en tabla, sección nueva "Comportamiento Offline".
- Página 8: ítem de cifrado en reposo, tabla nueva de características de seguridad v1.4.

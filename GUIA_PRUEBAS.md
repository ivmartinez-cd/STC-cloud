# Guía de Pruebas — STC Cloud
## Sistema de Toma de Contadores Multimarca

**Versión:** 1.0 — Post implementación Fases 1–7  
**Fecha:** Mayo 2026  
**Plataforma de prueba:** Windows 11 + Node.js 20

---

## Índice

1. [Prerequisitos](#1-prerequisitos)
2. [Configurar el entorno](#2-configurar-el-entorno)
3. [Levantar base de datos y Redis](#3-levantar-base-de-datos-y-redis)
4. [Instalar dependencias y migraciones](#4-instalar-dependencias-y-migraciones)
5. [Tests unitarios del agente](#5-tests-unitarios-del-agente-sin-servidor)
6. [Iniciar el backend y el portal](#6-iniciar-el-backend-y-el-portal)
7. [Tests de integración E2E](#7-tests-de-integración-e2e)
8. [Pruebas manuales del portal](#8-pruebas-manuales-del-portal)
9. [Prueba del agente Windows](#9-prueba-del-agente-windows)
10. [Simulador SNMP](#10-simulador-snmp-sin-impresora-física)
11. [Load Test](#11-load-test)
12. [Checklist de verificación final](#12-checklist-de-verificación-final)

---

## 1. Prerequisitos

Verificar que los siguientes programas estén instalados antes de comenzar.

### Verificaciones rápidas (ejecutar en CMD o PowerShell)

```bat
node --version
:: Debe mostrar: v20.x.x o superior

npm --version
:: Debe mostrar: 10.x.x o superior

docker --version
:: Debe mostrar: Docker version 24.x.x o superior

docker compose version
:: Debe mostrar: Docker Compose version v2.x.x
```

Si Docker no está instalado: https://docs.docker.com/desktop/windows/

---

## 2. Configurar el entorno

El archivo `.env` se ubica en la **raíz del proyecto** (junto a `ESTADO_PROYECTO.md`).

### Crear el archivo `.env`

Crear el archivo `C:\...\STC cloud\.env` con el siguiente contenido:

```env
# JWT — generar un valor aleatorio y seguro
JWT_SECRET=una_clave_super_secreta_de_al_menos_32_caracteres_para_desarrollo

# Portal
PORTAL_ADMIN_USER=admin
PORTAL_ADMIN_PASSWORD=Admin1234

# Base de datos (valores del contenedor Docker de desarrollo)
DB_HOST=localhost
DB_PORT=5432
DB_USER=stc_admin
DB_PASSWORD=stc_dev_pass
DB_NAME=stc_cloud

# Redis
REDIS_URL=redis://localhost:6379

# CORS — URL del portal en desarrollo
PORTAL_ORIGIN=http://localhost:5173

# Umbrales de alerta (se pueden dejar así para pruebas)
TONER_WARN_PCT=20
TONER_CRITICAL_PCT=10
```

> **Importante:** `PORTAL_ADMIN_PASSWORD` es la contraseña que usarás para entrar al portal web.

---

## 3. Levantar base de datos y Redis

Para las pruebas locales levantamos solo PostgreSQL (con TimescaleDB) y Redis en Docker, sin construir imágenes propias.

### Abrir una terminal y ejecutar:

```bat
:: PostgreSQL con TimescaleDB
docker run -d ^
  --name stc-postgres ^
  -p 5432:5432 ^
  -e POSTGRES_USER=stc_admin ^
  -e POSTGRES_PASSWORD=stc_dev_pass ^
  -e POSTGRES_DB=stc_cloud ^
  timescale/timescaledb:latest-pg16

:: Redis
docker run -d ^
  --name stc-redis ^
  -p 6379:6379 ^
  redis:7-alpine
```

### Verificar que ambos estén corriendo:

```bat
docker ps
```

Deberías ver `stc-postgres` y `stc-redis` con estado `Up`.

### Para detenerlos al terminar el día:

```bat
docker stop stc-postgres stc-redis
```

### Para volver a levantarlos:

```bat
docker start stc-postgres stc-redis
```

---

## 4. Instalar dependencias y migraciones

Abrir **3 terminales separadas** desde la raíz del proyecto.

### Terminal 1 — Backend (cloud)

```bat
cd cloud
npm install
```

Luego ejecutar las migraciones:

```bat
npx knex migrate:latest --knexfile src/db/knexfile.ts
```

Deberías ver algo como:

```
Batch 1 run: 3 migrations
20260506000000_initial_schema
20260506000001_audit_log
20260506000002_agent_token_fields
20260507000003_hardware_id_and_alerts
```

Luego el seed (crea un cliente de prueba):

```bat
npm run seed
```

### Terminal 2 — Portal

```bat
cd cloud\portal
npm install
```

### Terminal 3 — Agente

```bat
cd agent
npm install
```

---

## 5. Tests unitarios del agente (sin servidor)

Estos tests NO requieren base de datos ni servidor corriendo. Verifican la lógica pura del escáner SNMP y la cola SQLite.

### Ejecutar desde la carpeta `agent`:

```bat
cd agent
npm test
```

### Resultado esperado:

```
▶ tonerPct
  ✔ returns null for negative level (-1 = desconocido)
  ✔ returns null for -3 (indicador genérico de desconocido)
  ✔ returns null when max is 0 (división por cero)
  ✔ when max <= 100, level is treated as direct percentage (HP FutureSmart)
  ✔ when max > 100, calculates percentage (Lexmark / Samsung raw units)
  ✔ result is capped at 100 even if level > max (sensor drift)
  ... (16 tests en total)
▶ hrStatus
  ✔ maps 3 → idle
  ✔ maps 4 → printing
  ...
▶ detectBrandFromOid
  ✔ detects HP by enterprise 11 prefix
  ✔ detects Lexmark by enterprise 641 prefix
  ...
▶ SQLite Offline Queue
  ✔ starts with 0 pending readings
  ✔ enqueueReading inserts a reading
  ✔ markSynced removes rows from pending list
  ...

✓ 26 tests passed
```

Si algún test falla, revisar el error antes de continuar.

---

## 6. Iniciar el backend y el portal

### Terminal 1 — Backend

```bat
cd cloud
npm run dev
```

Debe mostrar:

```
Server listening at http://0.0.0.0:3000
WebSocket hub activo en /ws   (o advertencia si @fastify/websocket no está instalado)
```

### Verificar que el backend responde:

Abrir en el navegador o ejecutar en otra terminal:

```bat
curl http://localhost:3000/health
:: Respuesta esperada: {"status":"ok","version":"1.0.0"}
```

### Terminal 2 — Portal

```bat
cd cloud\portal
npm run dev
```

Debe mostrar:

```
  VITE v8.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
```

Abrir `http://localhost:5173` en el navegador. Debería redirigir automáticamente a `/login`.

---

## 7. Tests de integración E2E

Estos tests verifican el flujo completo contra el servidor real. **Requieren que el backend esté corriendo** (paso 6).

### En la Terminal 3:

**Windows CMD:**
```bat
cd cloud
set PORTAL_ADMIN_PASSWORD=Admin1234
npm test
```

**PowerShell:**
```powershell
cd cloud
$env:PORTAL_ADMIN_PASSWORD = "Admin1234"
npm test
```

### Resultado esperado (18 tests):

```
▶ Health
  ✔ GET /health returns 200

▶ Portal Auth
  ✔ Login con credenciales incorrectas → 401
  ✔ Login con credenciales válidas → 200 con token
  ✔ Dashboard sin token → 401
  ✔ Dashboard con token de portal → 200 con stats
  ✔ Lista de clientes → 200

▶ Ciclo de vida del agente
  ✔ Crear agente → retorna activation key
  ✔ Activar con llave incorrecta → 401
  ✔ Activar con llave válida → JWT + refresh token
  ✔ Reusar llave de activación → 401 (one-time use)
  ✔ Lista de agentes refleja el nuevo agente

▶ Heartbeat
  ✔ Agente envía heartbeat → 200
  ✔ Token de portal no puede hacer heartbeat → 403
  ✔ Sin token no puede hacer heartbeat → 401

▶ Registro y sincronización de dispositivos
  ✔ Registrar dispositivo → 200
  ✔ Sincronizar lectura → 200
  ✔ Sync rechaza más de 500 lecturas → 400
  ✔ Lecturas del dispositivo accesibles desde portal

▶ Rotación de refresh token
  ✔ Setup: crear segundo agente para prueba de refresh
  ✔ Refresh retorna nuevo JWT y nuevo refresh token
  ✔ Refresh token inválido → 401

▶ Revocación de agente
  ✔ Portal revoca agente → 200
  ✔ Agente revocado no puede hacer heartbeat → 401
  ✔ Agente revocado aparece como revoked en lista
  ✔ Cleanup: revocar agente de refresh test

✓ 18 tests passed, 0 failed
```

---

## 8. Pruebas manuales del portal

Con el backend y el portal corriendo, abrir `http://localhost:5173` y seguir este checklist.

### 8.1 Login

- [ ] La página carga en `/login` (fondo oscuro, logo STC Cloud)
- [ ] Intentar con usuario o contraseña incorrecta → aparece mensaje de error en rojo
- [ ] Ingresar con `admin` / `Admin1234` → redirige al Dashboard
- [ ] El sidebar muestra: Dashboard, Clientes, Agentes, Reportes, Configuración
- [ ] El sidebar muestra el usuario `admin` en la parte inferior

---

### 8.2 Dashboard

- [ ] Las 4 tarjetas de stats cargan (pueden mostrar 0 si no hay datos aún)
- [ ] "Lecturas Recientes" muestra "Esperando datos..." (normal sin agente)
- [ ] La zona del gráfico muestra el mensaje de placeholder
- [ ] Después de sincronizar lecturas con el agente: los stats se actualizan cada 10 segundos

---

### 8.3 Agentes

- [ ] La página carga con tabla vacía (o los agentes del E2E test si no se limpiaron)
- [ ] Clic en **"Nuevo Agente"** → aparece formulario con selector de cliente y campo de nombre
- [ ] Seleccionar "Cliente de Prueba" del dropdown
- [ ] Escribir un nombre (ej: "Agente Oficina Principal")
- [ ] Clic en **"Generar llave de activación"**
  - [ ] Aparece panel verde con la llave (64 chars hex) y el comando de activación
  - [ ] La llave es copiable (seleccionarla completa)
- [ ] La tabla se actualiza y muestra el nuevo agente con estado **"Pendiente"**
- [ ] Después de activar el agente (sección 9): el estado cambia a **"Activo"**
- [ ] Clic en **"Revocar"** sobre un agente activo → confirmación → estado cambia a "Revocado"

---

### 8.4 Clientes

- [ ] La página carga y muestra "Cliente de Prueba"
- [ ] Clic sobre el cliente → abre detalle del cliente
- [ ] El detalle muestra los dispositivos registrados (vacío si el agente no corrió aún)
- [ ] Después de correr el agente: aparecen las impresoras detectadas
- [ ] Clic sobre un dispositivo → abre detalle del dispositivo

---

### 8.5 Detalle de dispositivo

(Requiere que el agente haya enviado al menos una lectura)

- [ ] Muestra el gráfico de líneas con contadores históricos
- [ ] Las barras de toner muestran colores:
  - Verde: > 30%
  - Amarillo: 11-30%
  - Rojo: ≤ 10%
- [ ] Los valores de Total/Mono/Color coinciden con los del agente
- [ ] El estado del dispositivo se muestra (idle / printing / etc.)

---

### 8.6 Reportes

- [ ] La página carga con los selectores de cliente, dispositivo y fechas
- [ ] Seleccionar cliente → el dropdown de dispositivo se llena con los dispositivos del cliente
- [ ] Seleccionar dispositivo + rango de fechas → clic en **"Generar reporte"**
- [ ] Aparece tabla con lecturas
- [ ] Clic en **"Exportar CSV"** → se descarga un archivo `.csv`
- [ ] Abrir el CSV: debe tener encabezado y filas con datos correctos

---

### 8.7 Configuración

- [ ] La página carga con los campos de umbrales
- [ ] Cambiar "Advertencia Toner" a `25` y "Crítico" a `8`
- [ ] Clic en **"Guardar umbrales"** → aparece "Configuración guardada localmente"
- [ ] Recargar la página → los valores persisten (guardados en localStorage)

---

### 8.8 Logout

- [ ] Clic en **"Cerrar sesión"** en el sidebar inferior
- [ ] Redirige a `/login`
- [ ] Intentar navegar a `/` → redirige a `/login` (ruta protegida)

---

## 9. Prueba del agente Windows

### Opción A: Modo de desarrollo (recomendado para pruebas)

En la Terminal 3:

```bat
cd agent
npm run dev
```

El agente arrancará pero fallará al cargar la config (no está activado aún):

```
[ERROR] No se pudo cargar la configuración: ...
```

Eso es normal. Primero hay que activarlo.

### Paso 1: Generar la llave de activación desde el portal

1. Ir a `http://localhost:5173/agents`
2. Clic en **"Nuevo Agente"**
3. Seleccionar "Cliente de Prueba" — Nombre: "Agente Local"
4. Clic en **"Generar llave de activación"**
5. **Copiar la llave completa** (64 caracteres hexadecimales)

### Paso 2: Activar el agente

```bat
cd agent
npx tsx src/core/main.ts --activate <PEGAR_LLAVE_AQUI> --server http://localhost:3000
```

Resultado esperado:

```
Activando en http://localhost:3000...
Activado. ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
Config cifrada en: C:\ProgramData\ContadorImpresoras
Configura los rangos IP desde el portal y reinicia el servicio.
```

### Paso 3: Verificar en el portal

- Ir a `/agents` → el agente debe aparecer como **"Activo"**
- El campo Hardware ID debe mostrar el hostname del equipo

### Paso 4: Iniciar el agente en modo normal

```bat
npx tsx src/core/main.ts
```

Debes ver en los logs:

```
[INFO] STC Cloud Agent v1.0.0 iniciando...
[INFO] ID: xxxxxxxx-... | Servidor: http://localhost:3000
[INFO] Scan cada 15 min | Community: public
[INFO] Heartbeat OK
[INFO] Todos los loops activos.
```

### Paso 5: Verificar heartbeat en el portal

- Ir a `/agents` y hacer clic en el botón de actualizar (ícono de recarga)
- El campo "Último heartbeat" debe mostrar "Hace un momento"

### Paso 6: Verificar que el agente intenta escanear

El agente escaneará el rango por defecto `192.168.1.1 – 192.168.1.254`. Si no hay impresoras en esa red, los logs mostrarán solo timeouts (normal):

```
[INFO] Iniciando scan de 1 rango(s)
[INFO] Escaneando 254 IPs: 192.168.1.1 → 192.168.1.254
[INFO] Scan completado. Pendientes en cola: 0
```

Para probar con una impresora real, modificar el rango IP desde el portal (próximamente en el módulo de configuración de agente).

---

## 10. Simulador SNMP (sin impresora física)

El simulador crea un agente SNMP falso que responde como una impresora HP, Lexmark o Samsung. Permite probar el scanner sin hardware real.

### Paso 1: Iniciar el simulador HP

En una terminal nueva:

```bat
cd agent
npm run snmp:sim -- --brand hp
```

Salida esperada:

```
============================================
 STC Cloud — SNMP Simulator
 Marca   : HP
 Puerto  : 10161
 OIDs    : 18 registrados
============================================

Listo para recibir consultas SNMP.
Probar con:
  snmpget -v2c -c public localhost:10161 1.3.6.1.2.1.1.1.0
```

> **Nota:** El simulador usa el puerto `10161` (no el estándar 161) para no requerir permisos de administrador.

### Paso 2: Verificar con snmpget (si está instalado)

```bat
snmpget -v2c -c public localhost:10161 1.3.6.1.2.1.1.1.0
:: Respuesta esperada: HP LaserJet Pro M404n FutureSmart
```

Si no tienes `snmpget`, instalar con: [Net-SNMP para Windows](http://www.net-snmp.org/download.html)

### Paso 3: Probar con Lexmark y Samsung

```bat
:: En otra terminal
npm run snmp:sim -- --brand lexmark
npm run snmp:sim -- --brand samsung --port 10162
```

> El simulador HP tiene el tóner magenta al **8%** (umbral crítico), lo que generará una alerta real en el alertWorker cuando el agente lo escanee.

---

## 11. Load Test

Simula múltiples agentes concurrentes haciendo heartbeat y sincronización de lecturas.

**Requiere que el backend esté corriendo** (paso 6).

### Prueba rápida (5 agentes, 20 segundos):

**CMD:**
```bat
cd cloud
set PORTAL_ADMIN_PASSWORD=Admin1234
npm run test:load -- --agents 5 --duration 20 --readings 20
```

**PowerShell:**
```powershell
cd cloud
$env:PORTAL_ADMIN_PASSWORD = "Admin1234"
npm run test:load -- --agents 5 --duration 20 --readings 20
```

### Resultado esperado:

```
============================================================
 STC Cloud — Load Test
  API     : http://localhost:3000/api/v1
  Agentes : 5
  Lecturas: 20 por sincronización
  Duración: 20s
============================================================
[1/3] Login portal OK
[2/3] Cliente: Cliente de Prueba (00000000-...)
[3/3] Creando 5 agentes...
    5/5 agentes listos

Iniciando loops — 12:30:45

============================================================
 RESULTADOS
============================================================
  Duración real    : 20.3s
  Agentes activos  : 5
  Ciclos totales   : 35
  Lecturas enviadas: 700
  Requests totales : 70
  Requests/seg     : 3.4
  Errores          : 0 (0.0%)
  Latencia p50     : 45ms
  Latencia p95     : 120ms
  Latencia p99     : 180ms
  Latencia máx     : 210ms
============================================================

PASS: tasa de error <= 5%
```

### Prueba de estrés (50 agentes, 60 segundos):

```bat
npm run test:load -- --agents 50 --duration 60 --readings 100
```

El test falla (exit code 1) si la tasa de error supera el 5%. Revisar los logs del backend si hay errores.

---

## 12. Checklist de verificación final

Marcar cada ítem una vez verificado.

### Backend

- [ ] `GET /health` responde `{"status":"ok"}`
- [ ] Las 4 migraciones corrieron sin errores
- [ ] Login con credenciales incorrectas devuelve 401
- [ ] Login correcto devuelve JWT
- [ ] Dashboard devuelve stats reales
- [ ] CORS bloquea peticiones desde orígenes no configurados
- [ ] Rate limit: más de 10 logins/min resultan en 429

### Portal web

- [ ] Login funciona y guarda token en localStorage
- [ ] Rutas protegidas redirigen a `/login` sin token
- [ ] Logout limpia el token y redirige a `/login`
- [ ] Dashboard muestra stats en tiempo real (polling cada 10s)
- [ ] Se puede crear un agente y ver la llave de activación
- [ ] La tabla de agentes muestra estado real (Activo/Pendiente/Revocado)
- [ ] La lista de clientes muestra datos reales
- [ ] El detalle de cliente muestra sus dispositivos
- [ ] El detalle de dispositivo muestra el gráfico de contadores
- [ ] Las barras de toner cambian de color según el nivel
- [ ] Reportes generan y descargan CSV correctamente
- [ ] Configuración guarda y recupera umbrales

### Agente

- [ ] `--activate` con llave válida crea config cifrada en `C:\ProgramData\ContadorImpresoras`
- [ ] `--activate` con llave usada o inválida falla con error claro
- [ ] El agente en modo normal envía heartbeat cada 60s
- [ ] El agente aparece como "Activo" en el portal tras activarse
- [ ] El `hardware_id` del agente se muestra en la tabla de agentes
- [ ] Los logs rotan cuando superan 10 MB

### Tests automáticos

- [ ] `cd agent && npm test` → 26 tests pasados, 0 fallidos
- [ ] `cd cloud && npm test` → 18 tests pasados, 0 fallidos
- [ ] Load test con 5 agentes → PASS (error rate ≤ 5%)

### Seguridad básica

- [ ] El JWT_SECRET está definido (el backend no arranca sin él)
- [ ] El token de agente no puede acceder a rutas de portal (403)
- [ ] El token de portal no puede hacer heartbeat (403)
- [ ] Un agente revocado no puede hacer heartbeat (401)
- [ ] Una llave de activación solo se puede usar una vez

---

## Resolución de problemas comunes

### "Cannot connect to database"

```bat
:: Verificar que el contenedor de postgres está corriendo
docker ps | findstr stc-postgres

:: Reiniciarlo si está detenido
docker start stc-postgres
```

### "JWT_SECRET no está definido"

Verificar que el archivo `.env` existe en la raíz del proyecto (donde está `ESTADO_PROYECTO.md`) y tiene `JWT_SECRET=...` definido.

### "PORTAL_ADMIN_PASSWORD no configurado"

El backend tiene este check: si `PORTAL_ADMIN_PASSWORD` no está en `.env`, el endpoint `/portal/login` devuelve 503. Agregar la variable al `.env`.

### Los tests E2E fallan con "Necesita al menos un cliente"

```bat
cd cloud
npm run seed
```

### El portal muestra pantalla en blanco

Verificar la consola del navegador (F12). Si hay errores de CORS, verificar que `PORTAL_ORIGIN=http://localhost:5173` está en el `.env` y el backend fue reiniciado.

### El agente falla al activar con "Error de activación"

- Verificar que la llave tiene exactamente 64 caracteres
- Verificar que la llave no fue usada previamente (son de un solo uso)
- Verificar que la llave no expiró (TTL: 24 horas)
- Verificar que el backend está corriendo en `http://localhost:3000`

---

*Generado automáticamente como parte del proceso de desarrollo — STC Cloud v1.0*

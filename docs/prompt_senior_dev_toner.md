# Prompt de Implementación para Senior Developer: Integración de Niveles de Suministros (Tóner) en STC Cloud

Este prompt detalla de manera técnica e integral todos los cambios necesarios en el **Agente local**, la **Base de datos local (SQLite)**, la **API del Servidor** y el **Portal Web** para agregar la recolección, envío y visualización de niveles de tóners (Negro, Cian, Magenta, Amarillo).

---

## 📋 Contexto y Objetivo
El agente de STC Cloud v1.6.5 ya posee la infraestructura para conectarse con impresoras mediante **EWS (HTTP/HTTPS)** y **SNMP (UDP 161)**. El objetivo es ampliar la estructura de datos para capturar los niveles de tóner (0-100%) y transmitirlos de forma estructurada a la base de datos de producción y mostrarlos en el portal del cliente.

---

## 🛠️ Especificación de Cambios por Componente

### 1. AGENTE LOCAL (TypeScript)

#### A. Ampliar la interfaz `DeviceReading`
En `agent/src/snmp/scanner.ts`, agregar los campos opcionales para suministros:
```typescript
export interface DeviceReading {
  // ... campos actuales ...
  toner_black?:   number | null; // 0 a 100
  toner_cyan?:    number | null; // 0 a 100
  toner_magenta?: number | null; // 0 a 100
  toner_yellow?:  number | null; // 0 a 100
}
```

#### B. Actualizar Base de Datos SQLite Local
En `agent/src/sync/database.ts`:
1. **Migración en caliente (Hot Migration):** Modificar `openQueue()` para agregar las columnas si la base de datos ya existe:
   ```typescript
   for (const stmt of [
     "ALTER TABLE readings_queue ADD COLUMN toner_black INTEGER DEFAULT NULL",
     "ALTER TABLE readings_queue ADD COLUMN toner_cyan INTEGER DEFAULT NULL",
     "ALTER TABLE readings_queue ADD COLUMN toner_magenta INTEGER DEFAULT NULL",
     "ALTER TABLE readings_queue ADD COLUMN toner_yellow INTEGER DEFAULT NULL",
   ]) {
     try { db.exec(stmt); } catch { /* columna ya existe */ }
   }
   ```
2. **Método `enqueueReading`:** Actualizar la consulta `INSERT INTO readings_queue` y sus argumentos para guardar los tóners leídos del hardware.

#### C. Extracción por EWS (HP y Samsung)
En `agent/src/snmp/ews.ts`:
1. **Para HP FutureSmart (`/hp/device/InternalPages/Index?id=SuppliesStatus`):**
   Implementar la búsqueda Regex en el HTML descargado para extraer el porcentaje:
   ```javascript
   const blackLevel = html.match(/id="BlackCartridge1-Header_Level"[^>]*>([^<]+)/);
   const blackPercent = blackLevel ? parseInt(blackLevel[1].replace('%', '')) : null;
   ```
2. **Para Samsung SWS / SyncThru (`/sws.application/information/countersView.sws`):**
   Mapear los porcentajes de tóner que viajan en las variables JavaScript de la página de contadores o suministros.

#### D. Extracción por SNMP (Fallback)
En `agent/src/snmp/scanner.ts`, agregar consulta a los OIDs estándar de `Printer-MIB` (`prtMarkerSuppliesTable`):
* **Descripciones:** `1.3.6.1.2.1.43.11.1.1.6.1.X` (identificar cuál es Negro, Cian, Magenta, Amarillo).
* **Capacidad Máxima:** `1.3.6.1.2.1.43.11.1.1.8.1.X`
* **Nivel Actual:** `1.3.6.1.2.1.43.11.1.1.9.1.X`
* **Cálculo:** `(Nivel Actual / Capacidad Máxima) * 100`.

#### E. Envío a la API (Uploader)
En `agent/src/sync/uploader.ts`, verificar que el payload enviado a la API de STC Cloud incluya los nuevos campos `toner_black`, `toner_cyan`, `toner_magenta`, y `toner_yellow`.

---

### 2. API DEL SERVIDOR (Backend - Node/Express o Python)

1. **Migración de Base de Datos de Producción (PostgreSQL):**
   Agregar columnas a la tabla `device_readings` (o equivalente):
   ```sql
   ALTER TABLE device_readings ADD COLUMN toner_black INTEGER DEFAULT NULL;
   ALTER TABLE device_readings ADD COLUMN toner_cyan INTEGER DEFAULT NULL;
   ALTER TABLE device_readings ADD COLUMN toner_magenta INTEGER DEFAULT NULL;
   ALTER TABLE device_readings ADD COLUMN toner_yellow INTEGER DEFAULT NULL;
   ```
2. **Controlador de Ingesta (Ingestion Endpoint):**
   Modificar la ruta POST que recibe las lecturas del agente (`/api/readings` o similar). Validar los nuevos campos enteros (deben estar entre 0 y 100, o ser `null`) e insertarlos en la base de datos central.

---

### 3. PORTAL WEB (Frontend - React / Next.js)

1. **Diseño de Interfaz Premium (Glassmorphism & Harmonious HSL Colors):**
   En la lista de impresoras de la consola del cliente, renderizar barras de progreso estilizadas con micro-animaciones en hover para reflejar los suministros.
2. **Paleta de Colores Curada:**
   * **Black:** `#1e1e24` (Gris oscuro/negro premium)
   * **Cyan:** `#00a8cc` (Cian brillante moderno)
   * **Magenta:** `#ff2e93` (Magenta neón vibrante)
   * **Yellow:** `#ffd31d` (Amarillo oro cálido)
3. **Indicador de Alerta:**
   Si algún nivel de tóner es **≤ 15%**, mostrar un badge de advertencia estilizado en naranja/rojo y disparar opcionalmente una alerta por correo o Slack/WSS indicando reposición de consumible.

# Prompt de Implementación para Senior Developer: Integración de Niveles de Suministros (Tóner) en STC Cloud

Este prompt detalla de manera técnica e integral todos los cambios necesarios para la recolección, envío, almacenamiento y visualización de niveles de tóners (Negro, Cian, Magenta, Amarillo).

---

## 📋 Estado Actual del Proyecto (v1.6.7)
* **[✓] AGENTE LOCAL (Completado y Desplegado en v1.6.7):** El agente de Windows ya posee la lógica para conectarse a impresoras Samsung (SWS JSON/HTML) y HP (EWS HTML) y por SNMP standard (Printer-MIB fallback). Extrae los niveles de tóners (`toner_black`, `toner_cyan`, `toner_magenta`, `toner_yellow` del 0 al 100%) y los envía correctamente en la ruta de sincronización `/api/v1/devices/sync`.
* **[ ] API DEL SERVIDOR (Pendiente):** La base de datos central PostgreSQL en la nube y la API del servidor aún no tienen las columnas de tóner preparadas ni su procesamiento.
* **[ ] PORTAL WEB (Pendiente):** La interfaz web aún no renderiza las barras de nivel de tóners.

---

## 🛠️ Especificación Técnica para Backend API y Portal Web

### FASE 1: Base de Datos (Knex Migrations)

Crea una nueva migración con Knex en `cloud/src/db/migrations/` (ejemplo: `20260518010000_add_toner_columns.ts`) para añadir las columnas de tóners a las tablas de dispositivos y lecturas.

#### 1. Estructura de la Migración:
* **Tabla `devices`** (guarda el último estado en tiempo real):
  - `toner_black` (`smallint`, nullable, por defecto NULL).
  - `toner_cyan` (`smallint`, nullable, por defecto NULL).
  - `toner_magenta` (`smallint`, nullable, por defecto NULL).
  - `toner_yellow` (`smallint`, nullable, por defecto NULL).
* **Tabla `readings`** (historial de telemetría):
  - `toner_black` (`smallint`, nullable, por defecto NULL).
  - `toner_cyan` (`smallint`, nullable, por defecto NULL).
  - `toner_magenta` (`smallint`, nullable, por defecto NULL).
  - `toner_yellow` (`smallint`, nullable, por defecto NULL).

#### Código de Referencia para la Migración:
```typescript
import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Alterar tabla de dispositivos
  await knex.schema.alterTable("devices", (table) => {
    table.smallint("toner_black").nullable().defaultTo(null);
    table.smallint("toner_cyan").nullable().defaultTo(null);
    table.smallint("toner_magenta").nullable().defaultTo(null);
    table.smallint("toner_yellow").nullable().defaultTo(null);
  });

  // Alterar tabla de lecturas
  await knex.schema.alterTable("readings", (table) => {
    table.smallint("toner_black").nullable().defaultTo(null);
    table.smallint("toner_cyan").nullable().defaultTo(null);
    table.smallint("toner_magenta").nullable().defaultTo(null);
    table.smallint("toner_yellow").nullable().defaultTo(null);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("readings", (table) => {
    table.dropColumn("toner_black");
    table.dropColumn("toner_cyan");
    table.dropColumn("toner_magenta");
    table.dropColumn("toner_yellow");
  });

  await knex.schema.alterTable("devices", (table) => {
    table.dropColumn("toner_black");
    table.dropColumn("toner_cyan");
    table.dropColumn("toner_magenta");
    table.dropColumn("toner_yellow");
  });
}
```

---

### FASE 2: Backend API (Ingestión de Datos)

Modifica el archivo `cloud/src/services/agentService.ts` en la función `syncReadings(redis, readings, agentId)` para capturar e insertar las nuevas variables.

#### 1. Cambios en la Consulta SQL Raw de `devices`:
Agrega los campos de tóner a la consulta SQL que hace `INSERT INTO devices ... ON CONFLICT DO UPDATE SET`.
* **Columnas e inputs de inserción:**
  `VALUES(..., ?, ?, ?, ?)`
* **DO UPDATE SET:**
  `toner_black = EXCLUDED.toner_black,`
  `toner_cyan = EXCLUDED.toner_cyan,`
  `toner_magenta = EXCLUDED.toner_magenta,`
  `toner_yellow = EXCLUDED.toner_yellow`

```typescript
// Dentro de agentService.ts (dentro del bucle de lecturas):
const parseToner = (v: any) => {
  if (v === null || v === undefined) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
};

// ... dentro del INSERT INTO devices ...
const upserted = await this.db.raw<{ rows: { id: string }[] }>(`
  INSERT INTO devices (
    id, agent_id, ip_address, serial_number, name, brand, model, active, last_seen, 
    total_pages, mono_pages, color_pages, poll_method,
    toner_black, toner_cyan, toner_magenta, toner_yellow
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, true, NOW(), ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (agent_id, serial_number) WHERE serial_number IS NOT NULL
  DO UPDATE SET
    ip_address    = EXCLUDED.ip_address,
    brand         = COALESCE(NULLIF(EXCLUDED.brand, 'unknown'), devices.brand),
    model         = COALESCE(EXCLUDED.model, devices.model),
    name          = CASE
                      WHEN devices.name IS NULL
                        OR devices.name = devices.serial_number
                        OR devices.name LIKE '%;%'
                        OR devices.name LIKE '%V4.%'
                      THEN EXCLUDED.name
                      ELSE devices.name
                    END,
    last_seen     = NOW(),
    active        = true,
    total_pages   = EXCLUDED.total_pages,
    mono_pages    = EXCLUDED.mono_pages,
    color_pages   = EXCLUDED.color_pages,
    poll_method   = EXCLUDED.poll_method,
    toner_black   = EXCLUDED.toner_black,
    toner_cyan    = EXCLUDED.toner_cyan,
    toner_magenta = EXCLUDED.toner_magenta,
    toner_yellow  = EXCLUDED.toner_yellow
  RETURNING id
`, [
  crypto.randomUUID(),
  agentId,
  r.ip || null,
  (r.device_id || "").slice(0, 150),
  friendlyName.slice(0, 255),
  brand.slice(0, 100),
  cleanModel.slice(0, 255),
  parseCount(r.total_pages),
  parseCount(r.mono_pages),
  parseCount(r.color_pages),
  pollMethod,
  parseToner(r.toner_black),
  parseToner(r.toner_cyan),
  parseToner(r.toner_magenta),
  parseToner(r.toner_yellow)
]);
```

#### 2. Cambios en la inserción del historial (`mappedReadings.push`):
Asegúrate de agregar los tóners al mapeo para que se inserten de forma masiva en `readings`:
```typescript
mappedReadings.push({
  id: crypto.randomUUID(),
  time: readingTime,
  device_id: deviceId,
  total_pages: parseCount(r.total_pages),
  mono_pages:  parseCount(r.mono_pages),
  color_pages: parseCount(r.color_pages),
  toner_black: parseToner(r.toner_black),
  toner_cyan: parseToner(r.toner_cyan),
  toner_magenta: parseToner(r.toner_magenta),
  toner_yellow: parseToner(r.toner_yellow),
  offline:     r.offline ?? false,
});
```

---

### FASE 3: Frontend Portal (Vite / React)

Modifica los archivos del frontend para renderizar barras de consumibles con estética moderna (Curated colors, Glassmorphism, y Micro-animations).

#### 1. Modificar `cloud/portal/src/pages/Devices.tsx` (Lista general de dispositivos):
* Agrega los tipos a la interfaz `Device` al principio del archivo:
  ```typescript
  interface Device {
    // ... campos anteriores
    toner_black: number | null;
    toner_cyan: number | null;
    toner_magenta: number | null;
    toner_yellow: number | null;
  }
  ```
* En el componente de renderizado de la tarjeta de dispositivo (debajo del modelo/marca, antes del pie de la tarjeta), agrega un bloque estilizado y compacto para visualizar los tóners.
* Si el dispositivo solo reporta `toner_black`, se debe renderizar únicamente una barra negra (Monocromo). Si reporta colores, se deben renderizar 4 barras CMYK ultra-estilizadas una al lado de la otra.

**Ejemplo de código para renderizar las barritas en la tarjeta (`Devices.tsx`):**
```tsx
{/* Sección de Tóners en la Tarjeta */}
{(device.toner_black !== null) && (
  <div className="mt-4 pt-3 border-t border-slate-50 space-y-2">
    <div className="flex justify-between items-center text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">
      <span>Consumibles</span>
      <span>{device.toner_black}%</span>
    </div>
    
    {device.toner_cyan === null ? (
      // Impresora Monocromática (Solo Barra Negra)
      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
        <div 
          className="h-full bg-slate-800 rounded-full transition-all duration-500" 
          style={{ width: `${device.toner_black}%` }}
        />
      </div>
    ) : (
      // Impresora Color (Barras CMYK Miniatura)
      <div className="grid grid-cols-4 gap-1.5">
        <div className="h-1 bg-slate-100 rounded-full overflow-hidden" title={`Negro: ${device.toner_black}%`}>
          <div className="h-full bg-slate-800" style={{ width: `${device.toner_black}%` }} />
        </div>
        <div className="h-1 bg-slate-100 rounded-full overflow-hidden" title={`Cian: ${device.toner_cyan}%`}>
          <div className="h-full bg-[#00adef]" style={{ width: `${device.toner_cyan}%` }} />
        </div>
        <div className="h-1 bg-slate-100 rounded-full overflow-hidden" title={`Magenta: ${device.toner_magenta}%`}>
          <div className="h-full bg-[#ec008c]" style={{ width: `${device.toner_magenta}%` }} />
        </div>
        <div className="h-1 bg-slate-100 rounded-full overflow-hidden" title={`Amarillo: ${device.toner_yellow}%`}>
          <div className="h-full bg-[#fff200]" style={{ width: `${device.toner_yellow}%` }} />
        </div>
      </div>
    )}
  </div>
)}
```

#### 2. Modificar `cloud/portal/src/pages/DeviceDetail.tsx` (Ficha detallada del dispositivo):
* Actualiza las interfaces `Device` y `Reading` para incluir las 4 columnas de tóner.
* En la columna derecha (Stats Panel), justo arriba del gradiente de "Contadores Actuales", introduce una nueva tarjeta (`cd-panel`) dedicada 100% al estado de consumibles del dispositivo en tiempo real.
* Agrega un diseño estéticamente sobresaliente que muestre los cartuchos como barras verticales con sus respectivos porcentajes y colores temáticos muy limpios.

**Ejemplo de código para la sección en `DeviceDetail.tsx`:**
```tsx
{/* Panel de Consumibles en Detalle */}
{device && (readings[0]?.toner_black !== undefined && readings[0]?.toner_black !== null) && (
  <div className="cd-panel p-6 bg-white border border-slate-100 rounded-[24px] space-y-6">
    <div className="flex items-center gap-3">
      <div className="p-2 bg-slate-50 rounded-xl text-[#e67e22]">
        <Activity size={20} />
      </div>
      <div>
        <h4 className="font-extrabold text-[#1a2333] text-sm">Nivel de Consumibles</h4>
        <p className="text-[10px] font-bold text-slate-400">Estado actual de cartuchos</p>
      </div>
    </div>

    {readings[0].toner_cyan === null ? (
      // Impresora Monocromática (Barra Horizontal Destacada)
      <div className="space-y-2">
        <div className="flex justify-between items-center text-xs font-extrabold">
          <span className="text-slate-500 uppercase tracking-widest text-[10px]">Tóner Negro</span>
          <span className="text-slate-700">{readings[0].toner_black}%</span>
        </div>
        <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden relative">
          <div 
            className="h-full bg-gradient-to-r from-slate-700 to-slate-900 rounded-full transition-all duration-1000"
            style={{ width: `${readings[0].toner_black}%` }}
          />
        </div>
      </div>
    ) : (
      // Impresora Color CMYK (Barritas Verticales de Alto Impacto)
      <div className="grid grid-cols-4 gap-4 text-center">
        {[
          { label: 'K', color: 'from-slate-700 to-slate-900', val: readings[0].toner_black },
          { label: 'C', color: 'from-cyan-400 to-cyan-500', val: readings[0].toner_cyan },
          { label: 'M', color: 'from-pink-400 to-pink-500', val: readings[0].toner_magenta },
          { label: 'Y', color: 'from-yellow-300 to-yellow-400', val: readings[0].toner_yellow },
        ].map(t => (
          <div key={t.label} className="space-y-3">
            <div className="h-32 bg-slate-50 rounded-2xl flex flex-col justify-end overflow-hidden p-1 border border-slate-100 relative group">
              <div 
                className={`w-full bg-gradient-to-t ${t.color} rounded-xl transition-all duration-1000`}
                style={{ height: `${t.val}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-slate-800 drop-shadow-sm opacity-60">
                {t.val}%
              </span>
            </div>
            <span className="text-xs font-black text-slate-400 uppercase">{t.label}</span>
          </div>
        ))}
      </div>
    )}
  </div>
)}
```

---

### NOTA DE CALIDAD (QA):
- Realiza el `npm run build` del portal web después de realizar los cambios para asegurar de que no hay ningún error de tipado con TypeScript.
- Ejecuta las migraciones de Knex localmente (`npm run db:migrate` o equivalente) para verificar que las columnas nuevas se creen limpiamente en tu base de datos de desarrollo antes de enviarlo a producción.

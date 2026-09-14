# Endpoints y Métodos de Consulta a Impresoras (STC Cloud Agent)

Este documento registra de forma permanente el comportamiento esperado, rutas HTTP (EWS) y fallbacks (SNMP) que nuestro agente consulta a las impresoras. Esta documentación previene regresiones en versiones futuras (por ejemplo, cuando se remueve el SNMP y los equipos dejan de leerse).

## 1. Samsung

Las impresoras Samsung se comunican de forma primaria a través de EWS (Embedded Web Server), usando dos estándares según su antigüedad y tipo:

### 1.1 SWS (Samsung Solution Web Service)
**Equipos:** Nuevos, copiadoras potentes (familias `LX`, `FX`, `GX` como el `X4300LX`).
**Endpoints:**
- `/sws.application/home/homeDeviceInfo.sws` (Información básica, modelo, serial)
- `/sws.application/information/suppliesView.sws` (Niveles de tóner)
- `/sws.application/information/countersView.sws` (Contadores Mono/Color/Totales)

### 1.2 SyncThru Web Service (JSON)
**Equipos:** Clásicos e impresoras pequeñas/medianas (como las `SL-M4072FD`, `SL-M4020ND`, `SCX-483x`).
**Endpoints:**
- `/sws/app/information/home/home.json` (Estado del equipo, Modelo, Serial, Tóner)
- `/sws/app/information/identity/identity.json` (Modelo, IP, Mac, Hostname)
- `/sws/app/information/supplies/supplies.json` (Vida útil de consumibles, código y serie del cartucho)
- `/sws/app/information/counters/counters.json` (Contadores de Impresión: `GXI_BILLING_TOTAL_IMP_CNT`)

> **[IMPORTANTE]**  
> Las impresoras antiguas (ej. `SL-M4072FD`) **se bloquean/cuelgan a nivel de firmware** si se intenta consultar un endpoint SWS (`/sws.application/...`) que no soportan, provocando que no contesten a los siguientes llamados de SyncThru. 
> Por lo tanto, el orden de consulta en `ews.ts` es crítico: **Siempre se debe probar SyncThru primero**, a menos que tengamos la certeza (vía SNMP u otra fuente) de que el equipo es una copiadora `LX`/`FX`/`GX`.

## 2. HP

### Endpoints (Cascada de precisión)
- `/hp/device/InternalPages/Index?id=SuppliesStatus` (Niveles de tóner)
- `/DevMgmt/ProductUsageDyn.xml` (Extracción de contadores en formato XML, muy confiable)
- `/hp/device/InternalPages/Index?id=UsagePage` (Scraping HTML antiguo para equipos sin XML)

## 3. Lexmark

### Endpoints
- `/cgi-bin/dynamic/printer/PrinterStatus.html` (Niveles de tóner)
- `/cgi-bin/dynamic/printer/config/reports/deviceinfo.html` (Información del equipo y Contadores)

## 4. Ricoh, Brother, Xerox, Epson, Canon, Konica Minolta

Actualmente se usa un parseador genérico de EWS sobre endpoints fijos o se depende fuertemente del SNMP.
- **Ricoh:** `/web/entry.cgi?func=STR_PRTCNT`
- **Brother:** `/general/status.html`
- **Epson:** `/PRESENTATION/HTML/TOP/PRTINFO.HTML`
- **Canon:** `/English/pages/cnc_status.html`
- **Konica Minolta:** `/wcd/index.html`
- **Xerox:** `/cgi-bin/cgix/xerox/printerStat.cgi`

---

## El Papel Crucial del SNMP (Fallback)

SNMP **nunca debe ser eliminado** del proceso de recolección (`readViaSNMP`), ni siquiera cuando se requiere un monitoreo "Solo por EWS". 

**Razón:**
Cuando EWS falla (por time-out, firmware bloqueado, o el equipo simplemente no tiene EWS expuesto o la IP es remota y solo rutea puerto 161), el SNMP entra a salvar el día y provee la lectura base de los OIDs:
- `1.3.6.1.2.1.43.10.2.1.4.1.1` (Páginas totales PWG, universal)
- Tóner (vía MIB nativo `1.3.6.1.2.1.43.11.1.1.9.1`)

Si un administrador bloquea manualmente el puerto SNMP, EWS cubrirá la lectura. Si EWS falla, SNMP cubrirá la lectura. Ambas capas deben funcionar en cascada inteligente para obtener una alta tasa de éxito de lecturas.

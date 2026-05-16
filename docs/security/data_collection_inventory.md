# STC Cloud Monitor — Data Collection Inventory
**Versión:** 1.5 | **Fecha:** 2026-05-16 | **Clasificación:** Público / Auditoría IT

---

## 1. Propósito del Documento

Este documento enumera exhaustivamente todos los datos que el agente **STC Cloud Monitor** recopila, almacena y transmite. Su objetivo es facilitar revisiones de privacidad, auditorías de seguridad y cumplimiento con normativas de protección de datos (GDPR, LGPD, leyes locales).

**Conclusión ejecutiva:** El agente recopila exclusivamente métricas operativas de impresoras (contadores de páginas, modelo, número de serie). **No recopila, procesa ni transmite ningún dato de usuarios, documentos, credenciales de red ni Información de Identificación Personal (PII).**

---

## 2. Inventario de Datos — Tabla de Diccionario

### 2.1 Datos Recopilados de Dispositivos (vía SNMP)

| # | Campo | Tipo | Origen | Propósito | Sensibilidad | Transmitido al Servidor |
|---|-------|------|---------|-----------|--------------|------------------------|
| 1 | `ip` | String (IPv4) | Red local — SNMP scan | Identificar la impresora en la red del cliente | **Media** — IP privada, no ruteable externamente | Sí |
| 2 | `brand` | Enum (hp/lexmark/samsung/ricoh/brother/xerox/generic) | OID SNMP `sysObjectID` | Selección de OIDs correctos para la marca | Baja | Sí |
| 3 | `model` | String (máx. 100 chars) | OID SNMP `sysDescr` truncado | Identificación del modelo para reportes | Baja | Sí |
| 4 | `sysDescr` | String (máx. 255 chars) | OID `1.3.6.1.2.1.1.1.0` | Descripción técnica del dispositivo (solo almacenamiento local) | Baja | **No** |
| 5 | `sysName` | String | OID `1.3.6.1.2.1.1.5.0` | Nombre del dispositivo en la red (solo almacenamiento local) | Baja | **No** |
| 6 | `serial` | String | OID específico por marca (ver `oids.ts`) | Identificador único del dispositivo físico | **Media** — número de serie del fabricante | Sí (como `device_id`) |
| 7 | `total_pages` | Integer | OID de contador por marca | Facturación de páginas totales impresas | Baja | Sí |
| 8 | `mono_pages` | Integer | OID de contador por marca | Facturación de páginas monocromo | Baja | Sí |
| 9 | `color_pages` | Integer | OID de contador por marca | Facturación de páginas color | Baja | Sí |
| 10 | `time` | String ISO 8601 | Reloj del sistema Windows | Timestamp de la lectura SNMP | Baja | Sí |

### 2.2 Datos del Payload Transmitido al Servidor

El endpoint receptor es `POST {serverUrl}/api/v1/devices/sync`. El payload contiene exactamente estos campos:

| Campo | Descripción | Fuente |
|-------|-------------|--------|
| `device_id` | Número de serie de la impresora; si no disponible, su IP | SNMP / local |
| `ip` | Dirección IP de la impresora | SNMP |
| `brand` | Fabricante detectado | SNMP |
| `model` | Modelo del dispositivo | SNMP |
| `time` | Timestamp ISO de la lectura | Sistema local |
| `total_pages` | Contador total de páginas | SNMP |
| `mono_pages` | Contador monocromo | SNMP |
| `color_pages` | Contador color | SNMP |
| `offline` | Flag booleano (`true`) | Constante hardcoded |

> **Nota de red:** Todas las transmisiones usan HTTPS (TLS 1.2+) con autenticación Bearer JWT. El agente admite proxy corporativo HTTP/HTTPS configurable.

### 2.3 Datos Almacenados Localmente

**Ubicación:** `C:\ProgramData\STCCloudMonitor\local.db` (SQLite, solo lectura por el servicio)

| Tabla | Campos | Retención | Propósito |
|-------|--------|-----------|-----------|
| `readings_queue` | device_id, ip, brand, model, time, total_pages, mono_pages, color_pages, synced, created_at | 7 días (purga automática) | Cola de envío con soporte offline |
| `known_devices` | ip, serial, brand, model, registered, last_seen | Indefinida (catálogo de dispositivos) | Evitar re-registro innecesario |

### 2.4 Configuración Cifrada

**Ubicación:** `C:\ProgramData\STCCloudMonitor\config.enc` (AES-256-GCM)

| Campo | Contenido | Sensibilidad | Almacenamiento |
|-------|-----------|--------------|----------------|
| `serverUrl` | URL del portal STC Cloud | Baja | Local cifrado |
| `agentId` | UUID asignado en activación | Baja | Local cifrado |
| `token` | JWT de autenticación (bearer) | **Alta** | Local cifrado |
| `refreshToken` | Token de refresco JWT | **Alta** | Local cifrado |
| `ipRanges` | Rangos IP a escanear (definidos por admin) | **Media** — topología de red | Local cifrado |
| `snmpCommunity` | Community string SNMP (típicamente "public") | **Media** | Local cifrado |
| `snmpVersion` | Versión SNMP (1 o 2c) | Baja | Local cifrado |
| `scanIntervalMinutes` | Frecuencia de escaneo en minutos | Baja | Local cifrado |
| `proxyUrl` | URL del proxy corporativo (opcional) | **Media** — puede incluir credenciales | Local cifrado |

> **Mecanismo de cifrado:** AES-256-GCM. La clave de cifrado se deriva con PBKDF2 (SHA-256, 100.000 iteraciones, salt único) a partir del Hardware ID del equipo (hash SHA-256 del MachineGuid de Windows Registry + Serial BIOS). **El Hardware ID nunca se transmite ni almacena en texto claro.**

---

## 3. Datos Explícitamente NO Recopilados

El agente **no recopila** ninguno de los siguientes datos:

| Categoría | Ejemplos | Confirmación técnica |
|-----------|----------|----------------------|
| PII de usuarios | Nombres, emails, DNI, cuentas de usuario | No existe código de acceso a AD/LDAP/SAM |
| Contenido de documentos | Archivos impresos, texto de documentos | SNMP solo expone contadores, no spools |
| Capturas de pantalla o actividad de usuario | Actividad en PC, historial de aplicaciones | Agente no tiene acceso a sesiones de usuario |
| Contraseñas de red | Credenciales de dominio, WiFi, aplicaciones | No hay acceso a credential manager |
| Inventario de software | Aplicaciones instaladas en el equipo host | Solo accede a Registry para MachineGuid |
| Tráfico de red | Contenido de paquetes, DNS queries | Solo genera tráfico SNMP saliente a rangos configurados |

---

## 4. Flujo de Datos (Data Flow Diagram)

```
Impresoras en red local
(SNMP UDP port 161)
        │
        ▼
[STC Cloud Monitor Agent]  ←── SNMP scan (lectura, sin escritura)
 C:\ProgramData\STCCloudMonitor\
 ├── local.db (SQLite, retención 7 días)
 └── config.enc (AES-256-GCM, ligado al hardware)
        │
        │ HTTPS POST /api/v1/devices/sync
        │ Bearer JWT
        │ (solo contadores + identificadores de impresoras)
        ▼
[Portal STC Cloud]
(servidor del proveedor STC)
```

**Datos que ENTRAN al agente:** Respuestas SNMP de impresoras (contadores y metadatos de dispositivo).  
**Datos que SALEN del agente:** Contadores de páginas + identificadores de impresoras → servidor STC Cloud.  
**Datos que NUNCA salen:** Hardware ID, configuración, credenciales JWT, topología de red completa.

---

## 5. Clasificación de Riesgo de Privacidad

| Riesgo | Nivel | Justificación |
|--------|-------|---------------|
| Exposición de PII | **Ninguno** | El agente no accede ni procesa datos de personas |
| Exposición de datos de negocio sensibles | **Bajo** | Solo contadores numéricos de páginas |
| Exposición de topología de red | **Bajo** | Las IPs de impresoras son internas; no se envían rangos de escaneo |
| Credenciales comprometidas | **Bajo** | JWT cifrado con AES-256-GCM ligado al hardware físico del equipo |
| Pérdida de datos | **Bajo** | Retención local máxima 7 días; datos son contadores replicables |

---

## 6. Contacto y Responsabilidad

| Rol | Responsabilidad |
|-----|-----------------|
| **Proveedor (STC)** | Custodio de los datos transmitidos al portal; responsable de su almacenamiento y procesamiento |
| **Cliente (IT Admin)** | Define rangos IP de escaneo y periodo de retención; propietario del equipo host del agente |
| **Auditor de privacidad** | Puede solicitar logs de auditoría en `C:\ProgramData\STCCloudMonitor\agent.log` |

---

*Documento generado a partir del análisis del código fuente de STC Cloud Monitor v1.5. Para revisiones o consultas, contactar al equipo de seguridad de STC.*

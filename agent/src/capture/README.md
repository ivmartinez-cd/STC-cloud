# `agent/src/capture` — Motor de captura por modelo

Captura **identidad, contadores, insumos, alertas y bandejas** de impresoras de red con la disciplina de un DCA comercial
(HP SDS / FMAudit / MPS Monitor): *un archivo declarativo por modelo*, *familias de protocolo compartidas*, *Printer-MIB como red de seguridad*
y *mejor dato por campo* entre fuentes.

```
captureDevice({ ip, community, scopes, hint, trustHint })
   ├─ checkOpenPorts()         9100 / 631 / 80 / 443
   ├─ identify()               sondas EWS de las familias → SNMP (sysObjectID, hrDeviceDescr) → PJL → IPP
   ├─ resolve()                perfil de modelo → familia por puntaje → generic.printer-mib
   ├─ family.collect(scopes)   (o hooks.collect del perfil)
   ├─ completar huecos         generic.printer-mib → PJL (total) → IPP (identidad)
   ├─ hooks.afterCollect       ajustes del perfil (p. ej. bandeja ADF fija)
   └─ toDeviceReading()        contrato plano del servidor (/api/v1/devices/sync)
```

| Carpeta / archivo | Qué contiene |
|---|---|
| `types.ts` | Contratos (`CaptureFamily`, `ModelProfile`, `CaptureContext`, `CaptureResult`, `CaptureScope`). |
| `index.ts` | El motor (`captureDevice`, `checkOpenPorts`). |
| `registry.ts` | Registro de familias y perfiles, `resolve()`. |
| `normalize.ts` | `CaptureResult → DeviceReading`. Único lugar con el mapeo a snake_case. |
| `bridge.ts` | `fromEwsData()` (reusa parsers de `snmp/ews-parsers`), `mergeResults()`, `mergeDefined()`. |
| `transport/` | `http.ts` (`fetchHttp`, `xmlVal`, `toInt`, `clampPct`) y `snmp.ts` (`SnmpClient`). |
| `families/` | Lógica de protocolo por firmware. Ver cabecera de cada archivo para endpoints/OIDs. |
| `models/<marca>/` | **Un archivo por modelo** (`defineModel`). `models/index.ts` es el catálogo ordenado. |

## Agregar un modelo (5 minutos)
1. Crear `models/<marca>/<modelo>.ts`:
   ```ts
   import { defineModel } from '../../types';
   export default defineModel({
     id: 'hp.m404dn', brand: 'hp', displayName: 'HP LaserJet Pro M404dn',
     family: 'hp.devmgmt',
     match: { brand: 'hp', model: /M404|M405/i },
     expect: { color: false, duplex: true, adf: false, scopes: ['identity', 'meters', 'supplies'] },
     notes: 'DevMgmt XML completo; sin InternalPages.',
   });
   ```
2. Importarlo y agregarlo a `models/index.ts` (los más específicos primero).
3. Sumar el caso a `tests/capture.test.ts` (resolución) y, si trae `hooks`, un test con fixtures.
4. `npx tsc --noEmit && npm test`.

## Agregar una familia
Implementar `CaptureFamily` en `families/<marca>-<firmware>.ts`:
- `score(identity, ports)`: 0 = no aplica; 60–90 para marca+firmware reconocido.
- `probeIdentity(ctx)`: 1 request barato que confirme la familia cuando no hay SNMP.
- `collect(ctx, scopes)`: pedir **sólo** lo necesario para los scopes; devolver parcial/`null`, nunca lanzar.
- Registrarla en `registry.ts` (`FAMILIES`). Usar `fromEwsData()` si reutilizás parsers existentes.

## Reglas
- Sin `any`. Sin lógica de protocolo en perfiles. No inventar `color = 0` (eso lo decide `expect.color`).
- `id` de perfiles/familias es contrato persistido (`known_devices.driver`): no renombrar.
- Cada familia debe ser testeable inyectando `ctx.http` y `ctx.snmp` (ver `tests/capture.test.ts`).

Documento rector: `docs/dev/STC_Capture_Drivers_Master_Prompt.md`.

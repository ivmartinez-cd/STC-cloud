# Alta de un modelo nuevo de impresora

Runbook operativo de punta a punta: desde que aparece un equipo que no se lee bien
hasta que toda la flota lo captura en producción.

Complementa, no reemplaza:

- `agent/src/capture/README.md` — la referencia del módulo (contratos y ejemplos cortos).
- `docs/dev/STC_Capture_Drivers_Master_Prompt.md` — el prompt maestro y el porqué del diseño.

Este archivo cubre lo que a esos dos les falta: **cómo decidir si hace falta código**,
**cómo conseguir los datos reales del equipo** y **cómo llega el cambio al parque**.

---

## 0. La regla que evita trabajo al pedo

El motor está organizado por **familia** (el dialecto de EWS de un firmware), no por
modelo. Hay ~8 familias para toda la flota. Antes de escribir nada, ubicá el caso:

| Caso | Qué hace falta | ¿Release del agente? |
|---|---|---|
| **A.** Modelo nuevo de una familia ya soportada | Nada | No |
| **B.** Anda, pero con algún dato mal o faltante | Perfil de modelo (`defineModel`) | Sí |
| **C.** El firmware habla un dialecto que nadie parsea | Familia nueva | Sí |
| **D.** Marca que el sistema no conoce | Marca + familia | Sí |

El caso A es el más común y **es el caso normal**: 14 Samsung M458x y 55 HP Laser
MFP 432fdn de la flota nunca tuvieron código propio — caen solos en
`samsung.syncthru`. Un modelo nuevo de una marca ya soportada suele entrar sin tocar
una línea.

Además, cualquier impresora que hable **Printer-MIB estándar** entrega nivel de
consumibles, contadores, alertas y bandejas por SNMP sin código alguno
(`families/generic-printer-mib.ts`). Esa es la red de seguridad: un equipo
desconocido no queda en cero, queda con lo básico.

---

## 1. Diagnóstico: ¿en qué caso estoy?

### 1.1 Qué familia le toca hoy

```ts
// script suelto con tsx, no dejar commiteado
import { resolve } from './src/capture/registry';
const r = resolve({ brand: 'hp', model: 'HP Laser MFP 432fdn', serial: null } as any,
                  { http: true, https: true } as any);
console.log(r.family.id, r.via);   // -> samsung.syncthru score
```

`via` dice cómo se eligió: `profile` (hay perfil de modelo), `score` (ganó una
familia por puntaje) o `generic` (cayó a Printer-MIB).

### 1.2 Qué está capturando de verdad

En la base de producción, el JSON crudo que mandó el agente:

```sql
SELECT brand, model, serial_number, toner_black, total_pages,
       jsonb_pretty(supplies_details)
FROM devices WHERE id = '<uuid>';
```

Compará contra lo que el equipo muestra en su EWS. La diferencia es el trabajo real.

> Si `brand` sale `generic` y `serial_number` sale `?`, es caso **D**: el sistema no
> reconoce la marca.

---

## 2. Conseguir los datos reales del equipo

**Nunca escribir un parser contra una página inventada o contra la documentación del
fabricante.** Siempre contra el HTML/JSON que sirve el equipo.

### 2.1 Por el túnel EWS (equipos de un cliente, sin ir a la sede)

Requisitos: el agente de esa sede online y `remote_ews_enabled = true`.

Usar el **gateway navegable**, no el endpoint viejo:

```bash
# 1) Abrir sesión (devuelve una URL con ticket de un solo uso)
curl -sk -b cj.txt -H "X-CSRF-Token: $CSRF" \
  -X POST "$API/api/v1/agents/<agent_id>/ews-session" \
  -H "Content-Type: application/json" -d '{"device_id":"<device_id>"}'
# -> {"url":"https://ews.<host>/__stc/open?ticket=..."}

# 2) Canjear el ticket (deja la cookie de sesión)
curl -sk -c gw.txt "<url del paso 1>"

# 3) Navegar el EWS del equipo por el gateway
curl -sk -b gw.txt "https://ews.<host>/<ruta del EWS>" -o pagina.html
```

> **No usar `POST /agents/:id/ews-proxy`.** Es el mecanismo viejo (deuda SEC-10):
> va sólo por HTTP y sólo reintenta por TLS si el puerto 80 falla a nivel
> transporte. Contra cualquier equipo que fuerce HTTPS —la mayoría de los
> modernos— devuelve el 302/307 en vez del contenido. Verificado el 15/09/2026
> contra un HP Laser MFP 432fdn y un Epson WF-C5891.

### 2.2 Por SNMP

```bash
snmpwalk -v2c -c public <ip> 1.3.6.1.2.1.43     # Printer-MIB completo
snmpwalk -v2c -c public <ip> 1.3.6.1.2.1.43.11.1.1   # tabla de consumibles
```

### 2.3 Guardar el fixture

Todo lo capturado va a `agent/src/tests/fixtures/<familia>/`, con nombre que diga
modelo e idioma:

```
suppliesView-m5370lx-ko.html      ← M5370LX, EWS en coreano
suppliesView-m458x-ko.html        ← M458x real de ISSN, por el túnel
countersView-m4580-es-reconstructed.html
```

El sufijo de idioma no es decorativo: ver §3.2.

---

## 3. Escribir el código

### 3.1 Caso B — perfil de modelo

Un archivo declarativo en `agent/src/capture/models/<marca>/<modelo>.ts`:

```ts
import { defineModel } from '../../types';

export default defineModel({
  id: 'hp.m404dn',
  brand: 'hp',
  displayName: 'HP LaserJet Pro M404dn',
  family: 'hp.devmgmt',
  match: { brand: 'hp', model: /M404|M405/i },
  expect: { color: false, duplex: true, adf: false, scopes: ['identity', 'meters', 'supplies'] },
  notes: 'DevMgmt XML completo; sin InternalPages.',
});
```

- `match` acepta `model` (RegExp contra `model`/`sysDescr`/`sysName`),
  `sysObjectId` (prefijo del enterprise OID, más confiable que el texto),
  `brand` y `exclude`.
- `hooks.afterCollect` ajusta lo que devolvió la familia; `hooks.collect` la
  reemplaza entera (sólo para firmware atípico).
- Registrarlo en `models/index.ts`, **los más específicos primero**.

### 3.2 Caso C — familia nueva

Implementar `CaptureFamily` en `agent/src/capture/families/<marca>-<firmware>.ts`:

```ts
export const miFamilia: CaptureFamily = {
  id: 'epson.ews',
  brand: 'epson',
  displayName: 'Epson Web Config',
  capabilities: ['identity', 'meters', 'supplies'],
  score(identity, ports) { /* 0 = no aplica; 60–90 marca+firmware reconocidos */ },
  async probeIdentity(ctx) { /* 1 request barato; null rápido si no es de la familia */ },
  async collect(ctx, scopes) { /* pedir SÓLO los scopes pedidos; nunca lanzar */ },
};
```

Registrarla en el array `FAMILIES` de `registry.ts`.

> **Regla de oro del parseo: no leer etiquetas traducidas.**
>
> El idioma del EWS lo define la sesión del equipo, no el `Accept-Language`. Un
> M5370LX de Canal Directo sirve su página en coreano aunque el navegador la
> muestre en inglés, y un Lexmark de ISSN la sirve en español. Un parser que
> busque `"Toner Cartridge"` funciona en el laboratorio y falla en la flota.
>
> Anclar siempre a algo estable, en este orden de preferencia:
> 1. **Atributos `id`/`class`** del HTML (Samsung SWS: `cartCont`, `capacityCont`).
> 2. **Valores con forma reconocible** (`85 %`, `1494/250000`, un gradiente CSS).
> 3. **Tokens que no se traducen** (`BK`/`Y`/`M`/`C`, nombres de archivo de íconos).
> 4. Y recién si no queda otra, palabras clave **multiidioma** (ver `COLOR_BY_TITLE`
>    en `samsung/sws-supplies.ts`).

### 3.3 Caso D — marca nueva

El tipo `Brand` es una unión cerrada en `agent/src/snmp/oids.ts`. Sumar una marca
toca tres lugares de ese archivo:

1. `export type Brand = 'hp' | 'lexmark' | ... | 'generic'` → agregar la marca.
2. `detectBrandFromText()` → agregar el caso (`if (t.includes('epson')) return 'epson'`).
3. `detectBrandFromOid()` / `OID_MAPS` → el enterprise OID de la marca, si se conoce.

Mientras la marca no esté en esa unión, **todos** los equipos de ese fabricante
quedan como `generic` y ninguna familia propia les puede dar puntaje.

### 3.4 Qué NO hay que tocar

- `normalize.ts` / el contrato `DeviceReading`: cambiar un nombre de campo exige
  migración coordinada servidor + cola SQLite del agente.
- El lado nube casi nunca cambia: `supplies_details` viaja como JSON y
  `cloud/src/modules/supplies/domain/services/supply-row-builder.ts` ya mapea
  tóners, tambores y los slots de mantenimiento con nombre. Sólo hay que tocarlo
  si aparece un **tipo de consumible nuevo** (p. ej. "caja de mantenimiento" de
  Epson, que no tiene slot).

---

## 4. Tests

Obligatorio, contra el fixture real:

```ts
const html = fs.readFileSync(path.join(FIX, 'suppliesView-m458x-ko.html'), 'utf8');
test('el 0 K de capacidad es SIN DATO, no cero', () => {
  assert.equal(details.toners.black?.capacity, null);
  assert.equal(details.toners.black?.remainingPages, null);
});
```

Casos que conviene cubrir siempre, porque son los que aparecieron en equipos reales:

- El equipo informa **`0` como "no sé"** (capacidad `0 K`) vs. un **0 real** (un
  rodillo sin uso). No son lo mismo y confundirlos inventa datos.
- Un HTML **sin** los marcadores esperados → devolver vacío, no basura.
- Resolución de familia del modelo nuevo (`resolve()` en `tests/capture.test.ts`).

Antes de commitear:

```bash
cd agent && npx tsc --noEmit && npx tsx --test src/tests/capture.test.ts
```

Sumar el archivo de test nuevo al script `test` de `agent/package.json`.

---

## 5. Publicar el release

Sólo para los casos B, C y D. El caso A no requiere nada.

Es **un release para toda la flota**, no uno por cliente ni por modelo.

```bash
# 1) Versión (toca version.ts, package.json y los dos .iss). Antes de compilar.
./installer/bump-version.sh 1.3.7

# 2) Los dos bundles. El canal va horneado adentro.
cd agent
node build-sea.js --channel stable
node build-sea.js --channel legacy --target node20 --out-dir dist-legacy

# 3) Firmar (Ed25519)
cd .. && node installer/sign-bundle.js agent/dist/bundle.js
node installer/sign-bundle.js agent/dist-legacy/bundle.js

# 4) Publicar
export STC_PORTAL_USER=admin STC_PORTAL_PASSWORD=...
./installer/publish-release.sh agent/dist/bundle.js        1.3.7 stable
./installer/publish-release.sh agent/dist-legacy/bundle.js 1.3.7 legacy
```

### Verificaciones que no hay que saltear

Las tres fallaron alguna vez y las tres fallan **en silencio**:

```bash
# a) La firma valida contra la MISMA clave que usan los agentes
#    (UPDATE_PUBLIC_KEY_HEX en agent/src/core/updateKey.ts)
HEX=$(grep -oE "'[0-9a-f]{64,}'" agent/src/core/updateKey.ts | tr -d "'")
node -e "
const {createPublicKey,verify}=require('crypto'), fs=require('fs');
const pub=createPublicKey({key:Buffer.from(process.argv[1],'hex'),format:'der',type:'spki'});
for (const f of ['agent/dist/bundle.js','agent/dist-legacy/bundle.js'])
  console.log(f, verify(null, fs.readFileSync(f), pub, fs.readFileSync(f+'.sig')) ? 'OK' : 'INVALIDA');
" "$HEX"

# b) El canal horneado coincide con el canal publicado
head -c 40 agent/dist/bundle.js         # /* stc-channel:stable target:node24 */
head -c 40 agent/dist-legacy/bundle.js  # /* stc-channel:legacy target:node20 */

# c) El hash servido == el hash registrado
curl -sk "$API/updates/bundle-stable.js" | sha256sum
psql -c "SELECT version, channel, left(sha256,16) FROM agent_releases WHERE version='1.3.7'"
```

Si (c) no coincide, el agente **descarta el update sin avisar**: no hay alerta en el
portal, sólo un log local. Pasó cuando los dos canales subían al mismo `bundle.js`.

---

## 6. Verificar en producción

### Cuándo llega

| Etapa | Cuándo |
|---|---|
| El agente chequea updates | al arrancar + cada 4 h (`core/main.ts`) |
| Primer barrido tras reiniciar | inmediato (discovery incluye `supplies`) |
| Loop de consumibles en régimen | 60 min en horario laboral / 240 fuera (`MonitorIntervals.ts`, configurable por agente) |

En la práctica, el 15/09/2026 los dos agentes pasaron a la versión nueva en ~15
minutos. Se puede forzar con la acción remota `FORCE_UPDATE` desde el portal.

> Un barrido completo tarda bastante más en una sede grande: una sede de 2 equipos
> se completó en minutos y una de 57 tardó más de una hora en recorrerlos todos.

### Qué mirar

```sql
SELECT model, count(*) equipos,
       count(cartridge_serial_black)   serie,
       count(cartridge_code_black)     sku,
       count(cartridge_capacity_black) capacidad,
       count(cartridge_printed_black)  impresas
FROM devices WHERE merged_into IS NULL AND model = '<modelo>' GROUP BY 1;
```

Ojo con el falso positivo: filtrar **por modelo**, no por cliente. Contar los
equipos "con serie" de un cliente entero mezcla los que ya andaban.

Para confirmar que el ciclo de consumibles corrió de verdad (y no sólo el de
alertas, que también actualiza `last_seen`):

```sql
SELECT max(r.time) FROM readings r JOIN devices d ON d.id = r.device_id
WHERE d.model = '<modelo>' AND r.toner_black IS NOT NULL;
```

---

## 7. Límites conocidos (no prometer lo que el equipo no da)

| Fuente | Nivel | Contadores | SKU | Serie | Capacidad | Impresas |
|---|---|---|---|---|---|---|
| Printer-MIB (SNMP) | Sí | Sí | No | No | No | No |
| HP DevMgmt / FutureSmart | Sí | Sí | Sí | Sí | A veces | A veces |
| Samsung SyncThru (JSON) | Sí | Sí | Sí | Sí | Sí | **No** |
| Samsung XOA/SWS (HTML) | Sí | Sí | Sí | Sí | Sí | Sí |
| Lexmark CGI | Sí | Sí | **No** | **No** | Sí | No |
| Epson Web Config | Sí | Sí | **No** | **No** | No | No |

El Printer-MIB estándar **no tiene** serie de cartucho, part number ni rendimiento:
para un equipo que sólo se lee por SNMP, esos campos van a quedar en "—" siempre, y
eso no es un bug. Lexmark y Epson tampoco los exponen por EWS.

---

## 8. Checklist

- [ ] Identifiqué el caso (A/B/C/D) con `resolve()` y el `supplies_details` real
- [ ] Capturé el EWS del equipo real y lo guardé como fixture con sufijo de idioma
- [ ] El parser no depende de ninguna etiqueta traducida
- [ ] Distinguí "0 = no informado" de "0 real"
- [ ] Tests contra el fixture + caso de HTML vacío
- [ ] `npx tsc --noEmit` y la suite de captura en verde
- [ ] Sumé el test nuevo al script `test` de `agent/package.json`
- [ ] Bump de versión **antes** de compilar los dos bundles
- [ ] Firma válida, canal horneado correcto, hash servido == hash registrado
- [ ] Verifiqué en producción filtrando por modelo

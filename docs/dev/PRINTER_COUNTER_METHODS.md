# Métodos para obtener contadores de impresoras

> **Para revisar el lunes en ws160** — Evaluar con las impresoras reales de la red antes de implementar en el agente STC Cloud.

Fecha de análisis: 17 mayo 2026  

---

## ⚠️ Problema raíz identificado

**Los clientes desactivan SNMP v1/v2 en sus impresoras por razones de seguridad.**

Esto es una tendencia real en ambientes corporativos — SNMP v1/v2 no tiene cifrado ni autenticación fuerte, por lo que muchas políticas de seguridad lo deshabilitan. El resultado es que el agente STC Cloud no puede leer contadores aunque la impresora esté perfectamente operativa en red.

### ¿Por qué SNMP v1/v2 se deshabilita?
- Transmite en texto plano (sin cifrado)
- Community string `public` es trivialmente adivinable
- Vulnerabilidades históricas conocidas (amplification attacks)
- Política IT de "puerto 161 cerrado" cada vez más común

### ¿Por qué no usar SNMP v3?
SNMP v3 soluciona los problemas de seguridad, pero requiere:
- Credenciales por dispositivo (usuario + contraseña + algoritmo)
- Configuración manual en cada impresora
- El cliente tiene que darnos esas credenciales → fricción comercial
- No es viable para escalar a muchos clientes

**Conclusión: SNMP no puede ser el único método. Necesitamos alternativas que funcionen sin configuración del cliente.**

---

## Estrategia recomendada: Cascada de detección

```
1. Intentar SNMP v2c  →  si responde, usar
2. Si falla → intentar IPP (puerto 631)  →  si responde, usar  
3. Si falla → intentar EWS scraping (puerto 80/443)  →  si responde, usar
4. Si todo falla → marcar dispositivo como "Sin método disponible"
```

El agente debe probar automáticamente en orden y quedarse con el que funcione, guardando el método exitoso en la base de datos para no repetir la detección en cada ciclo.

---

## Método 1 — SNMP v2c (actual)

**Puerto:** 161 UDP

El método actual. Funciona cuando el cliente no lo ha deshabilitado.

```csharp
// Ya implementado en el agente
using var snmp = new SnmpClient();
var result = snmp.Get("1.3.6.1.2.1.43.10.2.1.4.1.1", printerIp); // Total pages OID
```

**Cobertura estimada:** ~60-70% de clientes (el resto lo deshabilita)

---

## Método 2 — IPP (Internet Printing Protocol) ⭐ Mejor alternativa

**Puerto:** 631 TCP  
**Estándar:** RFC 8011

Protocolo moderno de impresión sobre HTTP. **Muy difícil de bloquear** porque usa TCP (no UDP como SNMP) y puerto HTTP-like. La mayoría de los IT no lo bloquean activamente.

### Cómo probarlo manualmente desde ws160

```powershell
# Test rápido desde PowerShell — si devuelve algo, IPP está activo
Test-NetConnection -ComputerName 192.168.X.X -Port 631

# O con curl si lo tenés instalado
curl -v http://192.168.X.X:631/ipp/print
```

### Datos que retorna
- `pages-per-minute` — velocidad de impresión
- `marker-supplies-level` — niveles de tóner/tinta
- `printer-state` — idle / processing / stopped
- `printer-pages-per-second` — contadores de páginas

### Implementación en C# (.NET)

```csharp
// NuGet: Install-Package SharpIpp

using SharpIpp;
using SharpIpp.Models;

var client = new SharpIppClient();
var request = new GetPrinterAttributesRequest
{
    PrinterUri = new Uri("ipp://192.168.1.100/ipp/print"),
    RequestedAttributes = new[]
    {
        "pages-per-minute",
        "marker-supplies-level",
        "printer-state",
        "marker-names"
    }
};
var response = await client.GetPrinterAttributesAsync(request);
var totalPages = response.PrinterAttributes.PagesPerMinute;
```

### ✅ Ventajas
- No requiere configuración en la impresora (habilitado por defecto)
- Funciona sin credenciales en la mayoría de los casos
- HP, Canon, Epson, Xerox, Brother modernos lo soportan
- TCP — no se bloquea con la misma facilidad que UDP/SNMP

### ❌ Desventajas
- Equipos viejos (más de 10 años) pueden no tenerlo
- Algunos modelos no exponen contadores totales, solo estado

### Checklist para el lunes
- [ ] `Test-NetConnection 192.168.X.X -Port 631` por cada impresora
- [ ] Verificar qué modelos responden
- [ ] Probar con SharpIpp en proyecto de consola C# rápido

---

## Método 3 — EWS (Embedded Web Server, Scraping HTTP)

**Puerto:** 80 / 443 TCP

Todas las impresoras de red modernas tienen una interfaz web interna. Se puede hacer scraping de la página de contadores.

### URLs comunes por fabricante (para probar en el navegador)

| Fabricante | URL de la página de contadores |
|---|---|
| HP LaserJet | `http://[IP]/hp/device/InternalPages/Index?id=UsagePage` |
| HP LaserJet (XML) | `http://[IP]/DevMgmt/ProductUsageDyn.xml` |
| Canon | `http://[IP]/English/pages/cnc_status.html` |
| Epson | `http://[IP]/PRESENTATION/HTML/TOP/PRTINFO.HTML` |
| Xerox | `http://[IP]/cgi-bin/cgix/xerox/printerStat.cgi` |
| Konica Minolta | `http://[IP]/wcd/index.html` |
| Ricoh | `http://[IP]/web/entry.cgi?func=STR_PRTCNT` |
| Brother | `http://[IP]/general/status.html` |

> 💡 Si no aparece en la lista, simplemente abrir `http://[IP]` en el navegador y buscar la sección "Uso", "Contadores" o "Usage".

### Implementación en C#

```csharp
// NuGet: Install-Package HtmlAgilityPack
// O para XML: System.Xml nativo de .NET

// Para HP (XML, más confiable que HTML)
var xml = await httpClient.GetStringAsync("http://192.168.1.100/DevMgmt/ProductUsageDyn.xml");
var doc = XDocument.Parse(xml);
// Parsear nodos según estructura del fabricante

// Para otros (HTML scraping)
using HtmlAgilityPack;
var web = new HtmlWeb();
var htmlDoc = web.Load("http://192.168.1.100/hp/device/InternalPages/Index?id=UsagePage");
```

### ✅ Ventajas
- Puerto 80 casi nunca está bloqueado internamente
- No requiere ninguna configuración especial
- XML (cuando disponible) es más estable que SNMP MIBs

### ❌ Desventajas
- Frágil si el firmware actualiza el HTML
- Diferente por cada fabricante/modelo → mantenimiento
- Algunos requieren autenticación web

### Checklist para el lunes
- [ ] Abrir `http://[IP]` de cada impresora en navegador
- [ ] Encontrar la página de "Uso" o "Contadores" de cada modelo
- [ ] Anotar la URL exacta y si pide credenciales
- [ ] Ver si hay versión XML disponible (más fácil de parsear)

---

## Método 4 — PJL (Printer Job Language, puerto 9100)

**Puerto:** 9100 TCP

Protocolo de bajo nivel, originalmente de HP, adoptado ampliamente. Se conecta directo por TCP y se envían comandos en texto.

### Test desde PowerShell (ws160)

```powershell
# Script de prueba rápida
$printerIP = "192.168.X.X"
$tcp = New-Object System.Net.Sockets.TcpClient($printerIP, 9100)
$stream = $tcp.GetStream()
$writer = New-Object System.IO.StreamWriter($stream)
$reader = New-Object System.IO.StreamReader($stream)

# Solicitar contador de páginas
$pjlCommand = [char]27 + "%-12345X@PJL INFO USTATUS`r`n" + [char]27 + "%-12345X"
$writer.Write($pjlCommand)
$writer.Flush()
Start-Sleep -Milliseconds 1000
$buffer = New-Object byte[] 4096
$stream.Read($buffer, 0, $buffer.Length) | Out-Null
[System.Text.Encoding]::ASCII.GetString($buffer)
$tcp.Close()
```

Buscar en la respuesta: `PAGECOUNT=12345`

### Checklist para el lunes
- [ ] `Test-NetConnection 192.168.X.X -Port 9100` por cada IP
- [ ] Si conecta, ejecutar el script PJL y ver si devuelve PAGECOUNT
- [ ] Anotar qué modelos lo soportan

---

## Comparativa actualizada

| Método | Puerto | Bloqueado fácilmente | Config requerida | Cobertura real |
|---|---|---|---|---|
| **SNMP v2c** (actual) | 161 UDP | ⚠️ Sí — lo deshabilitan | Ninguna | ~60-70% |
| **IPP** | 631 TCP | Difícil | Ninguna | ~75-85% modernos |
| **EWS HTTP** | 80/443 TCP | Muy difícil | Ninguna | ~85-90% |
| **PJL** | 9100 TCP | Difícil | Ninguna | ~65-75% |
| **SNMP v3** | 161 UDP | Sí | Credenciales por equipo | 100% si configura |

---

## Decisión de implementación

```
Prioridad 1: SNMP v2c      → rápido, ya implementado
Prioridad 2: IPP           → estándar, sin config, C# fácil (SharpIpp)
Prioridad 3: EWS scraping  → más cobertura, por modelo
Prioridad 4: PJL           → solo si los anteriores fallan
```

Guardar en BD el método exitoso por dispositivo:

```sql
ALTER TABLE devices ADD COLUMN poll_method VARCHAR(20) DEFAULT 'snmp';
-- valores: 'snmp' | 'ipp' | 'ews' | 'pjl' | 'unknown'
```

---

## Próximos pasos

1. **Lunes ws160** — Ejecutar checklists con las impresoras reales
2. **Decisión** — Confirmar qué métodos tienen cobertura suficiente
3. **Implementación** — Agregar IPP como primer fallback en `PrinterDiscoveryService.cs`
4. **Migración BD** — Agregar columna `poll_method` a tabla `devices`
5. **Roadmap** — Evaluar EWS para cubrir equipos sin SNMP ni IPP

# Métodos para obtener contadores de impresoras

> **Para revisar el lunes en ws160** — Evaluar con las impresoras reales de la red antes de implementar en el agente STC Cloud.

Fecha de análisis: 17 mayo 2026  
Contexto: El agente STC Cloud actualmente usa **SNMP** como único método. Se investigan alternativas para cubrir equipos que no lo soporten.

---

## 1. IPP — Internet Printing Protocol ⭐ Candidato principal

Protocolo moderno estándar (RFC 8011). Corre sobre HTTP/HTTPS en el **puerto 631**.

### Cómo probarlo manualmente

```bash
# Verificar si la impresora responde IPP
curl -v http://192.168.X.X:631/ipp/print

# Con ippfind (Linux/Mac)
ippfind
```

### Qué datos retorna
- `marker-supplies-level` → niveles de tóner
- `printer-state` → estado del dispositivo
- `pages-per-minute` → velocidad
- Contadores totales de páginas (mono + color)

### Implementación en C# (.NET)
```csharp
// Usando HttpClient con multipart/form-data
// Librería recomendada: SharpIpp (NuGet)
// Install-Package SharpIpp

var client = new SharpIppClient();
var request = new GetPrinterAttributesRequest
{
    PrinterUri = new Uri("ipp://192.168.1.100/ipp/print"),
    RequestedAttributes = new[] { "pages-per-minute", "marker-supplies-level" }
};
var response = await client.GetPrinterAttributesAsync(request);
```

### ✅ Ventajas
- No requiere SNMP habilitado
- Soportado por HP, Canon, Epson, Xerox, Brother modernos
- Estándar abierto — no depende de MIBs

### ❌ Desventajas  
- No todos los equipos viejos lo soportan
- Algunos requieren autenticación

### Checklist para el lunes
- [ ] Verificar si las impresoras de la red responden en puerto 631
- [ ] Probar con `curl http://[IP]:631` desde ws160
- [ ] Instalar SharpIpp y hacer prueba de `GetPrinterAttributes`

---

## 2. EWS — Embedded Web Server (Scraping HTTP)

Casi todas las impresoras tienen una interfaz web interna accesible por navegador.

### URLs comunes por fabricante

| Fabricante | URL de contadores |
|---|---|
| HP | `http://[IP]/hp/device/InternalPages/Index?id=UsagePage` |
| HP LaserJet | `http://[IP]/DevMgmt/ProductUsageDyn.xml` |
| Canon | `http://[IP]/English/pages/cnc_status.html` |
| Epson | `http://[IP]/PRESENTATION/HTML/TOP/PRTINFO.HTML` |
| Xerox | `http://[IP]/cgi-bin/cgix/xerox/printerStat.cgi` |
| Konica Minolta | `http://[IP]/wcd/index.html` |

### Implementación en C#
```csharp
using HtmlAgilityPack; // NuGet

var web = new HtmlWeb();
var doc = web.Load("http://192.168.1.100/hp/device/InternalPages/Index?id=UsagePage");
// Parsear nodos con XPath según el modelo
var totalPages = doc.DocumentNode.SelectSingleNode("//td[@class='total-pages']")?.InnerText;
```

### Checklist para el lunes
- [ ] Abrir navegador con la IP de cada impresora
- [ ] Encontrar la página de "Uso" o "Contadores"
- [ ] Copiar la URL exacta de esa página por modelo
- [ ] Verificar si requiere usuario/contraseña

---

## 3. PJL — Printer Job Language (TCP puerto 9100)

Protocolo de bajo nivel de HP, adoptado por muchos fabricantes. Comunicación directa TCP.

### Cómo probarlo manualmente (PowerShell)
```powershell
# Desde ws160 en PowerShell
$tcp = New-Object System.Net.Sockets.TcpClient("192.168.X.X", 9100)
$stream = $tcp.GetStream()
$writer = New-Object System.IO.StreamWriter($stream)
$reader = New-Object System.IO.StreamReader($stream)

$writer.WriteLine("`e%-12345X@PJL INFO STATUS`e%-12345X")
$writer.Flush()
Start-Sleep -Milliseconds 500
$response = $reader.ReadToEnd()
Write-Host $response
$tcp.Close()
```

### Checklist para el lunes
- [ ] Probar conexión TCP al puerto 9100 de cada impresora
- [ ] Ver si responde al comando `@PJL INFO STATUS`
- [ ] Buscar campo `PAGECOUNT` en la respuesta

---

## 4. WMI — Windows Management Instrumentation

Solo útil si las impresoras están **compartidas por Windows**. No para impresoras IP directas.

```powershell
# Desde ws160
Get-WmiObject -Query "SELECT * FROM Win32_Printer" | Select-Object Name, PrinterStatus, TotalJobsPrinted
```

> ⚠️ `TotalJobsPrinted` cuenta solo trabajos desde que se configuró en Windows, **no el contador real del dispositivo**. No confiable para billing.

---

## Comparativa final

| Método | Puerto | Facilidad impl. | Cobertura estimada | Contador real |
|---|---|---|---|---|
| **SNMP** (actual) | 161 UDP | ✅ Alta | 95% | ✅ Sí |
| **IPP** | 631 TCP | ✅ Alta | 80% modernos | ✅ Sí |
| **EWS scraping** | 80/443 TCP | ⚠️ Media | 90% | ✅ Sí |
| **PJL** | 9100 TCP | ❌ Baja | 70% HP/Lex | ✅ Sí |
| **WMI** | — | ✅ Alta | Solo shares Win | ❌ No real |

---

## Decisión sugerida

```
Si SNMP responde     → usar SNMP (actual, ya implementado)
Si SNMP no responde  → intentar IPP (SharpIpp, puerto 631)
Si IPP no responde   → intentar EWS scraping (HTTP, URL por modelo)
```

Implementar esta cascada de fallback en `PrinterDiscoveryService.cs` del agente.

---

## Próximos pasos

1. **Lunes** — Probar los 3 métodos en las impresoras reales de la red con el checklist de arriba
2. Decidir qué método agregar como fallback en el agente C#
3. Abrir issue/branch para la implementación

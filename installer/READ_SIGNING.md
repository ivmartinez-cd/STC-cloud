# Configuracion de Firma Digital — Inno Setup + signtool

Este documento explica como conectar tu certificado Code Signing con Inno Setup
para que el instalador `STC-Monitor-Setup-vX.X.exe` quede firmado automaticamente
al compilar.

---

## Requisitos previos

| Herramienta | Origen |
|------------|--------|
| **Windows SDK** (incluye `signtool.exe`) | https://developer.microsoft.com/windows/downloads/windows-sdk/ |
| **Inno Setup 6.x** | https://jrsoftware.org/isinfo.php |
| **Certificado Code Signing** (`.pfx`) | Tu CA corporativa o proveedor (DigiCert, Sectigo, etc.) |

El mismo certificado `.pfx` que usas para firmar el agente (`npm run sign`) se
usa aqui para firmar el instalador.

---

## Paso 1 — Configurar "MsSign" en Inno Setup

1. Abre **Inno Setup Compiler**.
2. Ve al menu **Tools → Configure Sign Tools...**.
3. Haz clic en **Add** y completa el dialogo:

   | Campo | Valor |
   |-------|-------|
   | **Name** | `MsSign` |
   | **Command** | *(ver abajo)* |

4. En el campo **Command**, pega la siguiente linea reemplazando los marcadores:

```
"C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe" sign /fd SHA256 /td SHA256 /tr http://timestamp.digicert.com /f "C:\certs\stc-codesign.pfx" /p TU_CONTRASENA $f
```

> **IMPORTANTE:** El marcador `$f` al final es reemplazado por Inno Setup con
> la ruta del instalador en cada compilacion. No lo elimines.

> **Ajusta** la ruta de `signtool.exe` a la version del SDK que tengas instalada.
> Puedes verificarla con: `where signtool` en una terminal con SDK en el PATH.

5. Haz clic en **OK** y cierra el dialogo.

---

## Paso 2 — Verificar la directiva en STC-Monitor.iss

El archivo `STC-Monitor.iss` ya incluye:

```ini
[Setup]
...
SignTool=MsSign $f
```

Esto le indica a Inno Setup que llame al sign tool llamado `MsSign` pasandole
la ruta del instalador compilado como `$f`.

---

## Paso 3 — Compilar y verificar

```powershell
# Desde la raiz del proyecto:
cd installer
iscc STC-Monitor.iss
```

Al terminar, verifica la firma del instalador generado:

```powershell
signtool verify /pa /v installer\output\Instalador-STC-Monitor-v1.5.6.exe
```

Deberia mostrar `Successfully verified` con los datos de tu certificado.

---

## Flujo completo de firma (agente + instalador)

```text
cd agent
npm run build        # Compila TypeScript → dist/
npm run sign         # Firma dist/stc-cloud-monitor.exe (usa SIGN_CERT_PATH / SIGN_CERT_PASSWORD)

cd ../installer
iscc STC-Monitor.iss # Empaqueta y firma el instalador (usa la config "MsSign" de Inno Setup)
```

---

## Seguridad de secretos

> **NUNCA** subas la contrasena del certificado al repositorio.

Las formas seguras de manejarla son:

| Entorno | Metodo recomendado |
|---------|-------------------|
| **Desarrollo local** | Variable de entorno en tu sesion: `$env:SIGN_CERT_PASSWORD = "..."` |
| **CI/CD (GitHub Actions)** | `secrets.SIGN_CERT_PASSWORD` como secret cifrado |
| **CI/CD (Azure DevOps)** | Variable de grupo de variables marcada como secreto |
| **Equipos corporativos** | Azure Key Vault + identidad gestionada |

El archivo `.gitignore` del proyecto ya excluye:

```
*.pfx
*.p12
agent/certs/
installer/signing.key
```

Si guardas el certificado en otra ruta, agrega esa ruta al `.gitignore` local.

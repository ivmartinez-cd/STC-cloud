#Requires -Version 5.1
<#
.SYNOPSIS
    Firma el binario stc-cloud-monitor.exe con un certificado Code Signing.

.DESCRIPTION
    Busca signtool.exe en el PATH y rutas conocidas del Windows SDK,
    firma el ejecutable del agente y verifica la firma resultante.

    ADVERTENCIA: NUNCA pases la contrasena del certificado como argumento
    en linea de comandos en entornos compartidos. Usa variables de entorno
    o un almacen de secretos (Azure Key Vault, GitHub Secrets, etc.).

.PARAMETER CertPath
    Ruta al archivo .pfx del certificado. Por defecto usa $env:SIGN_CERT_PATH.

.PARAMETER CertPassword
    Contrasena del .pfx como SecureString. Por defecto usa $env:SIGN_CERT_PASSWORD.

.PARAMETER BinaryPath
    Ruta al ejecutable a firmar. Por defecto: agent/dist/stc-cloud-monitor.exe.

.PARAMETER TimestampUrl
    Servidor de timestamping. Por defecto: http://timestamp.digicert.com

.EXAMPLE
    # Con variables de entorno (recomendado para CI/CD):
    $env:SIGN_CERT_PATH     = "C:\certs\stc-codesign.pfx"
    $env:SIGN_CERT_PASSWORD = "MiContrasenaSegura"
    .\scripts\sign_agent.ps1

.EXAMPLE
    # Con parametros expliciticos (solo en maquinas de desarrollo locales):
    .\scripts\sign_agent.ps1 -CertPath "C:\certs\stc-codesign.pfx" -CertPassword (Read-Host -AsSecureString "Password")
#>

[CmdletBinding()]
param(
    [string]$CertPath      = $env:SIGN_CERT_PATH,
    [securestring]$CertPassword,
    [string]$BinaryPath    = $null,
    [string]$TimestampUrl  = "http://timestamp.digicert.com"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ─── Resolver contrasena ─────────────────────────────────────────────────────
if (-not $CertPassword) {
    $rawPassword = $env:SIGN_CERT_PASSWORD
    if (-not $rawPassword) {
        Write-Error "Se requiere la contrasena del certificado. Pasa -CertPassword o define SIGN_CERT_PASSWORD."
    }
    $CertPassword = ConvertTo-SecureString $rawPassword -AsPlainText -Force
}

# ─── Resolver ruta del binario ───────────────────────────────────────────────
if (-not $BinaryPath) {
    # Ruta relativa al directorio del agente (donde se ejecuta npm run sign)
    $scriptDir   = Split-Path $PSScriptRoot -Parent
    $BinaryPath  = Join-Path $scriptDir "dist\stc-cloud-monitor.exe"
}

$BinaryPath = [IO.Path]::GetFullPath($BinaryPath)

if (-not (Test-Path $BinaryPath)) {
    Write-Error "Binario no encontrado: $BinaryPath`n  Ejecuta 'npm run build' antes de firmar."
}

# ─── Localizar signtool.exe ──────────────────────────────────────────────────
function Find-SignTool {
    # 1. Intento: ya esta en el PATH
    $inPath = Get-Command signtool.exe -ErrorAction SilentlyContinue
    if ($inPath) { return $inPath.Source }

    # 2. Buscar en rutas tipicas del Windows SDK (x64 y x86)
    $sdkBases = @(
        "${env:ProgramFiles(x86)}\Windows Kits\10\bin",
        "${env:ProgramFiles}\Windows Kits\10\bin"
    )
    foreach ($base in $sdkBases) {
        if (Test-Path $base) {
            $candidates = Get-ChildItem -Path $base -Filter "signtool.exe" -Recurse -ErrorAction SilentlyContinue |
                          Where-Object { $_.FullName -like "*x64*" } |
                          Sort-Object FullName -Descending
            if ($candidates) { return $candidates[0].FullName }
        }
    }

    return $null
}

$signtool = Find-SignTool
if (-not $signtool) {
    Write-Error @"
signtool.exe no encontrado.
Opciones:
  1. Instala el 'Windows SDK' desde https://developer.microsoft.com/windows/downloads/windows-sdk/
  2. O agrega la carpeta del SDK al PATH del sistema.
"@
}
Write-Host "signtool: $signtool" -ForegroundColor DarkGray

# ─── Extraer contrasena en texto plano (solo para pasarla a signtool) ────────
$bstr    = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($CertPassword)
$plainPw = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

try {
    # ─── Firmar ─────────────────────────────────────────────────────────────
    Write-Host "`nFirmando: $BinaryPath ..." -ForegroundColor Cyan

    $signArgs = @(
        "sign"
        "/fd",  "SHA256"
        "/td",  "SHA256"
        "/tr",  $TimestampUrl
        "/f",   $CertPath
        "/p",   $plainPw
        $BinaryPath
    )

    & $signtool @signArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Error "signtool sign fallo con codigo $LASTEXITCODE"
    }

    Write-Host "Firma aplicada correctamente." -ForegroundColor Green

    # ─── Verificar ──────────────────────────────────────────────────────────
    Write-Host "`nVerificando firma..." -ForegroundColor Cyan

    & $signtool verify /pa /v $BinaryPath
    if ($LASTEXITCODE -ne 0) {
        Write-Error "La verificacion de firma fallo (codigo $LASTEXITCODE). El binario puede estar corrupto."
    }

    Write-Host "Verificacion exitosa. Binario listo para distribucion." -ForegroundColor Green

} finally {
    # Limpiar la variable de texto plano de memoria
    $plainPw = $null
    [GC]::Collect()
}

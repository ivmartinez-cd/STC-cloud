#Requires -Version 5.1
<#
.SYNOPSIS
    Verifica la integridad de un archivo comparando su hash SHA-256 con el valor oficial de STC Cloud.

.DESCRIPTION
    Calcula el hash SHA-256 del archivo especificado localmente (sin enviar datos a servidores externos)
    y lo compara con el hash esperado. Retorna exit code 0 si coincide, 1 si no coincide.

.PARAMETER FilePath
    Ruta al archivo a verificar (ej: STC-Monitor-Setup.exe).

.PARAMETER ExpectedHash
    Hash SHA-256 esperado en formato hexadecimal (64 caracteres). Se obtiene del portal STC Cloud
    o de las notas de lanzamiento de cada version.

.EXAMPLE
    .\verify_hash.ps1 -FilePath "STC-Monitor-Setup.exe" -ExpectedHash "a3f1..."

.EXAMPLE
    .\verify_hash.ps1 -FilePath "C:\Descargas\STC-Monitor-Setup.exe" -ExpectedHash "a3f1..."

.NOTES
    STC Cloud Monitor — Script de Verificacion de Integridad
    Este script no requiere acceso a Internet ni eleva privilegios.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, HelpMessage = "Ruta al archivo a verificar")]
    [string]$FilePath,

    [Parameter(Mandatory = $true, HelpMessage = "Hash SHA-256 oficial de STC Cloud (64 caracteres hex)")]
    [ValidatePattern('^[0-9a-fA-F]{64}$')]
    [string]$ExpectedHash
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Result {
    param([string]$Status, [string]$Message, [string]$Color)
    $border = "=" * 60
    Write-Host ""
    Write-Host $border -ForegroundColor $Color
    Write-Host "  [$Status] $Message" -ForegroundColor $Color
    Write-Host $border -ForegroundColor $Color
    Write-Host ""
}

# --- Resolver ruta absoluta ---
$resolvedPath = Resolve-Path -Path $FilePath -ErrorAction SilentlyContinue
if (-not $resolvedPath) {
    Write-Host "[ERROR] Archivo no encontrado: $FilePath" -ForegroundColor Red
    exit 1
}
$absolutePath = $resolvedPath.Path

# --- Informacion del archivo ---
$fileInfo = Get-Item -Path $absolutePath
$fileSizeMB = [math]::Round($fileInfo.Length / 1MB, 2)

Write-Host ""
Write-Host "STC Cloud Monitor — Verificacion de Integridad SHA-256" -ForegroundColor Cyan
Write-Host ("-" * 60) -ForegroundColor DarkGray
Write-Host "  Archivo  : $($fileInfo.Name)"
Write-Host "  Ruta     : $absolutePath"
Write-Host "  Tamano   : $fileSizeMB MB"
Write-Host "  Fecha    : $($fileInfo.LastWriteTime)"
Write-Host ("-" * 60) -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Calculando hash SHA-256..." -ForegroundColor Yellow

# --- Calcular hash ---
try {
    $hashObj   = Get-FileHash -Path $absolutePath -Algorithm SHA256
    $actualHash = $hashObj.Hash.ToUpper()
    $expected   = $ExpectedHash.ToUpper()
} catch {
    Write-Host "[ERROR] No se pudo calcular el hash: $_" -ForegroundColor Red
    exit 1
}

# --- Mostrar resultado ---
Write-Host ""
Write-Host "  Hash calculado : $actualHash"
Write-Host "  Hash esperado  : $expected"
Write-Host ""

if ($actualHash -eq $expected) {
    Write-Result -Status "OK" -Message "INTEGRIDAD VERIFICADA — El archivo es autentico." -Color Green
    Write-Host "  El hash SHA-256 coincide exactamente con el valor oficial de STC Cloud." -ForegroundColor Green
    Write-Host "  El archivo no ha sido modificado ni corrompido." -ForegroundColor Green
    Write-Host ""
    exit 0
} else {
    Write-Result -Status "FALLO" -Message "ALERTA DE INTEGRIDAD — El hash NO coincide." -Color Red
    Write-Host "  ADVERTENCIA: El archivo puede estar corrompido o haber sido modificado." -ForegroundColor Red
    Write-Host "  NO ejecute este instalador. Descargue el archivo nuevamente desde el" -ForegroundColor Red
    Write-Host "  portal oficial de STC Cloud y verifique el hash antes de proceder." -ForegroundColor Red
    Write-Host ""

    # Mostrar diferencias caracter a caracter para facilitar diagnostico
    Write-Host "  Primeros 8 caracteres calculados : $($actualHash.Substring(0,8))..." -ForegroundColor DarkYellow
    Write-Host "  Primeros 8 caracteres esperados  : $($expected.Substring(0,8))..." -ForegroundColor DarkYellow
    Write-Host ""
    exit 1
}

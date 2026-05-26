#Requires -Version 5.1
# STC Cloud Monitor - Reparador de Servicio
# Ejecutar este script como Administrador para corregir la instalacion del servicio.

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Solicitando privilegios de Administrador..." -ForegroundColor Yellow
    Start-Process powershell.exe "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "   STC Cloud Monitor - Reparador de Servicio" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

$regPath = "HKLM:\SYSTEM\CurrentControlSet\Services\STCCloudMonitor\Parameters"
if (-not (Test-Path $regPath)) {
    Write-Host "[ERROR] El servicio STCCloudMonitor no esta registrado en el sistema." -ForegroundColor Red
    Write-Host "Por favor, ejecute el instalador primero."
    Read-Host "Presione Enter para salir"
    exit
}

$appDir = (Get-ItemProperty $regPath).AppDirectory
if (-not $appDir -or -not (Test-Path $appDir)) {
    $appDir = "C:\Users\imartinez.CDSA\AppData\Local\Programs\STC\Monitor"
}

$nssm = Join-Path $appDir "nssm.exe"
if (-not (Test-Path $nssm)) {
    Write-Host "[ERROR] No se encontro nssm.exe en: $appDir" -ForegroundColor Red
    Read-Host "Presione Enter para salir"
    exit
}

Write-Host "[1/5] Deteniendo servicio existente..." -ForegroundColor Yellow
Stop-Service -Name "STCCloudMonitor" -Force -ErrorAction SilentlyContinue

Write-Host "[2/5] Configurando parametros de NSSM..." -ForegroundColor Yellow
Write-Host "      AppDirectory: $appDir"
Write-Host "      AppParameters: bundle.js"
& $nssm set STCCloudMonitor AppDirectory "$appDir"
& $nssm set STCCloudMonitor AppParameters "bundle.js"
& $nssm set STCCloudMonitor AppEnvironmentExtra "AGENT_DATA_DIR=C:\ProgramData\STCCloudMonitor"
& $nssm set STCCloudMonitor Start SERVICE_AUTO_START
& $nssm set STCCloudMonitor AppThrottle 60000
& $nssm set STCCloudMonitor AppRestartDelay 10000
& $nssm set STCCloudMonitor AppStdout "C:\ProgramData\STCCloudMonitor\nssm-stdout.log"
& $nssm set STCCloudMonitor AppStderr "C:\ProgramData\STCCloudMonitor\nssm-stderr.log"
& $nssm set STCCloudMonitor AppStdoutCreationDisposition 4
& $nssm set STCCloudMonitor AppStderrCreationDisposition 4

Write-Host "[3/5] Iniciando servicio reparado..." -ForegroundColor Yellow
Start-Service -Name "STCCloudMonitor"

Write-Host "[4/5] Esperando a que el servicio genere los logs..." -ForegroundColor Yellow
$logPath = "C:\ProgramData\STCCloudMonitor\agent.log"
$stdoutLog = "C:\ProgramData\STCCloudMonitor\nssm-stdout.log"
$stderrLog = "C:\ProgramData\STCCloudMonitor\nssm-stderr.log"

$found = $false
for ($i = 0; $i -lt 10; $i++) {
    if (Test-Path $logPath) {
        Write-Host "[OK] Archivo de log detectado!" -ForegroundColor Green
        $found = $true
        break
    }
    Start-Sleep -Seconds 1
}

if (-not $found) {
    Write-Host "[WARN] No se creo el log 'agent.log' aun. Verificando logs de NSSM..." -ForegroundColor Yellow
    if (Test-Path $stderrLog) {
        Write-Host "--- Ultimas lineas de NSSM Stderr ---" -ForegroundColor Cyan
        Get-Content $stderrLog -Tail 10 | Write-Host -ForegroundColor Red
    }
    if (Test-Path $stdoutLog) {
        Write-Host "--- Ultimas lineas de NSSM Stdout ---" -ForegroundColor Cyan
        Get-Content $stdoutLog -Tail 10 | Write-Host -ForegroundColor White
    }
} else {
    Write-Host "[5/5] Abriendo log local en Notepad..." -ForegroundColor Yellow
    Start-Process notepad.exe -ArgumentList $logPath
}

Write-Host ""
Write-Host "Proceso de reparacion completado con exito!" -ForegroundColor Green
Read-Host "Presione Enter para salir"

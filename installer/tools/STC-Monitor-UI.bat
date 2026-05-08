@echo off
:: STC Cloud Monitor — Lanzador de Consola de Estado
:: Ejecuta el script PowerShell con ventana oculta para evitar flash de consola

set "SCRIPT=%~dp0STC-Monitor-Status.ps1"

if not exist "%SCRIPT%" (
    echo ERROR: No se encontro STC-Monitor-Status.ps1 en %~dp0
    pause
    exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%SCRIPT%"

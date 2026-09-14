@echo off
title Actualizar Agente STC Cloud Instalado
echo.
echo ================================================================
echo   STC Cloud - Actualizador de Agente Instalado
echo ================================================================
echo.

:: Verificar privilegios de administrador
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Este script requiere ejecutar como Administrador.
    echo HAGA CLIC DERECHO y seleccione "Ejecutar como administrador".
    echo.
    pause
    exit /b 1
)

echo [1/3] Compilando nuevo paquete del agente (bundle.js)...
cd /d "%~dp0..\..\agent"
call node build-sea.js
if %errorlevel% neq 0 (
    echo [ERROR] Fallo la compilacion con esbuild.
    pause
    exit /b 1
)

echo.
echo [2/3] Deteniendo servicio STCCloudMonitor y copiando bundle.js a Program Files...
net stop STCCloudMonitor
copy /Y "%~dp0..\..\agent\dist\bundle.js" "C:\Program Files\STC\Monitor\bundle.js"

echo.
echo [3/3] Reiniciando servicio STCCloudMonitor...
net start STCCloudMonitor

echo.
echo ================================================================
echo   [OK] Agente actualizado e iniciado correctamente.
echo ================================================================
echo.
pause

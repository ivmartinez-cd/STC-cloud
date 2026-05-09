@echo off
setlocal EnableDelayedExpansion
title STC Cloud Monitor - Build Completo

echo.
echo ================================================================
echo   STC Cloud Monitor - Build de Instalador
echo ================================================================
echo.

:: ── Verificar privilegios de administrador ────────────────────────────────────
net session >nul 2>&1
if !errorlevel! neq 0 (
    echo [ERROR] Este script requiere privilegios de administrador.
    echo         Haga clic derecho y seleccione "Ejecutar como administrador".
    pause & exit /b 1
)

:: ── Definir rutas — resolviendo ".." a rutas absolutas con %%~fi ──────────────
set SCRIPT_DIR=%~dp0
for %%i in ("%SCRIPT_DIR%..\agent")      do set AGENT_DIR=%%~fi
for %%i in ("%SCRIPT_DIR%..\monitor-ui") do set UI_DIR=%%~fi
set TOOLS_DIR=%SCRIPT_DIR%tools
set NSSM_EXE=%TOOLS_DIR%\nssm.exe
set OUTPUT_DIR=%SCRIPT_DIR%output
set INNO_DEFAULT="C:\Program Files (x86)\Inno Setup 6\ISCC.exe"

:: ── Paso 0: .NET SDK ──────────────────────────────────────────────────────────
echo [0/6] Verificando .NET SDK...
where dotnet >nul 2>&1
if !errorlevel! neq 0 (
    echo [ERROR] .NET SDK no encontrado.
    echo         Descargarlo desde: https://dotnet.microsoft.com/download
    pause & exit /b 1
)
echo       OK: .NET SDK disponible.

:: ── Paso 1: Inno Setup ────────────────────────────────────────────────────────
echo [1/6] Verificando Inno Setup 6...
if not exist %INNO_DEFAULT% (
    echo [ERROR] Inno Setup 6 no encontrado en %INNO_DEFAULT%
    echo         Descargarlo desde: https://jrsoftware.org/isdl.php
    pause & exit /b 1
)
echo       OK: %INNO_DEFAULT%

:: ── Paso 2: NSSM ──────────────────────────────────────────────────────────────
echo.
echo [2/6] Verificando NSSM (gestor de servicios)...
if not exist "%NSSM_EXE%" (
    echo       NSSM no encontrado. Descargando...
    if not exist "%TOOLS_DIR%" mkdir "%TOOLS_DIR%"

    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "$url = 'https://nssm.cc/release/nssm-2.24.zip';" ^
        "$zip = '%TOOLS_DIR%\nssm.zip';" ^
        "$dest = '%TOOLS_DIR%';" ^
        "Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing;" ^
        "Expand-Archive -Path $zip -DestinationPath $dest -Force;" ^
        "Copy-Item -Path \"$dest\nssm-2.24\win64\nssm.exe\" -Destination \"$dest\nssm.exe\" -Force;" ^
        "Remove-Item -Path $zip -Force;" ^
        "Remove-Item -Path \"$dest\nssm-2.24\" -Recurse -Force;"

    if not exist "%NSSM_EXE%" (
        echo.
        echo [ERROR] No se pudo descargar NSSM automaticamente.
        echo         Descargue NSSM 2.24 desde https://nssm.cc/release/nssm-2.24.zip
        echo         y ponga nssm.exe en: %NSSM_EXE%
        pause & exit /b 1
    )
    echo       OK: NSSM descargado correctamente.
) else (
    echo       OK: %NSSM_EXE%
)

:: ── Paso 3: Compilar TypeScript ───────────────────────────────────────────────
echo.
echo [3/6] Compilando TypeScript del agente...
cd /d "%AGENT_DIR%"
call npm run build
if !errorlevel! neq 0 (
    echo [ERROR] La compilacion TypeScript fallo.
    pause & exit /b 1
)
echo       OK: TypeScript compilado.

:: ── Paso 4: Runtime embebido (SEA: stc-node.exe + bundle.js) ─────────────────
echo.
echo [4/6] Generando stc-node.exe y bundle.js...
cd /d "%AGENT_DIR%"
node build-sea.js
if !errorlevel! neq 0 (
    echo [ERROR] El build-sea.js fallo. Revise el output de arriba.
    pause & exit /b 1
)
if not exist "%AGENT_DIR%\dist\stc-node.exe" (
    echo [ERROR] stc-node.exe no fue creado.
    pause & exit /b 1
)
echo       OK: dist\stc-node.exe generado.

:: ── Paso 5: UI WinForms (C# self-contained) ───────────────────────────────────
echo.
echo [5/6] Publicando STC.Monitor.UI.exe...
cd /d "%UI_DIR%"
dotnet publish STC.Monitor.UI.csproj ^
    -c Release ^
    -r win-x64 ^
    --self-contained true ^
    -p:PublishSingleFile=true ^
    -p:EnableCompressionInSingleFile=true ^
    -o publish ^
    --nologo
if !errorlevel! neq 0 (
    echo [ERROR] La compilacion de la UI fallo.
    pause & exit /b 1
)
if not exist "%UI_DIR%\publish\STC.Monitor.UI.exe" (
    echo [ERROR] STC.Monitor.UI.exe no fue creado.
    pause & exit /b 1
)
echo       OK: publish\STC.Monitor.UI.exe generado.

:: ── Paso 6: Compilar instalador con Inno Setup ───────────────────────────────
echo.
echo [6/6] Compilando instalador con Inno Setup...
cd /d "%SCRIPT_DIR%"
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"
%INNO_DEFAULT% "STC-Monitor.iss"
if !errorlevel! neq 0 (
    echo [ERROR] Inno Setup fallo al compilar el instalador.
    pause & exit /b 1
)

:: ── Resultado ─────────────────────────────────────────────────────────────────
echo.
echo ================================================================
echo   BUILD EXITOSO
echo ================================================================
echo.
echo   Instalador generado en:
for %%f in ("%OUTPUT_DIR%\*.exe") do echo     %%f
echo.
echo   Para distribucion silenciosa (GPO / script):
echo     STC-Monitor-Setup-v1.0.0.exe /VERYSILENT /SUPPRESSMSGBOXES
echo.
echo   Contenido del instalador:
echo     stc-node.exe       - runtime Node.js del agente
echo     bundle.js          - codigo del agente
echo     nssm.exe           - gestor de servicios NSSM 2.24
echo     STC.Monitor.UI.exe - consola de monitoreo
echo.
pause

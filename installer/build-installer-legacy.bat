@echo off

:: Variante LEGACY de build-installer.bat, para Windows Server 2008 R2 SP1 /
:: Windows 7 SP1 en adelante (Node 20.3.0+ y .NET 9 no arrancan ahi, ver
:: STC-Monitor-Legacy.iss). Genera Instalador-STC-Monitor-Legacy-vX.Y.Z.exe
:: en installer\output\ -- sin pasos de GitHub Release / API dinamica (esta
:: variante no participa del auto-update normal).

if "%~1"=="__run__" goto :start
cmd /k ""%~f0" __run__"
exit /b

:start
setlocal EnableDelayedExpansion
title STC Cloud Monitor - Build LEGACY (Server 2008 R2 / Windows 7)

echo.
echo ================================================================
echo   STC Cloud Monitor - Build LEGACY (Server 2008 R2 / Win7 SP1+)
echo ================================================================
echo.

net session >nul 2>&1
if !errorlevel! neq 0 (
    echo [ERROR] Este script requiere privilegios de administrador.
    echo         Haga clic derecho y seleccione "Ejecutar como administrador".
    pause & exit /b 1
)

:: ── Rutas ──────────────────────────────────────────────────────────────────
set SCRIPT_DIR=%~dp0
for %%i in ("%SCRIPT_DIR%..\agent")      do set AGENT_DIR=%%~fi
for %%i in ("%SCRIPT_DIR%..\monitor-ui") do set UI_DIR=%%~fi
for %%i in ("%SCRIPT_DIR%..")            do set REPO_DIR=%%~fi
set TOOLS_DIR=%SCRIPT_DIR%tools
set OUTPUT_DIR=%SCRIPT_DIR%output
set INNO_DEFAULT="C:\Program Files (x86)\Inno Setup 6\ISCC.exe"

:: ── Ruta al Node.js 20.2.0 (ultimo compatible con Server 2008 R2, ver
::    nodejs/node#51465) -- ajustar NODE20_DIR si esta en otro lado. No viene
::    en el repo: bajarlo de https://nodejs.org/dist/v20.2.0/node-v20.2.0-win-x64.zip
if "%NODE20_DIR%"=="" set NODE20_DIR=C:\node-v20.2.0-win-x64\node-v20.2.0-win-x64
set NODE20_EXE=%NODE20_DIR%\node.exe
set NODE20_NPM=%NODE20_DIR%\npm.cmd

:: ── Version (misma que STC-Monitor-Legacy.iss, no se pide interactivo aca --
::    usar build-installer.bat para bumpear version, esta variante siempre
::    sigue a la ultima que haya dejado el .iss) ────────────────────────────
for /f "usebackq tokens=3" %%v in (`findstr /C:"#define MyAppVersion" "%SCRIPT_DIR%STC-Monitor-Legacy.iss"`) do (
    set RAW_VER=%%v
    set APP_VERSION=!RAW_VER:"=!
)
echo   Version: !APP_VERSION!
echo   Node.js legacy: %NODE20_EXE%
echo.

:: ── Paso 0: Node 20.2.0 presente ─────────────────────────────────────────────
echo [0/7] Verificando Node.js 20.2.0 legacy...
if not exist "%NODE20_EXE%" (
    echo [ERROR] No se encontro Node.js 20.2.0 en %NODE20_DIR%
    echo         Descargarlo de https://nodejs.org/dist/v20.2.0/node-v20.2.0-win-x64.zip
    echo         y descomprimirlo ahi, o setear NODE20_DIR antes de correr este script.
    pause & exit /b 1
)
echo       OK: %NODE20_EXE%

:: ── Paso 1: .NET SDK + Inno Setup + NSSM (mismo chequeo que el build normal) ─
echo.
echo [1/7] Verificando .NET SDK, Inno Setup y NSSM...
where dotnet >nul 2>&1
if !errorlevel! neq 0 (
    echo [ERROR] .NET SDK no encontrado. https://dotnet.microsoft.com/download
    pause & exit /b 1
)
if not exist %INNO_DEFAULT% (
    echo [ERROR] Inno Setup 6 no encontrado en %INNO_DEFAULT%
    echo         https://jrsoftware.org/isdl.php
    pause & exit /b 1
)
if not exist "%TOOLS_DIR%\nssm.exe" (
    echo [ERROR] nssm.exe no encontrado en %TOOLS_DIR%
    echo         Correr build-installer.bat una vez primero ^(lo descarga solo^),
    echo         o poner nssm.exe ahi a mano.
    pause & exit /b 1
)
echo       OK.

:: ── Paso 2: Recompilar better-sqlite3 contra el ABI de Node 20 ──────────────
:: OJO: esto pisa el binario compilado que usa el build NORMAL (Node 24). Si
:: vas a generar el instalador normal despues de este, correr build-installer.bat
:: de nuevo antes -- ahi tambien hace su propio "npm install" que lo re-arma.
echo.
echo [2/7] Recompilando better-sqlite3 contra Node 20.2.0 ^(ABI 115^)...
cd /d "%REPO_DIR%"
if exist "node_modules\better-sqlite3\build" rd /s /q "node_modules\better-sqlite3\build"
set "PATH=%NODE20_DIR%;%PATH%"
call "%NODE20_NPM%" rebuild better-sqlite3
if !errorlevel! neq 0 (
    echo [ERROR] Fallo el rebuild de better-sqlite3 contra Node 20.
    pause & exit /b 1
)
echo       OK: better-sqlite3 recompilado para Node 20.

:: ── Paso 3: Compilar TypeScript del agente ^(gate de tipos^) ─────────────────
echo.
echo [3/7] Compilando TypeScript del agente...
cd /d "%AGENT_DIR%"
call npm run build
if !errorlevel! neq 0 (
    echo [ERROR] La compilacion TypeScript fallo.
    pause & exit /b 1
)
echo       OK: TypeScript compilado.

:: ── Paso 4: Runtime embebido LEGACY ^(stc-node.exe = Node 20.2.0^) ───────────
echo.
echo [4/7] Generando dist-legacy\stc-node.exe y bundle.js ^(Node 20.2.0^)...
cd /d "%AGENT_DIR%"
:: --channel legacy NO es opcional: sin el, build-sea.js cae al default
:: 'stable' y el bundle queda marcado como stable aunque sea el build de
:: Node 20. Un agente asi le pide al server el release del canal stable
:: (compilado --target node24), se lo instala, y NSSM lo reinicia con
:: Node 20.2.0 corriendo un bundle de Node 24: el agente no vuelve a
:: levantar. Falto desde que se creo el canal (10/09/2026) y se detecto el
:: 13/09 porque el agente de ISSN (Windows 7, Node 20.2.0) figuraba como
:: "stable" en el portal.
"%NODE20_EXE%" build-sea.js --node-exe "%NODE20_EXE%" --target node20 --out-dir dist-legacy --channel legacy
if !errorlevel! neq 0 (
    echo [ERROR] El build-sea.js fallo. Revise el output de arriba.
    pause & exit /b 1
)
if not exist "%AGENT_DIR%\dist-legacy\stc-node.exe" (
    echo [ERROR] stc-node.exe no fue creado.
    pause & exit /b 1
)
echo       OK: dist-legacy\stc-node.exe y bundle.js generados.

node "%SCRIPT_DIR%sign-bundle.js" "%AGENT_DIR%\dist-legacy\bundle.js"
if !errorlevel! neq 0 (
    echo [ERROR] Fallo al firmar bundle.js. Ejecute primero: node installer\gen-keys.js
    pause & exit /b 1
)
echo       OK: bundle.js.sig generado.

:: ── Paso 5: UI WinForms ^(.NET Framework 4.8, sin self-contained^) ───────────
echo.
echo [5/7] Publicando STC.Monitor.UI.exe ^(.NET Framework 4.8^)...
cd /d "%UI_DIR%"
dotnet publish STC.Monitor.UI.Legacy.csproj -c Release -o publish.legacy --nologo
if !errorlevel! neq 0 (
    echo [ERROR] La compilacion de la UI legacy fallo.
    pause & exit /b 1
)
if not exist "%UI_DIR%\publish.legacy\STC.Monitor.UI.exe" (
    echo [ERROR] STC.Monitor.UI.exe no fue creado.
    pause & exit /b 1
)
echo       OK: publish.legacy\STC.Monitor.UI.exe generado.

:: ── Paso 6: Compilar instalador con Inno Setup ───────────────────────────────
echo.
echo [6/7] Compilando instalador con Inno Setup...
cd /d "%SCRIPT_DIR%"
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"
%INNO_DEFAULT% "STC-Monitor-Legacy.iss"
if !errorlevel! neq 0 (
    echo [ERROR] Inno Setup fallo al compilar el instalador.
    pause & exit /b 1
)
echo       OK: Instalador generado.

:: ── Paso 7: Resultado ─────────────────────────────────────────────────────────
echo.
echo ================================================================
echo   BUILD LEGACY COMPLETO v!APP_VERSION!
echo ================================================================
echo.
echo   Instalador generado en:
for %%f in ("%OUTPUT_DIR%\Instalador-STC-Monitor-Legacy-*.exe") do echo     %%f
echo.
echo   Para distribucion silenciosa con activacion automatica:
echo     Instalador-STC-Monitor-Legacy-v!APP_VERSION!.exe /VERYSILENT /SUPPRESSMSGBOXES /KEY=xxxx /SERVER=https://tu-dominio.com
echo.
echo   Requisito en el equipo destino: .NET Framework 4.8 instalado
echo   ^(el instalador avisa si no lo detecta, pero no lo instala solo^).
echo.
echo   IMPORTANTE: better-sqlite3 quedo compilado contra Node 20 ^(ABI 115^).
echo   Si vas a correr build-installer.bat ^(el normal, Node 24^) despues,
echo   ese script ya hace su propio "npm install" y lo recompila solo -- no
echo   hace falta que hagas nada, pero NO mezcles instaladores de una misma
echo   corrida sin pasar por ese paso.
echo.
echo   Para publicar dist-legacy\bundle.js como update OTA del canal 'legacy'
echo   ^(agentes legacy YA instalados lo descargan solo, sin reinstalar^),
echo   correr desde WSL/Git Bash ^(necesita STC_PORTAL_USER/PASSWORD^):
echo     installer\publish-release.sh agent\dist-legacy\bundle.js !APP_VERSION! legacy
echo.
pause

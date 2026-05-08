@echo off
setlocal EnableDelayedExpansion
title STC Cloud Monitor — Build de UI

echo.
echo ================================================================
echo   STC Cloud Monitor UI — Build (C# WinForms + .NET 10)
echo ================================================================
echo.

:: ── Verificar .NET SDK ────────────────────────────────────────────────────────
where dotnet >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] .NET SDK no encontrado. Descargarlo desde:
    echo         https://dotnet.microsoft.com/download
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('dotnet --version') do set DOTNET_VER=%%v
echo [OK] .NET SDK v%DOTNET_VER%

:: ── Compilar y publicar como single-file self-contained ──────────────────────
echo.
echo [1/2] Publicando STC.Monitor.UI.exe (self-contained, single file)...
cd /d "%~dp0"
dotnet publish STC.Monitor.UI.csproj ^
    -c Release ^
    -r win-x64 ^
    --self-contained true ^
    -p:PublishSingleFile=true ^
    -p:EnableCompressionInSingleFile=true ^
    -o publish ^
    --nologo
if %errorlevel% neq 0 (
    echo [ERROR] La compilacion fallo. Ver mensajes anteriores.
    pause & exit /b 1
)

:: ── Verificar output ──────────────────────────────────────────────────────────
echo.
echo [2/2] Verificando output...
if not exist "%~dp0publish\STC.Monitor.UI.exe" (
    echo [ERROR] STC.Monitor.UI.exe no fue generado.
    pause & exit /b 1
)
for %%f in ("%~dp0publish\STC.Monitor.UI.exe") do (
    set /a SIZE_MB=%%~zf / 1048576
    echo [OK] STC.Monitor.UI.exe generado (!SIZE_MB! MB)
)

echo.
echo ================================================================
echo   BUILD EXITOSO
echo ================================================================
echo.
echo   Archivo:  %~dp0publish\STC.Monitor.UI.exe
echo   Runtime:  self-contained (sin dependencias en el cliente)
echo.
pause

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

:: ── Definir rutas ─────────────────────────────────────────────────────────────
set SCRIPT_DIR=%~dp0
for %%i in ("%SCRIPT_DIR%..\agent")      do set AGENT_DIR=%%~fi
for %%i in ("%SCRIPT_DIR%..\monitor-ui") do set UI_DIR=%%~fi
set TOOLS_DIR=%SCRIPT_DIR%tools
set NSSM_EXE=%TOOLS_DIR%\nssm.exe
set OUTPUT_DIR=%SCRIPT_DIR%output
set INNO_DEFAULT="C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
set GITHUB_REPO=ivmartinez-cd/STC-cloud

:: ── Extraer version del .iss ──────────────────────────────────────────────────
for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command "(Select-String '%SCRIPT_DIR%STC-Monitor.iss' -Pattern '([0-9]+\.[0-9]+\.[0-9]+)').Matches[0].Groups[1].Value"`) do set APP_VERSION=%%v
if "!APP_VERSION!"=="" (
    echo [ERROR] No se pudo extraer la version de STC-Monitor.iss
    pause & exit /b 1
)
echo   Version detectada: !APP_VERSION!
echo.

:: ── Paso 0: .NET SDK ──────────────────────────────────────────────────────────
echo [0/8] Verificando .NET SDK...
where dotnet >nul 2>&1
if !errorlevel! neq 0 (
    echo [ERROR] .NET SDK no encontrado.
    echo         Descargarlo desde: https://dotnet.microsoft.com/download
    pause & exit /b 1
)
echo       OK: .NET SDK disponible.

:: ── Paso 1: Inno Setup ────────────────────────────────────────────────────────
echo [1/8] Verificando Inno Setup 6...
if not exist %INNO_DEFAULT% (
    echo [ERROR] Inno Setup 6 no encontrado en %INNO_DEFAULT%
    echo         Descargarlo desde: https://jrsoftware.org/isdl.php
    pause & exit /b 1
)
echo       OK: %INNO_DEFAULT%

:: ── Paso 2: NSSM ──────────────────────────────────────────────────────────────
echo.
echo [2/8] Verificando NSSM (gestor de servicios)...
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
echo [3/8] Compilando TypeScript del agente...
cd /d "%AGENT_DIR%"
call npm run build
if !errorlevel! neq 0 (
    echo [ERROR] La compilacion TypeScript fallo.
    pause & exit /b 1
)
echo       OK: TypeScript compilado.

:: ── Paso 4: Runtime embebido (SEA: stc-node.exe + bundle.js) ─────────────────
echo.
echo [4/8] Generando stc-node.exe y bundle.js...
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
echo       OK: dist\stc-node.exe y dist\bundle.js generados.

:: ── Paso 5: UI WinForms (C# self-contained) ───────────────────────────────────
echo.
echo [5/8] Publicando STC.Monitor.UI.exe...
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
echo [6/8] Compilando instalador con Inno Setup...
cd /d "%SCRIPT_DIR%"
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"
%INNO_DEFAULT% "STC-Monitor.iss"
if !errorlevel! neq 0 (
    echo [ERROR] Inno Setup fallo al compilar el instalador.
    pause & exit /b 1
)
echo       OK: Instalador generado.

:: ── Paso 7: GitHub Release ────────────────────────────────────────────────────
echo.
echo [7/8] Publicando GitHub Release v!APP_VERSION!...
if "!GITHUB_TOKEN!"=="" (
    echo [AVISO] Variable GITHUB_TOKEN no configurada. Saltando.
    echo         Para configurar una vez:  setx GITHUB_TOKEN "ghp_xxxx" /M
    echo         Luego abrir nueva ventana de cmd y volver a ejecutar el build.
    goto :step8
)

set PS_GH=%TEMP%\stc_gh_%RANDOM%.ps1
echo param^($Version, $Repo, $BundlePath^) > "!PS_GH!"
echo $token = $env:GITHUB_TOKEN >> "!PS_GH!"
echo $hdr = @{ Authorization = "token $token"; Accept = 'application/vnd.github+json'; 'X-GitHub-Api-Version' = '2022-11-28' } >> "!PS_GH!"
echo. >> "!PS_GH!"
echo try { >> "!PS_GH!"
echo     $ex = Invoke-RestMethod "https://api.github.com/repos/$Repo/releases/tags/v$Version" -Headers $hdr -ErrorAction Stop >> "!PS_GH!"
echo     $exId = $ex.id >> "!PS_GH!"
echo     Write-Host "  Eliminando release anterior id=$exId..." >> "!PS_GH!"
echo     Invoke-RestMethod "https://api.github.com/repos/$Repo/releases/$exId" -Method Delete -Headers $hdr ^| Out-Null >> "!PS_GH!"
echo     Invoke-RestMethod "https://api.github.com/repos/$Repo/git/refs/tags/v$Version" -Method Delete -Headers $hdr -ErrorAction SilentlyContinue >> "!PS_GH!"
echo     Start-Sleep -Seconds 3 >> "!PS_GH!"
echo } catch {} >> "!PS_GH!"
echo. >> "!PS_GH!"
echo $body = @{ tag_name = "v$Version"; target_commitish = 'main'; name = "v$Version"; body = "Release generado por build-installer.bat"; draft = $false; prerelease = $false } ^| ConvertTo-Json >> "!PS_GH!"
echo $rel = Invoke-RestMethod "https://api.github.com/repos/$Repo/releases" -Method Post -Headers $hdr -Body $body -ContentType 'application/json' >> "!PS_GH!"
echo $relId = $rel.id >> "!PS_GH!"
echo Write-Host "  Release creado id=$relId" >> "!PS_GH!"
echo. >> "!PS_GH!"
echo $rawUpload = $rel.upload_url >> "!PS_GH!"
echo $uploadUrl = ^($rawUpload -replace '\{.*\}', ''^) + '?name=bundle.js' >> "!PS_GH!"
echo $aHdr = @{ Authorization = "token $token"; 'Content-Type' = 'application/octet-stream' } >> "!PS_GH!"
echo $bytes = [IO.File]::ReadAllBytes^($BundlePath^) >> "!PS_GH!"
echo Invoke-RestMethod $uploadUrl -Method Post -Headers $aHdr -Body $bytes ^| Out-Null >> "!PS_GH!"
echo $kb = [math]::Round^($bytes.Length / 1KB^) >> "!PS_GH!"
echo Write-Host "  bundle.js subido ($kb KB)" >> "!PS_GH!"

powershell -NoProfile -ExecutionPolicy Bypass -File "!PS_GH!" -Version "!APP_VERSION!" -Repo "!GITHUB_REPO!" -BundlePath "!AGENT_DIR!\dist\bundle.js"
set GH_EXIT=!errorlevel!
del "!PS_GH!" 2>nul
if !GH_EXIT! neq 0 (
    echo [ERROR] Fallo al publicar GitHub Release. Verificar GITHUB_TOKEN y conexion.
    pause & exit /b 1
)
echo       OK: GitHub Release v!APP_VERSION! publicado con bundle.js.

:step8
:: ── Paso 8: Actualizar variables de entorno en Render ────────────────────────
echo.
echo [8/8] Actualizando Render (AGENT_VERSION + AGENT_DOWNLOAD_URL)...
if "!RENDER_API_KEY!"=="" (
    echo [AVISO] Variable RENDER_API_KEY no configurada. Saltando.
    echo         Para configurar:
    echo           setx RENDER_API_KEY  "rnd_xxxxxxxxxxxx" /M
    echo           setx RENDER_SERVICE_ID "srv-xxxxxxxxxxxx" /M
    echo         El service ID se encuentra en la URL del servicio en el dashboard de Render.
    goto :done
)
if "!RENDER_SERVICE_ID!"=="" (
    echo [AVISO] Variable RENDER_SERVICE_ID no configurada. Saltando.
    echo         Ejemplo: setx RENDER_SERVICE_ID "srv-xxxxxxxxxxxx" /M
    goto :done
)

set DLURL=https://github.com/!GITHUB_REPO!/releases/download/v!APP_VERSION!/bundle.js
set PS_RND=%TEMP%\stc_rnd_%RANDOM%.ps1
echo param^($ServiceId, $Version, $DownloadUrl^) > "!PS_RND!"
echo $apiKey = $env:RENDER_API_KEY >> "!PS_RND!"
echo $hdr = @{ Authorization = "Bearer $apiKey"; Accept = 'application/json'; 'Content-Type' = 'application/json' } >> "!PS_RND!"
echo. >> "!PS_RND!"
echo $current = Invoke-RestMethod "https://api.render.com/v1/services/$ServiceId/env-vars" -Headers $hdr -ErrorAction Stop >> "!PS_RND!"
echo $filtered = @^($current ^| ForEach-Object { @{ key = $_.envVar.key; value = $_.envVar.value } } ^| Where-Object { $_.key -ne '' -and $_.key -notin @^('AGENT_VERSION', 'AGENT_DOWNLOAD_URL'^) }^) >> "!PS_RND!"
echo $filtered += @{ key = 'AGENT_VERSION'; value = $Version } >> "!PS_RND!"
echo $filtered += @{ key = 'AGENT_DOWNLOAD_URL'; value = $DownloadUrl } >> "!PS_RND!"
echo $body = ConvertTo-Json @^($filtered^) -Depth 3 >> "!PS_RND!"
echo Invoke-RestMethod "https://api.render.com/v1/services/$ServiceId/env-vars" -Method Put -Headers $hdr -Body $body -ContentType 'application/json' -ErrorAction Stop ^| Out-Null >> "!PS_RND!"
echo Write-Host "  AGENT_VERSION=$Version" >> "!PS_RND!"
echo Write-Host "  AGENT_DOWNLOAD_URL=$DownloadUrl" >> "!PS_RND!"
echo Write-Host "  Render iniciara redeploy automaticamente." >> "!PS_RND!"

powershell -NoProfile -ExecutionPolicy Bypass -File "!PS_RND!" -ServiceId "!RENDER_SERVICE_ID!" -Version "!APP_VERSION!" -DownloadUrl "!DLURL!"
set RND_EXIT=!errorlevel!
del "!PS_RND!" 2>nul
if !RND_EXIT! neq 0 (
    echo [ERROR] Fallo al actualizar Render.
    echo         Actualizarlo manualmente en: https://dashboard.render.com
    echo           AGENT_VERSION     = !APP_VERSION!
    echo           AGENT_DOWNLOAD_URL = !DLURL!
    pause & exit /b 1
)
echo       OK: Render actualizado. Los agentes instalados se auto-actualizaran en el proximo ciclo.

:done
:: ── Resultado ─────────────────────────────────────────────────────────────────
echo.
echo ================================================================
echo   BUILD COMPLETO v!APP_VERSION!
echo ================================================================
echo.
echo   Instalador generado en:
for %%f in ("%OUTPUT_DIR%\*.exe") do echo     %%f
echo.
echo   Para distribucion silenciosa ^(GPO / script^):
echo     Instalador-STC-Monitor-v!APP_VERSION!.exe /VERYSILENT /SUPPRESSMSGBOXES
echo.
echo   Contenido del instalador:
echo     stc-node.exe       - runtime Node.js del agente
echo     bundle.js          - codigo del agente v!APP_VERSION!
echo     nssm.exe           - gestor de servicios NSSM 2.24
echo     STC.Monitor.UI.exe - consola de monitoreo
echo.
pause

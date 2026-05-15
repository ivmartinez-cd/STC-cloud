@echo off

:: Relanzar con cmd /k para que la ventana quede abierta al terminar o si hay error
if "%~1"=="__run__" goto :start
cmd /k ""%~f0" __run__"
exit /b

:start
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

:: ── Extraer version actual del .iss (buscando específicamente la línea #define MyAppVersion) ──
for /f "usebackq tokens=3" %%v in (`findstr /C:"#define MyAppVersion" "%SCRIPT_DIR%STC-Monitor.iss"`) do (
    set RAW_VER=%%v
    set APP_VERSION=!RAW_VER:"=!
)
if "!APP_VERSION!"=="" (
    echo [ERROR] No se pudo extraer la version de STC-Monitor.iss
    pause & exit /b 1
)
set OLD_VERSION=!APP_VERSION!

:: ── Preguntar version ─────────────────────────────────────────────────────────
echo   Version actual: !APP_VERSION!
set /p NEW_VERSION=  Nueva version ^(Enter para mantener !APP_VERSION!^):
if "!NEW_VERSION!"=="" set NEW_VERSION=!APP_VERSION!

:: Validar formato x.y.z
powershell -NoProfile -Command "if ('!NEW_VERSION!' -match '^[0-9]+\.[0-9]+\.[0-9]+$') { exit 0 } else { exit 1 }" >nul 2>&1
if !errorlevel! neq 0 (
    echo [ERROR] Formato invalido. Use x.y.z ^(ej: 1.5.0^)
    pause & exit /b 1
)
set APP_VERSION=!NEW_VERSION!

:: Actualizar ambos archivos via PS1 temporal (evita problemas de escaping con comillas)
set PS_VER=%TEMP%\stc_ver_%RANDOM%.ps1
echo param^($OldV, $NewV, $IssPath, $MainPath^) > "!PS_VER!"
echo $dq = [char]34 >> "!PS_VER!"
echo $sq = [char]39 >> "!PS_VER!"
echo $issOld = $dq + $OldV + $dq >> "!PS_VER!"
echo $issNew = $dq + $NewV + $dq >> "!PS_VER!"
echo $mainOld = $sq + $OldV + $sq >> "!PS_VER!"
echo $mainNew = $sq + $NewV + $sq >> "!PS_VER!"
echo (Get-Content $IssPath) -replace [regex]::Escape^($issOld^), $issNew ^| Set-Content $IssPath -Encoding UTF8 >> "!PS_VER!"
echo (Get-Content $MainPath) -replace [regex]::Escape^($mainOld^), $mainNew ^| Set-Content $MainPath -Encoding UTF8 >> "!PS_VER!"
powershell -NoProfile -ExecutionPolicy Bypass -File "!PS_VER!" -OldV "!OLD_VERSION!" -NewV "!APP_VERSION!" -IssPath "!SCRIPT_DIR!STC-Monitor.iss" -MainPath "!AGENT_DIR!\src\core\main.ts"
set VER_EXIT=!errorlevel!
del "!PS_VER!" 2>nul
if !VER_EXIT! neq 0 (
    echo [ERROR] Fallo al actualizar la version en los archivos.
    pause & exit /b 1
)

echo   Version a buildear: !APP_VERSION!
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

:: -- Calcular Hash SHA256 del bundle --
for /f "usebackq" %%h in (`powershell -NoProfile -Command "(Get-FileHash '%AGENT_DIR%\dist\bundle.js' -Algorithm SHA256).Hash.ToLower()"`) do set BUNDLE_HASH=%%h
echo       Hash: !BUNDLE_HASH!

:: -- Firmar bundle.js con Ed25519 --
node "%SCRIPT_DIR%sign-bundle.js" "%AGENT_DIR%\dist\bundle.js"
if !errorlevel! neq 0 (
    echo [ERROR] Fallo al firmar bundle.js. Ejecute primero: node installer\gen-keys.js
    pause & exit /b 1
)
echo       OK: bundle.js.sig generado.

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

:: ── Paso 5.5: Crear paquete ZIP para actualizacion de fondo ──────────────────
echo.
echo [5.5/8] Empaquetando actualizacion completa (ZIP)...
set UPDATE_TEMP=%SCRIPT_DIR%\update_temp
if exist "!UPDATE_TEMP!" rd /s /q "!UPDATE_TEMP!"
mkdir "!UPDATE_TEMP!"
mkdir "!UPDATE_TEMP!\node_modules\better-sqlite3\build\Release"

copy /y "%AGENT_DIR%\dist\stc-node.exe" "!UPDATE_TEMP!\" > nul
copy /y "%AGENT_DIR%\dist\bundle.js" "!UPDATE_TEMP!\" > nul
copy /y "%UI_DIR%\publish\STC.Monitor.UI.exe" "!UPDATE_TEMP!\" > nul
copy /y "%AGENT_DIR%\node_modules\better-sqlite3\build\Release\better_sqlite3.node" "!UPDATE_TEMP!\node_modules\better-sqlite3\build\Release\" > nul

:: Esperar a que Defender/AV libere los archivos recien copiados
ping -n 4 127.0.0.1 > nul

set ZIP_FILE=%SCRIPT_DIR%\stc-update.zip
if exist "!ZIP_FILE!" del /f /q "!ZIP_FILE!"
powershell -NoProfile -Command "Compress-Archive -Path '!UPDATE_TEMP!\*' -DestinationPath '!ZIP_FILE!' -Force"
if !errorlevel! neq 0 (
    echo [ERROR] Fallo al crear el ZIP. Cierre la UI si esta abierta e intente de nuevo.
    rd /s /q "!UPDATE_TEMP!" 2>nul
    pause & exit /b 1
)

:: Calcular hash del ZIP para integridad
for /f "usebackq" %%h in (`powershell -NoProfile -Command "(Get-FileHash '!ZIP_FILE!' -Algorithm SHA256).Hash.ToLower()"`) do set UPDATE_HASH=%%h
if "!UPDATE_HASH!"=="" (
    echo [ERROR] No se pudo calcular el hash del ZIP.
    pause & exit /b 1
)
echo       OK: stc-update.zip generado.
echo       Hash Paquete: !UPDATE_HASH!

:: -- Firmar stc-update.zip con Ed25519 --
node "%SCRIPT_DIR%sign-bundle.js" "!ZIP_FILE!"
if !errorlevel! neq 0 (
    echo [ERROR] Fallo al firmar stc-update.zip.
    pause & exit /b 1
)
echo       OK: stc-update.zip.sig generado.
rd /s /q "!UPDATE_TEMP!"

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
echo param^($Version, $Repo, $BundlePath, $ZipPath^) > "!PS_GH!"
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
echo function Upload-Asset { >> "!PS_GH!"
echo     param($Url, $FilePath, $Name) >> "!PS_GH!"
echo     $u = $Url -replace '\{.*\}', '' >> "!PS_GH!"
echo     $u += "?name=$Name" >> "!PS_GH!"
echo     $aHdr = @{ Authorization = "token $env:GITHUB_TOKEN"; 'Content-Type' = 'application/octet-stream' } >> "!PS_GH!"
echo     $bytes = [IO.File]::ReadAllBytes($FilePath) >> "!PS_GH!"
echo     Invoke-RestMethod $u -Method Post -Headers $aHdr -Body $bytes ^| Out-Null >> "!PS_GH!"
echo     $kb = [math]::Round($bytes.Length / 1KB) >> "!PS_GH!"
echo     Write-Host "  $Name subido ($kb KB)" >> "!PS_GH!"
echo } >> "!PS_GH!"
echo. >> "!PS_GH!"
echo $uBase = $rel.upload_url >> "!PS_GH!"
echo Upload-Asset $uBase "$BundlePath" "bundle.js" >> "!PS_GH!"
echo Upload-Asset $uBase "$ZipPath" "stc-update.zip" >> "!PS_GH!"
echo Upload-Asset $uBase "$BundlePath.sig" "bundle.js.sig" >> "!PS_GH!"
echo Upload-Asset $uBase "$ZipPath.sig" "stc-update.zip.sig" >> "!PS_GH!"

powershell -NoProfile -ExecutionPolicy Bypass -File "!PS_GH!" -Version "!APP_VERSION!" -Repo "!GITHUB_REPO!" -BundlePath "!AGENT_DIR!\dist\bundle.js" -ZipPath "!ZIP_FILE!"
set GH_EXIT=!errorlevel!
del "!PS_GH!" 2>nul
if !GH_EXIT! neq 0 (
    echo [ERROR] Fallo al publicar GitHub Release.
    pause & exit /b 1
)
echo       OK: GitHub Release v!APP_VERSION! publicado.

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

:: Agentes < v1.5.5 no saben manejar ZIP: siempre publicar bundle.js como URL primaria.
:: Una vez todos los agentes esten en v1.5.5+, se puede cambiar a stc-update.zip.
set DLURL=https://github.com/!GITHUB_REPO!/releases/download/v!APP_VERSION!/bundle.js
set PS_RND=%TEMP%\stc_rnd_%RANDOM%.ps1
echo param^($ServiceId, $Version, $DownloadUrl, $Hash^) > "!PS_RND!"
echo $apiKey = $env:RENDER_API_KEY >> "!PS_RND!"
echo $hdr = @{ Authorization = "Bearer $apiKey"; Accept = 'application/json'; 'Content-Type' = 'application/json' } >> "!PS_RND!"
echo. >> "!PS_RND!"
echo $current = Invoke-RestMethod "https://api.render.com/v1/services/$ServiceId/env-vars" -Headers $hdr -ErrorAction Stop >> "!PS_RND!"
echo $filtered = @^($current ^| ForEach-Object { @{ key = $_.envVar.key; value = $_.envVar.value } } ^| Where-Object { $_.key -ne '' -and $_.key -notin @^('AGENT_VERSION', 'AGENT_DOWNLOAD_URL', 'AGENT_HASH'^) }^) >> "!PS_RND!"
echo $filtered += @{ key = 'AGENT_VERSION'; value = $Version } >> "!PS_RND!"
echo $filtered += @{ key = 'AGENT_DOWNLOAD_URL'; value = $DownloadUrl } >> "!PS_RND!"
echo $filtered += @{ key = 'AGENT_HASH'; value = $Hash } >> "!PS_RND!"
echo $body = ConvertTo-Json @^($filtered^) -Depth 3 >> "!PS_RND!"
echo Invoke-RestMethod "https://api.render.com/v1/services/$ServiceId/env-vars" -Method Put -Headers $hdr -Body $body -ContentType 'application/json' -ErrorAction Stop ^| Out-Null >> "!PS_RND!"
echo Write-Host "  AGENT_VERSION=$Version" >> "!PS_RND!"
echo Write-Host "  AGENT_DOWNLOAD_URL=$DownloadUrl" >> "!PS_RND!"
echo Write-Host "  AGENT_HASH=$Hash" >> "!PS_RND!"
echo. >> "!PS_RND!"
echo $deployBody = '{}' >> "!PS_RND!"
echo $deploy = Invoke-RestMethod "https://api.render.com/v1/services/$ServiceId/deploys" -Method Post -Headers $hdr -Body $deployBody -ContentType 'application/json' -ErrorAction Stop >> "!PS_RND!"
echo Write-Host "  Deploy disparado: id=$($deploy.id) status=$($deploy.status)" >> "!PS_RND!"

powershell -NoProfile -ExecutionPolicy Bypass -File "!PS_RND!" -ServiceId "!RENDER_SERVICE_ID!" -Version "!APP_VERSION!" -DownloadUrl "!DLURL!" -Hash "!BUNDLE_HASH!"
set RND_EXIT=!errorlevel!
del "!PS_RND!" 2>nul
if !RND_EXIT! neq 0 (
    echo [ERROR] Fallo al actualizar Render.
    pause & exit /b 1
)
echo       OK: Render actualizado. Los agentes aplicaran parche ZIP en el proximo ciclo.

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

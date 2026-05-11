; ============================================================================
;  STC Cloud Monitor — Instalador para Windows
;  Requiere: Inno Setup 6.x (https://jrsoftware.org/isinfo.php)
;
;  Instalación interactiva:
;    STC-Monitor-Setup-v1.0.0.exe
;
;  Instalación silenciosa (GPO / scripts):
;    STC-Monitor-Setup-v1.0.0.exe /VERYSILENT /SUPPRESSMSGBOXES /KEY=xxxxxxxxxxxx /SERVER=https://stc-cloud.onrender.com
;
;  Estructura de archivos esperada antes de compilar:
;    installer/
;      STC-Monitor.iss          <- este archivo
;      tools/
;        nssm.exe               <- NSSM 2.24 x64 (descargado por build-installer.bat)
;        STC-Monitor-Status.ps1 <- consola de estado (UI)
;        STC-Monitor-UI.bat     <- lanzador de la consola
;    agent/dist/
;      STCCloudMonitor.exe   <- generado por: cd agent && build\build.bat
; ============================================================================

#define MyAppName      "STC Cloud Monitor"
#define MyAppVersion   "1.0.0"
#define MyAppPublisher "STC Cloud"
#define MyAppExeName   "stc-node.exe"
#define ServiceName    "STCCloudMonitor"
#define DataDir        "C:\ProgramData\STCCloudMonitor"
#define DefaultServer  "https://stc-cloud.onrender.com"

; ─── Configuración general ───────────────────────────────────────────────────
[Setup]
AppId={{D3A7C2F1-8B4E-4F6A-9D0C-E5B123456789}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} v{#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\STC\Monitor
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=output
OutputBaseFilename=Instalador-STC-Monitor-v{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog
SetupIconFile=..\Assets\favicon.ico
UninstallDisplayIcon={app}\STC.Monitor.UI.exe
MinVersion=10.0
ArchitecturesInstallIn64BitMode=x64compatible
SetupMutex=STC-Monitor-Setup-Mutex
CloseApplications=yes
RestartApplications=no

; ─── Idioma ──────────────────────────────────────────────────────────────────
[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

; ─── Archivos a instalar ─────────────────────────────────────────────────────
[Files]
; Runtime de Node.js (copia privada del node.exe actual)
Source: "..\agent\dist\stc-node.exe";             DestDir: "{app}"; Flags: ignoreversion
; Código del agente (esbuild bundle)
Source: "..\agent\dist\bundle.js";               DestDir: "{app}"; Flags: ignoreversion
; Módulo nativo SQLite — debe estar junto a stc-node.exe para que nativeBinding lo encuentre
Source: "..\node_modules\better-sqlite3\build\Release\better_sqlite3.node"; DestDir: "{app}"; Flags: ignoreversion
Source: "tools\nssm.exe";                         DestDir: "{app}"; Flags: ignoreversion
; Consola de gestión (WinForms tray app — self-contained, sin dependencias)
Source: "..\monitor-ui\publish\STC.Monitor.UI.exe"; DestDir: "{app}"; Flags: ignoreversion

; ─── Directorio de datos ─────────────────────────────────────────────────────
[Dirs]
Name: "{#DataDir}"; Permissions: everyone-full

; ─── Accesos directos ────────────────────────────────────────────────────────
[Icons]
Name: "{group}\{#MyAppName} — Consola de Estado"; Filename: "{app}\STC.Monitor.UI.exe"
Name: "{group}\Desinstalar {#MyAppName}";           Filename: "{uninstallexe}"
Name: "{commondesktop}\{#MyAppName}";               Filename: "{app}\STC.Monitor.UI.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Crear acceso directo en el &escritorio"; GroupDescription: "Opciones adicionales:"

; ─── Lanzar consola de gestión al finalizar (sin ventana de consola) ─────────
[Run]
; Crear tarea programada ONLOGON con privilegios elevados — evita UAC en cada reinicio (igual que HP SDS DCA)
; Usamos ""\""{app}\...\"""" para que schtasks reciba la ruta entre comillas y no falle con espacios.
Filename: "schtasks.exe"; Parameters: "/Create /SC ONLOGON /TN ""STC-Monitor-UI"" /TR ""\""{app}\STC.Monitor.UI.exe\"""" /RL HIGHEST /F"; Flags: runhidden; StatusMsg: "Configurando inicio automtico en bandeja..."
; Ajustamos la tarea para que funcione en laptops (batera) y no se detenga sola
Filename: "powershell.exe"; Parameters: "-NoProfile -WindowStyle Hidden -Command ""$t = Get-ScheduledTask -TaskName 'STC-Monitor-UI'; $t.Settings.StopIfGoingOnBatteries = $false; $t.Settings.DisallowStartIfOnBatteries = $false; $t.Settings.ExecutionTimeLimit = 'PT0S'; Set-ScheduledTask -InputObject $t"""; Flags: runhidden; StatusMsg: "Optimizando tarea programada para laptops..."
Filename: "{app}\STC.Monitor.UI.exe"; Description: "Iniciar consola de monitoreo STC"; Flags: postinstall nowait skipifsilent shellexec; StatusMsg: "Iniciando consola de monitoreo..."

; ─── Desinstalación ──────────────────────────────────────────────────────────
[UninstallRun]
; 1. Forzar cierre de la consola de bandeja si el usuario la dejó abierta
Filename: "taskkill.exe";    Parameters: "/F /IM STC.Monitor.UI.exe /T";  Flags: runhidden skipifdoesntexist; RunOnceId: "KillUI"
; 2. Eliminar tarea programada de inicio automático
Filename: "schtasks.exe";    Parameters: "/Delete /TN ""STC-Monitor-UI"" /F";  Flags: runhidden; RunOnceId: "DeleteTask"
; 3. Detener y remover el servicio
Filename: "net.exe";         Parameters: "stop {#ServiceName}";           Flags: runhidden; RunOnceId: "StopSvc"
Filename: "{app}\nssm.exe";  Parameters: "remove {#ServiceName} confirm";  Flags: runhidden; RunOnceId: "RemoveSvc"

[UninstallDelete]
; Limpiar datos del agente (config cifrada, logs) al desinstalar
; Borrar archivos internos primero asegura que la carpeta quede vacía para poder ser borrada
Type: files; Name: "{#DataDir}\*"
Type: filesandordirs; Name: "{#DataDir}"

; ─── Código Pascal ───────────────────────────────────────────────────────────
[Code]

// ── Inicialización: verificar instalación previa ─────────────────────────────
function InitializeSetup: Boolean;
var
  ResultCode: Integer;
begin
  Result := True;

  // Detectar instalación previa
  if Exec('sc.exe', 'query {#ServiceName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then begin
    if ResultCode = 0 then begin
      if MsgBox(
        'Se detectó una instalación previa del servicio "' + ExpandConstant('{#ServiceName}') + '".' + #13#10 +
        'La reinstalación detendrá y reemplazará el servicio existente.' + #13#10#13#10 +
        '¿Desea continuar?',
        mbConfirmation, MB_YESNO) = IDNO then
      begin
        Result := False;
      end else begin
        Exec('net.exe', 'stop {#ServiceName}',   '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
        Exec('sc.exe',  'delete {#ServiceName}',  '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
        Sleep(2000);
      end;
    end;
  end;
end;

// ── Registrar el servicio (DEMAND_START: arranque manual hasta que el agente sea activado) ──
procedure RegisterService;
var
  NssmExe: String;
  ResultCode: Integer;
begin
  NssmExe := ExpandConstant('{app}\nssm.exe');

  if not WizardSilent then
    WizardForm.StatusLabel.Caption := 'Registrando servicio de Windows...';

  // Instalar solo con el ejecutable; AppParameters se fija por separado sin paths largos
  Exec(NssmExe, 'install {#ServiceName} "' + ExpandConstant('{app}\stc-node.exe') + '"',
       '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  // Directorio de trabajo = {app} (evita que bundle.js se busque en System32)
  Exec(NssmExe, 'set {#ServiceName} AppDirectory "' + ExpandConstant('{app}') + '"',
       '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  // bundle.js sin path absoluto: Node.js lo resuelve relativo a AppDirectory
  Exec(NssmExe, 'set {#ServiceName} AppParameters bundle.js',
       '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(NssmExe, 'set {#ServiceName} AppEnvironmentExtra "AGENT_DATA_DIR={#DataDir}"',
       '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(NssmExe, 'set {#ServiceName} DisplayName "STC Cloud - Monitor de Impresoras"',
       '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(NssmExe, 'set {#ServiceName} Description "STC Cloud - Servicio de monitoreo de impresoras multimarca via SNMP"',
       '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  // DEMAND_START: el agente necesita activación antes de poder correr.
  // La UI de bandeja cambia esto a AUTO_START luego de la activación exitosa.
  Exec(NssmExe, 'set {#ServiceName} Start SERVICE_DEMAND_START',
       '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(NssmExe, 'set {#ServiceName} AppThrottle 60000',
       '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(NssmExe, 'set {#ServiceName} AppRestartDelay 10000',
       '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(NssmExe, 'set {#ServiceName} AppStdout "{#DataDir}\nssm-stdout.log"',
       '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(NssmExe, 'set {#ServiceName} AppStderr "{#DataDir}\nssm-stderr.log"',
       '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(NssmExe, 'set {#ServiceName} AppStdoutCreationDisposition 4',
       '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(NssmExe, 'set {#ServiceName} AppStderrCreationDisposition 4',
       '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

// ── Utilidades para parámetros de consola ────────────────────────────────────
function GetParam(ParamName: String): String;
var
  i: Integer;
  Param: String;
begin
  Result := '';
  for i := 1 to ParamCount do
  begin
    Param := ParamStr(i);
    if Pos('/' + Uppercase(ParamName) + '=', Uppercase(Param)) = 1 then
    begin
      Result := Copy(Param, Pos('=', Param) + 1, Length(Param));
      Break;
    end;
  end;
end;

// ── Activar el agente si se pasan parámetros /KEY y /SERVER ──────────────────
procedure ActivateAgent;
var
  ActivationKey: String;
  ServerUrl: String;
  ResultCode: Integer;
  Args: String;
begin
  ActivationKey := GetParam('KEY');
  ServerUrl := GetParam('SERVER');
  
  if ServerUrl = '' then ServerUrl := '{#DefaultServer}';

  if ActivationKey <> '' then
  begin
    if not WizardSilent then
      WizardForm.StatusLabel.Caption := 'Activando agente con el servidor...';
      
    Args := '"' + ExpandConstant('{app}\bundle.js') + '" --activate ' + ActivationKey + ' --server ' + ServerUrl;
    
    if Exec(ExpandConstant('{app}\stc-node.exe'), Args, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    begin
      if ResultCode = 0 then
      begin
        // Si activó bien, ponemos el servicio en AUTO_START de una vez
        Exec(ExpandConstant('{app}\nssm.exe'), 'set {#ServiceName} Start SERVICE_AUTO_START', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
        Log('Activación exitosa durante la instalación.');
      end else begin
        Log('Fallo la activación automática. Código: ' + IntToStr(ResultCode));
      end;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    RegisterService;
    ActivateAgent;
  end;
end;

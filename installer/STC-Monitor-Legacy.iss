; ============================================================================
;  STC Cloud Monitor - Instalador LEGACY (Windows 7 SP1 / Server 2008 R2 SP1+)
;  Requiere: Inno Setup 6.x (https://jrsoftware.org/isinfo.php)
;
;  Variante para hosts que no soportan .NET 9 / Node.js 24 (el instalador
;  normal, STC-Monitor.iss). Usa:
;    - stc-node.exe = Node.js 20.2.0 (agent\dist-legacy\, generado con
;      build-sea.js --node-exe <node 20.2.0> --target node20 --out-dir
;      dist-legacy — Node 20.3.0+ ya no arranca en Server 2008 R2, ver
;      nodejs/node#51465 en GitHub)
;    - STC.Monitor.UI.exe = .NET Framework 4.8 (monitor-ui\publish.legacy\,
;      generado con STC.Monitor.UI.Legacy.csproj) en vez de .NET 9 (.NET dejó
;      de soportar Windows 7 / Server 2008 R2 hace tiempo)
;
;  A diferencia del instalador normal, acá NO se autocontiene el runtime de
;  .NET (.NET Framework no lo soporta): el print server necesita tener .NET
;  Framework 4.8 instalado (viene en Windows 10/Server 2016+, pero en Server
;  2008 R2 hay que instalarlo aparte — sigue siendo una descarga oficial de
;  Microsoft con soporte indefinido). El wizard lo chequea antes de instalar.
; ============================================================================

#define MyAppName      "STC Cloud Monitor"
#define MyAppVersion   "1.3.2"
#define MyAppPublisher "STC Cloud"
#define MyAppExeName   "stc-node.exe"
#define ServiceName    "STCCloudMonitor"
#define DataDir        "C:\ProgramData\STCCloudMonitor"
#define DefaultServer  "http://localhost:3000"

[Setup]
AppId={{D3A7C2F1-8B4E-4F6A-9D0C-E5B123456789}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} v{#MyAppVersion} (Legacy)
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\STC\Monitor
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=output
OutputBaseFilename=Instalador-STC-Monitor-Legacy-v{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
SetupIconFile=..\Assets\favicon.ico
UninstallDisplayIcon={app}\STC.Monitor.UI.exe
; Windows 7 SP1 / Server 2008 R2 SP1 = NT 6.1. Inno Setup 6.x en sí mismo
; soporta bien hosts de esta antigüedad (a diferencia de Node/.NET, no tiene
; piso propio más alto).
MinVersion=6.1
ArchitecturesInstallIn64BitMode=x64compatible
SetupMutex=STC-Monitor-Setup-Mutex
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Files]
Source: "..\agent\dist-legacy\stc-node.exe";      DestDir: "{app}"; Flags: ignoreversion
Source: "..\agent\dist-legacy\bundle.js";         DestDir: "{app}"; Flags: ignoreversion
; better-sqlite3 y "bindings" quedan externalizados del bundle (ver
; agent\build-sea.js): "bindings" ubica el .node compilado inspeccionando el
; archivo que lo invoca para encontrar la raiz de SU PROPIO paquete -- hace
; falta el paquete completo. Y "bindings" en si depende de "file-uri-to-path"
; -- confirmado faltante en el primer despliegue real (10/09/2026): "Cannot
; find module 'bindings'" al arrancar el servicio, better-sqlite3\ solo no
; alcanza. OJO: better-sqlite3 tiene que estar compilado contra el ABI de
; Node 20 (NODE_MODULE_VERSION 115) antes de este build, no el de Node 24
; que usa el instalador normal -- ver build-installer-legacy.bat paso 1.
Source: "..\node_modules\better-sqlite3\*";  DestDir: "{app}\node_modules\better-sqlite3";  Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\node_modules\bindings\*";        DestDir: "{app}\node_modules\bindings";        Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\node_modules\file-uri-to-path\*"; DestDir: "{app}\node_modules\file-uri-to-path"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "tools\nssm.exe";                         DestDir: "{app}"; Flags: ignoreversion
; .NET Framework no soporta self-contained/single-file: se copia la carpeta
; de publicación completa (exe + dependencias .dll), no un único archivo.
Source: "..\monitor-ui\publish.legacy\*";         DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Dirs]
Name: "{#DataDir}"; Permissions: system-full admins-full authusers-readexec

[Icons]
Name: "{group}\{#MyAppName} - Consola de Estado"; Filename: "{app}\STC.Monitor.UI.exe"
Name: "{group}\Desinstalar {#MyAppName}";           Filename: "{uninstallexe}"
Name: "{userdesktop}\{#MyAppName}";               Filename: "{app}\STC.Monitor.UI.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Crear acceso directo en el &escritorio"; GroupDescription: "Opciones adicionales:"

[Run]
Filename: "schtasks.exe"; Parameters: "/Create /SC ONLOGON /TN ""STC-Monitor-UI"" /TR ""\""{app}\STC.Monitor.UI.exe\"""" /RL HIGHEST /F"; Flags: runhidden; StatusMsg: "Configurando inicio automatico en bandeja..."
Filename: "{app}\nssm.exe"; Parameters: "set {#ServiceName} Start SERVICE_AUTO_START"; Flags: runhidden; Check: IsActivated
Filename: "{app}\nssm.exe"; Parameters: "start {#ServiceName}"; Flags: runhidden; StatusMsg: "Iniciando servicio de monitoreo..."; Check: IsActivated
Filename: "{app}\STC.Monitor.UI.exe"; Description: "Iniciar consola de monitoreo STC"; Flags: postinstall nowait skipifsilent shellexec; StatusMsg: "Iniciando consola de monitoreo..."

[UninstallRun]
Filename: "taskkill.exe";    Parameters: "/F /IM STC.Monitor.UI.exe /T";  Flags: runhidden skipifdoesntexist; RunOnceId: "KillUI"
Filename: "taskkill.exe";    Parameters: "/F /IM stc-node.exe /T";        Flags: runhidden skipifdoesntexist; RunOnceId: "KillNode"
Filename: "schtasks.exe";    Parameters: "/Delete /TN ""STC-Monitor-UI"" /F";  Flags: runhidden; RunOnceId: "DeleteTask"
Filename: "net.exe";         Parameters: "stop {#ServiceName}";           Flags: runhidden; RunOnceId: "StopSvc"
Filename: "{app}\nssm.exe";  Parameters: "remove {#ServiceName} confirm";  Flags: runhidden; RunOnceId: "RemoveSvc"

[UninstallDelete]
Type: filesandordirs; Name: "{app}\node_modules"
Type: files; Name: "{app}\*"
Type: filesandordirs; Name: "{app}"
Type: files; Name: "{#DataDir}\*"; Check: NotKeepingData
Type: filesandordirs; Name: "{#DataDir}"; Check: NotKeepingData

[Code]

var
  KeepUserData: Boolean;

function InitializeUninstall: Boolean;
begin
  Result := True;
  KeepUserData := (MsgBox(
    'Conservar los datos del agente (configuracion cifrada, cola local de lecturas, logs)?' + #13#10#13#10 +
    'Elegi "Si" si vas a reinstalar y queres mantener la activacion/historial existente.' + #13#10 +
    'Elegi "No" para una desinstalacion completa, sin dejar rastro.',
    mbConfirmation, MB_YESNO) = IDYES);
end;

function NotKeepingData: Boolean;
begin
  Result := not KeepUserData;
end;

// Detectar si .NET Framework 4.8 esta instalado (release DWORD >= 528040,
// ver https://learn.microsoft.com/dotnet/framework/migration-guide/how-to-determine-which-versions-are-installed)
function IsDotNet48Installed: Boolean;
var
  ReleaseValue: Cardinal;
begin
  Result := RegQueryDWordValue(HKLM, 'SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full', 'Release', ReleaseValue)
            and (ReleaseValue >= 528040);
end;

// Inicializacion: verificar .NET Framework 4.8 + instalacion previa
function InitializeSetup: Boolean;
var
  ResultCode: Integer;
begin
  Result := True;

  if not IsDotNet48Installed then
  begin
    if MsgBox(
      'Esta version del instalador (para Windows Server 2008 R2 / Windows 7) necesita ' +
      '.NET Framework 4.8, que no se detecto en este equipo.' + #13#10#13#10 +
      'El agente de monitoreo (servicio) se puede instalar igual, pero la consola grafica ' +
      '(STC Cloud Monitor Console) no va a arrancar hasta instalar .NET Framework 4.8.' + #13#10#13#10 +
      'Descarga oficial: https://dotnet.microsoft.com/download/dotnet-framework/net48' + #13#10#13#10 +
      'Continuar con la instalacion de todos modos?',
      mbConfirmation, MB_YESNO) = IDNO then
    begin
      Result := False;
      Exit;
    end;
  end;

  // Detectar instalacion previa
  if Exec('sc.exe', 'query {#ServiceName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then begin
    if ResultCode = 0 then begin
      if MsgBox(
        'Se detecto una instalacion previa del servicio "' + ExpandConstant('{#ServiceName}') + '".' + #13#10 +
        'La reinstalacion detendra y reemplazara el servicio existente.' + #13#10#13#10 +
        'Desea continuar?',
        mbConfirmation, MB_YESNO) = IDNO then
      begin
        Result := False;
      end else begin
        Exec('taskkill.exe', '/F /IM STC.Monitor.UI.exe /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
        Exec('taskkill.exe', '/F /IM nssm.exe /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
        Exec('taskkill.exe', '/F /IM stc-node.exe /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
        Exec('net.exe', 'stop {#ServiceName}',   '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
        Exec('sc.exe',  'delete {#ServiceName}',  '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
        Sleep(2000);
      end;
    end;
  end;
end;

// Registrar el servicio (DEMAND_START: arranque manual hasta que el agente sea activado)
procedure RegisterService;
var
  NssmExe: String;
  ResultCode: Integer;
begin
  NssmExe := ExpandConstant('{app}\nssm.exe');

  if not WizardSilent then
    WizardForm.StatusLabel.Caption := 'Registrando servicio de Windows...';

  Exec(NssmExe, 'install {#ServiceName} "' + ExpandConstant('{app}\stc-node.exe') + '"',
       '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(NssmExe, 'set {#ServiceName} AppDirectory "' + ExpandConstant('{app}') + '"',
       '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(NssmExe, 'set {#ServiceName} AppParameters bundle.js',
       '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  // NODE_SKIP_PLATFORM_CHECK=1: Node.js (desde hace varias versiones) se
  // niega a arrancar en Windows anteriores a 8.1/Server 2012 R2 salvo que se
  // lo pida explicitamente -- confirmado en el primer despliegue real
  // (10/09/2026) contra Server 2008 R2. AppEnvironmentExtra acepta varias
  // lineas como argumentos separados (cada uno pasa a ser una linea del
  // MULTI_SZ que arma NSSM), no una sola con saltos de linea embebidos.
  Exec(NssmExe, 'set {#ServiceName} AppEnvironmentExtra "AGENT_DATA_DIR={#DataDir}" "NODE_SKIP_PLATFORM_CHECK=1"',
       '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(NssmExe, 'set {#ServiceName} DisplayName "STC Cloud - Monitor de Impresoras"',
       '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(NssmExe, 'set {#ServiceName} Description "STC Cloud - Servicio de monitoreo de impresoras multimarca via SNMP"',
       '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
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
        Exec(ExpandConstant('{app}\nssm.exe'), 'set {#ServiceName} Start SERVICE_AUTO_START', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
        Log('Activacion exitosa durante la instalacion.');
      end else begin
        Log('Fallo la activacion automatica. Codigo: ' + IntToStr(ResultCode));
      end;
    end;
  end;
end;

function IsActivated: Boolean;
begin
  Result := FileExists(ExpandConstant('{#DataDir}\config.enc'));
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    RegisterService;
    ActivateAgent;
  end;
end;

; ============================================================================
;  STC Cloud Monitor - Instalador para Windows
;  Requiere: Inno Setup 6.x (https://jrsoftware.org/isinfo.php)
; ============================================================================

#define MyAppName      "STC Cloud Monitor"
#define MyAppVersion   "1.0.0"
#define MyAppPublisher "STC Cloud"
#define MyAppExeName   "stc-node.exe"
#define ServiceName    "STCCloudMonitor"
#define DataDir        "C:\ProgramData\STCCloudMonitor"
#define DefaultServer  "http://localhost:3000"

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
SetupIconFile=..\Assets\favicon.ico
UninstallDisplayIcon={app}\STC.Monitor.UI.exe
MinVersion=10.0
ArchitecturesInstallIn64BitMode=x64compatible
SetupMutex=STC-Monitor-Setup-Mutex
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Files]
Source: "..\agent\dist\stc-node.exe";             DestDir: "{app}"; Flags: ignoreversion
Source: "..\agent\dist\bundle.js";               DestDir: "{app}"; Flags: ignoreversion
Source: "..\node_modules\better-sqlite3\build\Release\better_sqlite3.node"; DestDir: "{app}"; Flags: ignoreversion
Source: "tools\nssm.exe";                         DestDir: "{app}"; Flags: ignoreversion
Source: "..\monitor-ui\publish\STC.Monitor.UI.exe"; DestDir: "{app}"; Flags: ignoreversion

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
Filename: "powershell.exe"; Parameters: "-NoProfile -WindowStyle Hidden -Command ""$t = Get-ScheduledTask -TaskName 'STC-Monitor-UI'; $t.Settings.StopIfGoingOnBatteries = $false; $t.Settings.DisallowStartIfOnBatteries = $false; $t.Settings.ExecutionTimeLimit = 'PT0S'; Set-ScheduledTask -InputObject $t"""; Flags: runhidden; StatusMsg: "Optimizando tarea programada para laptops..."
Filename: "{app}\nssm.exe"; Parameters: "set {#ServiceName} Start SERVICE_AUTO_START"; Flags: runhidden; Check: IsActivated
Filename: "{app}\nssm.exe"; Parameters: "start {#ServiceName}"; Flags: runhidden; StatusMsg: "Iniciando servicio de monitoreo..."; Check: IsActivated
Filename: "{app}\STC.Monitor.UI.exe"; Description: "Iniciar consola de monitoreo STC"; Flags: postinstall nowait skipifsilent shellexec; StatusMsg: "Iniciando consola de monitoreo..."

[UninstallRun]
; 1. Forzar cierre de la UI y del runtime del agente stc-node para liberar bloqueos de archivos en uso
Filename: "taskkill.exe";    Parameters: "/F /IM STC.Monitor.UI.exe /T";  Flags: runhidden skipifdoesntexist; RunOnceId: "KillUI"
Filename: "taskkill.exe";    Parameters: "/F /IM stc-node.exe /T";        Flags: runhidden skipifdoesntexist; RunOnceId: "KillNode"
; 2. Eliminar la tarea programada de inicio automatico
Filename: "schtasks.exe";    Parameters: "/Delete /TN ""STC-Monitor-UI"" /F";  Flags: runhidden; RunOnceId: "DeleteTask"
; 3. Detener y remover el servicio de Windows
Filename: "net.exe";         Parameters: "stop {#ServiceName}";           Flags: runhidden; RunOnceId: "StopSvc"
Filename: "{app}\nssm.exe";  Parameters: "remove {#ServiceName} confirm";  Flags: runhidden; RunOnceId: "RemoveSvc"

[UninstallDelete]
; Limpiar la carpeta temporal node_modules y el directorio de instalacion al desinstalar
Type: filesandordirs; Name: "{app}\node_modules"
Type: files; Name: "{app}\*"
Type: filesandordirs; Name: "{app}"
Type: files; Name: "{#DataDir}\*"
Type: filesandordirs; Name: "{#DataDir}"

[Code]

// Inicializacion: verificar instalacion previa
function InitializeSetup: Boolean;
var
  ResultCode: Integer;
begin
  Result := True;

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
        // Forzar cierre de la consola de bandeja para liberar handles al servicio
        Exec('taskkill.exe', '/F /IM STC.Monitor.UI.exe /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
        // Matar cualquier instancia de nssm y stc-node activa (requiere privilegios de admin, provistos por el instalador)
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
  // DEMAND_START: el agente necesita activacion antes de poder correr.
  // La UI de bandeja cambia esto a AUTO_START luego de la activacion exitosa.
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

// Utilidades para parametros de consola
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

// Activar el agente si se pasan parametros /KEY y /SERVER
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
        // Si activo bien, ponemos el servicio en AUTO_START de una vez
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

using System;
using System.Diagnostics;
using System.IO;
using System.ServiceProcess;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;

namespace STC.Monitor.UI;

internal sealed class AgentStatus
{
    [JsonPropertyName("version")]   public string?  Version   { get; init; }
    [JsonPropertyName("activated")] public bool     Activated { get; init; }
    [JsonPropertyName("agentId")]   public string?  AgentId   { get; init; }
    [JsonPropertyName("serverUrl")] public string?  ServerUrl { get; init; }
    [JsonPropertyName("service")]   public string?  Service   { get; init; }
    [JsonPropertyName("dataDir")]   public string?  DataDir   { get; init; }
    [JsonPropertyName("proxyUrl")]  public string?  ProxyUrl  { get; init; }
}

internal static class AgentService
{
    private const string ServiceName    = "STCCloudMonitor";
    private const string DefaultDataDir = @"C:\ProgramData\STCCloudMonitor";

    // ── Locate runtime + bundle ───────────────────────────────────────────────
    // Arquitectura SEA: stc-node.exe es el runtime Node.js; bundle.js es el codigo.
    // El servicio corre: stc-node.exe bundle.js [args]

    public static string? FindAgentExe()
    {
        string[] candidates =
        [
            Path.Combine(AppContext.BaseDirectory, "stc-node.exe"),
            @"C:\Program Files\STC\Monitor\stc-node.exe",
            @"C:\Program Files (x86)\STC\Monitor\stc-node.exe",
        ];
        foreach (var path in candidates)
            if (File.Exists(path)) return path;
        return null;
    }

    private static string? FindBundlePath(string nodeExe) =>
        Path.Combine(Path.GetDirectoryName(nodeExe)!, "bundle.js") is string p && File.Exists(p) ? p : null;

    // Node.js (desde hace varias versiones) se niega a arrancar en Windows
    // anteriores a 8.1/Server 2012 R2 salvo que se le pida saltear el check —
    // necesario para la variante legacy (Node 20.2.0 en Server 2008 R2). No
    // afecta al runtime moderno (Node 24) en Windows 10+, ahí el check ya
    // pasa igual; se setea siempre por simplicidad de un solo código fuente.
    private static void ConfigureNodeEnv(ProcessStartInfo psi) =>
        psi.EnvironmentVariables["NODE_SKIP_PLATFORM_CHECK"] = "1";

    // ── Status (calls bundle.js --status, parses JSON) ────────────────────────

    public static Task<AgentStatus?> GetStatusAsync() => Task.Run(GetStatus);

    public static AgentStatus? GetStatus()
    {
        var nodeExe = FindAgentExe();
        if (nodeExe is null) return null;
        var bundlePath = FindBundlePath(nodeExe);
        if (bundlePath is null) return null;

        try
        {
            var psi = new ProcessStartInfo(nodeExe, $"\"{bundlePath}\" --status")
            {
                RedirectStandardOutput = true,
                RedirectStandardError  = true,
                UseShellExecute        = false,
                CreateNoWindow         = true,
                WindowStyle            = ProcessWindowStyle.Hidden,
            };
            ConfigureNodeEnv(psi);
            using var proc = Process.Start(psi)!;
            var json = proc.StandardOutput.ReadToEnd();
            proc.WaitForExit(10_000);
            return JsonSerializer.Deserialize<AgentStatus>(json);
        }
        catch
        {
            return null;
        }
    }

    // ── Activation (calls bundle.js --activate, awaitable) ───────────────────

    public static Task<(bool Ok, string? Error)> ActivateAsync(string key, string serverUrl) =>
        Task.Run(() => Activate(key, serverUrl));

    private static (bool Ok, string? Error) Activate(string key, string serverUrl)
    {
        var nodeExe = FindAgentExe();
        if (nodeExe is null) return (false, "Ejecutable del agente no encontrado.");
        var bundlePath = FindBundlePath(nodeExe);
        if (bundlePath is null) return (false, "Bundle del agente no encontrado.");

        try
        {
            var psi = new ProcessStartInfo(nodeExe, $"\"{bundlePath}\" --activate {key} --server {serverUrl}")
            {
                UseShellExecute        = false,
                RedirectStandardOutput = true,
                RedirectStandardError  = true,
                CreateNoWindow         = true,
                WindowStyle            = ProcessWindowStyle.Hidden,
            };
            ConfigureNodeEnv(psi);
            using var proc = Process.Start(psi)!;
            var stdout = proc.StandardOutput.ReadToEnd();
            var stderr = proc.StandardError.ReadToEnd();
            proc.WaitForExit(30_000);

            if (proc.ExitCode == 0) return (true, null);

            var detail = !string.IsNullOrWhiteSpace(stderr) ? stderr.Trim()
                       : !string.IsNullOrWhiteSpace(stdout) ? stdout.Trim()
                       : $"Codigo de salida {proc.ExitCode}";
            return (false, detail);
        }
        catch (Exception ex)
        {
            return (false, ex.Message);
        }
    }

    // ── Proxy configuration (calls bundle.js --set-proxy <url>) ──────────────

    public static Task<(bool Ok, string? Error)> SetProxyAsync(string proxyUrl) =>
        Task.Run(() => SetProxy(proxyUrl));

    private static (bool Ok, string? Error) SetProxy(string proxyUrl)
    {
        var nodeExe = FindAgentExe();
        if (nodeExe is null) return (false, "Ejecutable del agente no encontrado.");
        var bundlePath = FindBundlePath(nodeExe);
        if (bundlePath is null) return (false, "Bundle del agente no encontrado.");

        // Pasar "none" si el usuario dejo el campo vacio (quitar proxy)
        var arg = string.IsNullOrWhiteSpace(proxyUrl) ? "none" : proxyUrl.Trim();

        try
        {
            var psi = new ProcessStartInfo(nodeExe, $"\"{bundlePath}\" --set-proxy {arg}")
            {
                UseShellExecute        = false,
                RedirectStandardOutput = true,
                RedirectStandardError  = true,
                CreateNoWindow         = true,
                WindowStyle            = ProcessWindowStyle.Hidden,
            };
            ConfigureNodeEnv(psi);
            using var proc = Process.Start(psi)!;
            var stdout = proc.StandardOutput.ReadToEnd();
            var stderr = proc.StandardError.ReadToEnd();
            proc.WaitForExit(10_000);

            if (proc.ExitCode == 0) return (true, null);
            var detail = !string.IsNullOrWhiteSpace(stderr) ? stderr.Trim()
                       : !string.IsNullOrWhiteSpace(stdout) ? stdout.Trim()
                       : $"Codigo de salida {proc.ExitCode}";
            return (false, detail);
        }
        catch (Exception ex)
        {
            return (false, ex.Message);
        }
    }

    // ── Force scan via sentinel file ──────────────────────────────────────────

    public static void ForceScan()
    {
        Directory.CreateDirectory(DefaultDataDir);
        File.WriteAllText(
            Path.Combine(DefaultDataDir, "force-scan.flag"),
            DateTime.UtcNow.ToString("O"));
    }

    // ── Log path ──────────────────────────────────────────────────────────────

    public static string GetLogPath()
    {
        var status = GetStatus();
        var dir = status?.DataDir ?? DefaultDataDir;
        return Path.Combine(dir, "agent.log");
    }


    // ── Service control ───────────────────────────────────────────────────────

    public static Task<(bool Ok, string? Error)> StartServiceAsync() => Task.Run(StartService);

    public static (bool Ok, string? Error) StartService()
    {
        try
        {
            using var svc = new ServiceController(ServiceName);
            svc.Refresh();
            if (svc.Status != ServiceControllerStatus.Running)
            {
                svc.Start();
                svc.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(45));
            }
            return (true, null);
        }
        catch (Exception ex)
        {
            return (false, ex.Message);
        }
    }

    public static (bool Ok, string? Error) RestartService()
    {
        try
        {
            using var svc = new ServiceController(ServiceName);
            svc.Refresh();
            if (svc.Status == ServiceControllerStatus.Running)
            {
                svc.Stop();
                svc.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(10));
            }
            svc.Start();
            svc.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(45));
            return (true, null);
        }
        catch (Exception ex)
        {
            return (false, ex.Message);
        }
    }

    // Cambia el servicio a inicio automatico una vez que el agente fue activado.
    // El instalador lo deja en DEMAND_START para evitar reinicios antes de la activacion.
    // ── Crash log de la bandeja ───────────────────────────────────────────────
    // Separado de `agent.log` (lo escribe bundle.js): antes de esto, una
    // excepcion no manejada en STC.Monitor.UI se perdia sin dejar mas rastro
    // que un codigo de falla en el Visor de eventos de Windows. Se escribe
    // SIEMPRE en DefaultDataDir, nunca en el DataDir "real" del agente
    // activado: resolver ese implica invocar `GetStatus()`, que lanza un
    // proceso Node — riesgoso hacerlo justo desde el manejador de una
    // excepcion no manejada, donde lo prioritario es no volver a fallar.
    private static readonly object CrashLogLock = new();

    public static string GetCrashLogPath() => Path.Combine(DefaultDataDir, "monitor-ui.log");

    public static void LogCrash(string source, Exception ex)
    {
        try
        {
            lock (CrashLogLock)
            {
                Directory.CreateDirectory(DefaultDataDir);
                File.AppendAllText(GetCrashLogPath(),
                    $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [{source}] {ex}{Environment.NewLine}");
            }
        }
        catch
        {
            // Si ni esto funciona (disco lleno, sin permisos), no hay mas red de contencion posible.
        }
    }

    public static void SetAutoStart()
    {
        var nodeExe = FindAgentExe();
        if (nodeExe is null) return;
        var nssmExe = Path.Combine(Path.GetDirectoryName(nodeExe)!, "nssm.exe");
        if (!File.Exists(nssmExe)) return;

        try
        {
            var psi = new ProcessStartInfo(nssmExe, $"set {ServiceName} Start SERVICE_AUTO_START")
            {
                UseShellExecute = false,
                CreateNoWindow  = true,
                WindowStyle     = ProcessWindowStyle.Hidden,
            };
            using var proc = Process.Start(psi);
            proc?.WaitForExit(5_000);
        }
        catch { }
    }

}

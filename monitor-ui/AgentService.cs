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
    [JsonPropertyName("lastLog")]   public string?  LastLog   { get; init; }
}

internal static class AgentService
{
    private const string ServiceName    = "ContadorImpresoras";
    private const string DefaultDataDir = @"C:\ProgramData\ContadorImpresoras";

    // ── Locate runtime + bundle ───────────────────────────────────────────────
    // Arquitectura SEA: stc-node.exe es el runtime Node.js; bundle.js es el código.
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

    // ── Status (calls bundle.js --status, parses JSON) ────────────────────────

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
            using var proc = Process.Start(psi)!;
            var stdout = proc.StandardOutput.ReadToEnd();
            var stderr = proc.StandardError.ReadToEnd();
            proc.WaitForExit(30_000);

            if (proc.ExitCode == 0) return (true, null);

            var detail = !string.IsNullOrWhiteSpace(stderr) ? stderr.Trim()
                       : !string.IsNullOrWhiteSpace(stdout) ? stdout.Trim()
                       : $"Código de salida {proc.ExitCode}";
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

    public static (bool Ok, string? Error) StartService()
    {
        try
        {
            using var svc = new ServiceController(ServiceName);
            svc.Refresh();
            if (svc.Status != ServiceControllerStatus.Running)
            {
                svc.Start();
                svc.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(15));
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
            svc.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(15));
            return (true, null);
        }
        catch (Exception ex)
        {
            return (false, ex.Message);
        }
    }

    // Cambia el servicio a inicio automático una vez que el agente fue activado.
    // El instalador lo deja en DEMAND_START para evitar reinicios antes de la activación.
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

    public static string GetFullLogs()
    {
        var logPath = GetLogPath();
        if (!File.Exists(logPath))
            return "No se encontró el archivo de log en: " + logPath;

        try
        {
            // Open with FileShare.ReadWrite so we don't lock it or fail if Node.js is writing
            using var fs = new FileStream(logPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            using var sr = new StreamReader(fs, System.Text.Encoding.UTF8);
            
            // For simple logs, just read to end. If it's too big, we might want to read only the tail,
            // but for a monitoring UI, reading the last ~50KB is usually fine.
            if (fs.Length > 50 * 1024)
            {
                fs.Seek(-50 * 1024, SeekOrigin.End);
                // Read until newline to sync
                sr.ReadLine();
            }
            return sr.ReadToEnd();
        }
        catch (Exception ex)
        {
            return $"Error al leer el log: {ex.Message}";
        }
    }
}

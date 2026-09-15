using System;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace STC.Monitor.UI;

/// <summary>
/// ApplicationContext que vive en la bandeja del sistema.
/// Equivalente a la "DCA Console" de HP SDS Manager — siempre disponible en la tray.
/// </summary>
internal sealed class TrayApplication : ApplicationContext
{
    private readonly NotifyIcon     _tray;
    private readonly ContextMenuStrip _menu;
    // No-readonly a propósito: se asigna dentro de BuildContextMenu(), no en
    // el cuerpo textual del constructor — un campo readonly ahí no compila
    // (CS0191), aunque BuildContextMenu() sólo se llame desde el constructor.
    private ToolStripMenuItem _itemAbout = null!;
    private readonly System.Windows.Forms.Timer _pollTimer;

    private MonitorConsoleForm? _form;
    private AgentStatus?        _lastStatus;

    public TrayApplication()
    {
        _menu = BuildContextMenu();
        _tray = BuildTrayIcon(_menu);

        // Poll service status every 30 s
        _pollTimer = new System.Windows.Forms.Timer { Interval = 30_000 };
        _pollTimer.Tick += (_, _) => SafeRefreshStatus();
        _pollTimer.Start();

        // Initial status after 500 ms (so the tray icon appears first)
        var init = new System.Windows.Forms.Timer { Interval = 500 };
        init.Tick += (_, _) =>
        {
            init.Stop();
            init.Dispose();
            SafeRefreshStatus();
            // Auto-open form if not activated on first launch
            if (_lastStatus is null || !_lastStatus.Activated)
                ShowStatusForm();
        };
        init.Start();
    }

    // ── Tray icon ─────────────────────────────────────────────────────────────

    private static NotifyIcon BuildTrayIcon(ContextMenuStrip menu)
    {
        var icon = new NotifyIcon
        {
            Text             = "STC Cloud Monitor",
            Icon             = Branding.MakeTrayIcon(Tokens.Ink500),
            ContextMenuStrip = menu,
            Visible          = true,
        };
        return icon;
    }

    private ContextMenuStrip BuildContextMenu()
    {
        var menu = new ContextMenuStrip { Font = new Font("Segoe UI", 9f) };

        var itemStatus = new ToolStripMenuItem("Ver Estado")
        {
            Font = new Font("Segoe UI", 9f, FontStyle.Bold)
        };
        itemStatus.Click += (_, _) => ShowStatusForm();

        var itemSync = new ToolStripMenuItem("Forzar Sincronizacion");
        itemSync.Click += (_, _) => ForceSync();

        var itemLogs = new ToolStripMenuItem("Abrir Logs Locales");
        itemLogs.Click += (_, _) => OpenLogs();

        // Texto inicial sin versión — se completa en RefreshStatus() con la
        // versión real que reporta el agente (bundle.js --status), la misma
        // fuente que usa la consola. Antes decía "v1.0" fijo en el código,
        // desactualizado desde hace rato (el agente va por 1.3.x).
        _itemAbout = new ToolStripMenuItem("Acerca de STC Cloud Monitor");
        _itemAbout.Click += (_, _) => ShowAbout();

        var itemExit = new ToolStripMenuItem("Salir");
        itemExit.Click += (_, _) => ExitApp();

        menu.Items.AddRange(
        [
            itemStatus,
            new ToolStripSeparator(),
            itemSync,
            itemLogs,
            _itemAbout,
            new ToolStripSeparator(),
            itemExit,
        ]);
        return menu;
    }

    // ── Status refresh ────────────────────────────────────────────────────────

    // Este poll corre solo, sin que el operador lo haya pedido: si algo falla
    // acá no corresponde interrumpirlo con un cartel (a diferencia de
    // "Forzar Sincronizacion" o los botones del formulario, donde el usuario
    // esta esperando una respuesta). Queda registrado igual, y hay un
    // `Application.ThreadException` global (`Program.cs`) como ultima red.
    private void SafeRefreshStatus()
    {
        try { RefreshStatus(); }
        catch (Exception ex) { AgentService.LogCrash("Poll", ex); }
    }

    private void RefreshStatus()
    {
        _lastStatus = AgentService.GetStatus();

        // Auto-start: si el agente ya esta activado pero el servicio esta detenido,
        // intentar iniciarlo automáticamente (funcionara si la aplicacion de bandeja corre elevada,
        // lo cual es el caso por defecto al iniciar post-instalacion o por la Tarea Programada de Inno Setup)
        if (_lastStatus != null && _lastStatus.Activated && _lastStatus.Service == "stopped")
        {
            try
            {
                AgentService.SetAutoStart();
                AgentService.StartService();
                _lastStatus = AgentService.GetStatus(); // Actualizar estado tras el arranque
            }
            catch { /* evitar excepciones silenciosas si no hay privilegios */ }
        }

        ApplyStatusToTray(_lastStatus);
        _form?.UpdateDisplay(_lastStatus);
        _itemAbout.Text = _lastStatus?.Version is string v ? $"Acerca de STC Cloud Monitor v{v}" : "Acerca de STC Cloud Monitor";
    }

    // Disco de estado sobre la marca (favicon.ico) — mismos colores de
    // severidad que ya usa el portal (Tokens.SeverityOk/Warning/Critical,
    // ver Branding.cs), no un semáforo saturado aparte para la bandeja.
    private void ApplyStatusToTray(AgentStatus? s)
    {
        if (s is null)
        {
            _tray.Icon = Branding.MakeTrayIcon(Tokens.SeverityCritical);
            _tray.Text = "STC Cloud Monitor — Agente no encontrado";
            return;
        }

        if (!s.Activated)
        {
            _tray.Icon = Branding.MakeTrayIcon(Tokens.Brand);
            _tray.Text = "STC Cloud Monitor — Pendiente de activacion";
        }
        else if (s.Service == "running")
        {
            _tray.Icon = Branding.MakeTrayIcon(Tokens.SeverityOk);
            _tray.Text = "STC Cloud Monitor — En ejecucion";
        }
        else if (s.Service is "stopped" or "not-installed")
        {
            _tray.Icon = Branding.MakeTrayIcon(Tokens.SeverityCritical);
            _tray.Text = $"STC Cloud Monitor — Servicio {s.Service}";
        }
        else
        {
            _tray.Icon = Branding.MakeTrayIcon(Tokens.SeverityCritical);
            _tray.Text = "STC Cloud Monitor — Error";
        }
    }

    // ── Context-menu actions ──────────────────────────────────────────────────

    private void ShowStatusForm()
    {
        if (_form is null || _form.IsDisposed)
        {
            _form = new MonitorConsoleForm();
            _form.FormClosed += (_, _) => _form = null;
        }
        _form.UpdateDisplay(_lastStatus);
        _form.Show();
        _form.BringToFront();
        _form.Activate();
    }

    private void ForceSync()
    {
        try
        {
            AgentService.ForceScan();
            _tray.ShowBalloonTip(3_000, "STC Cloud Monitor",
                "Sincronizacion forzada enviada. El agente la procesara en breve.",
                ToolTipIcon.Info);
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Error al enviar la senal de sincronizacion:\n{ex.Message}",
                "STC Cloud Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }
    private void OpenLogs()
    {
        // `agent.log` (bundle.js) y `monitor-ui.log` (excepciones no
        // manejadas de esta bandeja, ver Program.cs) — se abren los dos que
        // existan; si no existe ninguno, se avisa con la ruta esperada.
        var logPath = AgentService.GetLogPath();
        var crashLogPath = AgentService.GetCrashLogPath();
        var opened = false;
        foreach (var path in new[] { logPath, crashLogPath })
        {
            if (!File.Exists(path)) continue;
            opened = true;
            try {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(path) { UseShellExecute = true });
            } catch {
                System.Diagnostics.Process.Start("notepad.exe", path);
            }
        }
        if (!opened)
        {
            MessageBox.Show($"Archivo de log no encontrado:\n{logPath}",
                "STC Cloud Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }


    private void ShowAbout()
    {
        var exe = AgentService.FindAgentExe() ?? "(no encontrado)";
        var version = _lastStatus?.Version ?? "—";
        MessageBox.Show(
            $"STC Cloud Monitor  v{version}\n\n" +
            $"Agente de monitoreo de impresoras SNMP\n" +
            $"© STC Cloud — Todos los derechos reservados\n\n" +
            $"Agente: {exe}",
            "Acerca de STC Cloud Monitor",
            MessageBoxButtons.OK,
            MessageBoxIcon.Information);
    }

    private void ExitApp()
    {
        _tray.Visible = false;
        Application.Exit();
    }

    // ── Cleanup ───────────────────────────────────────────────────────────────

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _pollTimer.Dispose();
            _tray.Dispose();
            _menu.Dispose();
        }
        base.Dispose(disposing);
    }
}

using System;
using System.Drawing;
using System.Drawing.Drawing2D;
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
    private readonly System.Windows.Forms.Timer _pollTimer;

    private ActivationForm? _form;
    private AgentStatus?    _lastStatus;

    public TrayApplication()
    {
        _menu = BuildContextMenu();
        _tray = BuildTrayIcon(_menu);

        // Poll service status every 30 s
        _pollTimer = new System.Windows.Forms.Timer { Interval = 30_000 };
        _pollTimer.Tick += (_, _) => RefreshStatus();
        _pollTimer.Start();

        // Initial status after 500 ms (so the tray icon appears first)
        var init = new System.Windows.Forms.Timer { Interval = 500 };
        init.Tick += (_, _) =>
        {
            init.Stop();
            init.Dispose();
            RefreshStatus();
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
            Icon             = MakeCircleIcon(Color.Gray),
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

        var itemSync = new ToolStripMenuItem("Forzar Sincronización");
        itemSync.Click += (_, _) => ForceSync();

        var itemLogs = new ToolStripMenuItem("Abrir Logs");
        itemLogs.Click += (_, _) => OpenLogs();

        var itemAbout = new ToolStripMenuItem("Acerca de STC Monitor v1.0");
        itemAbout.Click += (_, _) => ShowAbout();

        var itemExit = new ToolStripMenuItem("Salir");
        itemExit.Click += (_, _) => ExitApp();

        menu.Items.AddRange(
        [
            itemStatus,
            new ToolStripSeparator(),
            itemSync,
            itemLogs,
            itemAbout,
            new ToolStripSeparator(),
            itemExit,
        ]);
        return menu;
    }

    // ── Status refresh ────────────────────────────────────────────────────────

    private void RefreshStatus()
    {
        _lastStatus = AgentService.GetStatus();
        ApplyStatusToTray(_lastStatus);
        _form?.UpdateDisplay(_lastStatus);
    }

    private void ApplyStatusToTray(AgentStatus? s)
    {
        if (s is null)
        {
            _tray.Icon = MakeCircleIcon(Color.Red);
            _tray.Text = "STC Cloud Monitor — Agente no encontrado";
            return;
        }

        if (!s.Activated)
        {
            _tray.Icon = MakeCircleIcon(Color.Orange);
            _tray.Text = "STC Cloud Monitor — Pendiente de activación";
        }
        else if (s.Service == "running")
        {
            _tray.Icon = MakeCircleIcon(Color.LimeGreen);
            _tray.Text = "STC Cloud Monitor — En ejecución";
        }
        else if (s.Service is "stopped" or "not-installed")
        {
            _tray.Icon = MakeCircleIcon(Color.OrangeRed);
            _tray.Text = $"STC Cloud Monitor — Servicio {s.Service}";
        }
        else
        {
            _tray.Icon = MakeCircleIcon(Color.Red);
            _tray.Text = "STC Cloud Monitor — Error";
        }
    }

    // ── Colored circle icon (created programmatically, no resource files) ─────

    internal static Icon MakeCircleIcon(Color color)
    {
        using var bmp = new Bitmap(16, 16, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(bmp))
        {
            g.Clear(Color.Transparent);
            g.SmoothingMode = SmoothingMode.AntiAlias;
            using var fill      = new SolidBrush(color);
            using var highlight = new SolidBrush(Color.FromArgb(100, 255, 255, 255));
            g.FillEllipse(fill, 1, 1, 14, 14);
            g.FillEllipse(highlight, 3, 2, 7, 6);   // 3D shine effect
        }
        var handle = bmp.GetHicon();
        return Icon.FromHandle(handle);
    }

    // ── Context-menu actions ──────────────────────────────────────────────────

    private void ShowStatusForm()
    {
        if (_form is null || _form.IsDisposed)
        {
            _form = new ActivationForm();
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
                "Sincronización forzada enviada. El agente la procesará en breve.",
                ToolTipIcon.Info);
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Error al enviar la señal de sincronización:\n{ex.Message}",
                "STC Cloud Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private void OpenLogs()
    {
        var logPath = AgentService.GetLogPath();
        if (!File.Exists(logPath))
        {
            MessageBox.Show($"Archivo de log no encontrado:\n{logPath}",
                "STC Cloud Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        System.Diagnostics.Process.Start("notepad.exe", logPath);
    }

    private void ShowAbout()
    {
        var exe = AgentService.FindAgentExe() ?? "(no encontrado)";
        MessageBox.Show(
            $"STC Cloud Monitor  v1.0\n\n" +
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

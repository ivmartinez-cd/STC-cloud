using System;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace STC.Monitor.UI;

internal sealed class ActivationForm : Form
{
    // ── Main Layout Controls ──────────────────────────────────────────────────
    private readonly Panel _leftPanel;
    private readonly TabControl _tabControl;
    private readonly TabPage _tabServiceInfo;
    private readonly TabPage _tabSettings;
    private readonly StatusStrip _statusStrip;
    private readonly ToolStripStatusLabel _statusLabel;

    // ── Service Information Tab ───────────────────────────────────────────────
    private readonly Label _valVersion;
    private readonly Label _valLicensedTo;
    private readonly Label _valDevices;
    private readonly Label _valExpiry;

    private readonly Label _iconServiceStatus;
    private readonly Label _lblServiceStatus;
    private readonly Label _iconStcStatus;
    private readonly Label _lblStcStatus;
    private readonly Label _iconPortalStatus;
    private readonly Label _lblPortalStatus;

    private readonly Label _valDevicesResponding;
    private readonly Button _btnRefresh;

    // ── Environment Settings Tab (Activation) ─────────────────────────────────
    private readonly TextBox _txtKey;
    private readonly TextBox _txtServer;
    private readonly Button _btnActivate;
    private readonly ProgressBar _progressBar;
    private readonly Label _lblActivationHint;


    private readonly Color _hpBlue = Color.FromArgb(0, 150, 214);
    private readonly Font _titleFont = new Font("Segoe UI", 12f, FontStyle.Bold);
    private readonly Font _normFont = new Font("Segoe UI", 9f);
    private readonly Font _boldFont = new Font("Segoe UI", 9f, FontStyle.Bold);

    public ActivationForm()
    {
        SuspendLayout();

        Text = "STC Cloud Monitor Console";
        ClientSize = new Size(800, 500);
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        Font = _normFont;
        BackColor = Color.White;

        // ── 1. Left Panel (Sidebar) ───────────────────────────────────────────
        _leftPanel = new Panel
        {
            Location = new Point(0, 0),
            Size = new Size(220, ClientSize.Height - 22),
            BackColor = Color.White,
            BorderStyle = BorderStyle.None
        };

        var blueBanner = new Panel
        {
            Location = new Point(10, 10),
            Size = new Size(200, 80),
            BackColor = Color.White
        };
        try
        {
            var asm = System.Reflection.Assembly.GetExecutingAssembly();
            using var stream = asm.GetManifestResourceStream("STC.Monitor.UI.logo.png");
            if (stream != null)
            {
                blueBanner.Controls.Add(new PictureBox
                {
                    Image = Image.FromStream(stream),
                    SizeMode = PictureBoxSizeMode.Zoom,
                    Location = new Point(10, 10),
                    Size = new Size(180, 60)
                });
            }
            using var iconStream = asm.GetManifestResourceStream("STC.Monitor.UI.favicon.ico");
            if (iconStream != null) this.Icon = new Icon(iconStream);
        }
        catch { }
        _leftPanel.Controls.Add(blueBanner);

        _leftPanel.Controls.Add(new Label
        {
            Text = "STC Cloud Monitor Console provee la habilidad de ver información de estado y modificar la configuración del agente.",
            Location = new Point(10, 100),
            Size = new Size(200, 80),
            Font = _normFont
        });

        _leftPanel.Controls.Add(new Label { Text = "Service Information", Font = _boldFont, Location = new Point(10, 190), AutoSize = true });
        _leftPanel.Controls.Add(new Label { Text = "Versión, licencia y estado operativo del sistema.", Location = new Point(10, 210), Size = new Size(200, 45) });

        _leftPanel.Controls.Add(new Label { Text = "Environment Settings", Font = _boldFont, Location = new Point(10, 265), AutoSize = true });
        _leftPanel.Controls.Add(new Label { Text = "Configuración del entorno para activar el acceso al Portal.", Location = new Point(10, 285), Size = new Size(200, 45) });


        Controls.Add(_leftPanel);

        // ── 2. Tab Control (Main Content) ─────────────────────────────────────
        _tabControl = new TabControl
        {
            Location = new Point(230, 10),
            Size = new Size(550, ClientSize.Height - 40),
            Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right
        };

        _tabServiceInfo = new TabPage("Service Information");
        _tabSettings = new TabPage("Environment Settings");

        _tabControl.TabPages.Add(_tabServiceInfo);
        _tabControl.TabPages.Add(_tabSettings);

        Controls.Add(_tabControl);

        // ── 3. Bottom Status Bar ──────────────────────────────────────────────
        _statusStrip = new StatusStrip { BackColor = Color.WhiteSmoke };
        _statusLabel = new ToolStripStatusLabel { Text = "Iniciando..." };
        _statusStrip.Items.Add(_statusLabel);
        Controls.Add(_statusStrip);

        // ====================================================================
        // TAB: Service Information
        // ====================================================================
        _tabServiceInfo.BackColor = Color.White;

        // GroupBox: Application Information
        var gbAppInfo = new GroupBox { Text = "Application Information", Location = new Point(10, 10), Size = new Size(520, 120), ForeColor = Color.Blue };
        int gY = 25;
        _valVersion = AddInfoRow(gbAppInfo, "Product version:", ref gY);
        _valLicensedTo = AddInfoRow(gbAppInfo, "Licensed to:", ref gY);
        _valDevices = AddInfoRow(gbAppInfo, "Number of devices:", ref gY);
        _valExpiry = AddInfoRow(gbAppInfo, "Licence expiry:", ref gY);
        _tabServiceInfo.Controls.Add(gbAppInfo);

        // GroupBox: Service Status
        var gbSvcStatus = new GroupBox { Text = "Service Status", Location = new Point(10, 140), Size = new Size(520, 110), ForeColor = Color.Blue };
        gY = 25;
        (_iconServiceStatus, _lblServiceStatus) = AddStatusRow(gbSvcStatus, "Service status:", ref gY);
        (_iconStcStatus, _lblStcStatus) = AddStatusRow(gbSvcStatus, "STC Monitor status:", ref gY);
        (_iconPortalStatus, _lblPortalStatus) = AddStatusRow(gbSvcStatus, "Connected to Portal server:", ref gY);
        _tabServiceInfo.Controls.Add(gbSvcStatus);

        var gbDiscStatus = new GroupBox { Text = "Discovery Status", Location = new Point(10, 260), Size = new Size(520, 90), ForeColor = Color.Blue };
        gY = 30;
        _valDevicesResponding = AddInfoRow(gbDiscStatus, "Devices responding / total:", ref gY);
        
        _btnRefresh = new Button { Text = "Refresh Status", Location = new Point(380, 50), Size = new Size(120, 30), ForeColor = Color.Black };
        _btnRefresh.Click += BtnRefresh_Click;
        gbDiscStatus.Controls.Add(_btnRefresh);

        var btnViewLogs = new Button { Text = "View Local Logs", Location = new Point(250, 50), Size = new Size(120, 30), ForeColor = Color.Black };
        btnViewLogs.Click += (s, e) => OpenLogs();
        gbDiscStatus.Controls.Add(btnViewLogs);

        _tabServiceInfo.Controls.Add(gbDiscStatus);

        // ====================================================================
        // TAB: Environment Settings (Activation)
        // ====================================================================
        _tabSettings.BackColor = Color.White;

        var lblConfigTitle = new Label { Text = "Configuración y Activación del Agente", Font = _titleFont, Location = new Point(20, 20), AutoSize = true, ForeColor = _hpBlue };
        _tabSettings.Controls.Add(lblConfigTitle);

        _lblActivationHint = new Label
        {
            Text = "Ingrese su Clave de Activación y URL del Portal para registrar este agente.",
            Location = new Point(20, 60),
            Size = new Size(500, 20)
        };
        _tabSettings.Controls.Add(_lblActivationHint);

        _tabSettings.Controls.Add(new Label { Text = "URL del Servidor:", Location = new Point(20, 103), Size = new Size(120, 20) });
        _txtServer = new TextBox { Location = new Point(150, 100), Size = new Size(300, 23), Text = "https://stc-cloud.onrender.com" };
        _tabSettings.Controls.Add(_txtServer);

        _tabSettings.Controls.Add(new Label { Text = "Clave Activación:", Location = new Point(20, 143), Size = new Size(120, 20) });
        _txtKey = new TextBox { Location = new Point(150, 140), Size = new Size(300, 23), Font = new Font("Consolas", 10f), PlaceholderText = "Ej: XXXX-XXXX-XXXX" };
        _tabSettings.Controls.Add(_txtKey);

        _btnActivate = new Button
        {
            Text = "Activar Agente",
            Location = new Point(150, 180),
            Size = new Size(150, 35),
            BackColor = _hpBlue,
            ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat,
            Font = _boldFont
        };
        _btnActivate.FlatAppearance.BorderSize = 0;
        _btnActivate.Click += BtnActivate_Click;
        _tabSettings.Controls.Add(_btnActivate);

        _progressBar = new ProgressBar { Location = new Point(20, 240), Size = new Size(500, 5), Style = ProgressBarStyle.Marquee, Visible = false };
        _tabSettings.Controls.Add(_progressBar);


        ResumeLayout(false);
    }

    // ── UI Helpers ────────────────────────────────────────────────────────────
    private Label AddInfoRow(Control parent, string label, ref int y)
    {
        parent.Controls.Add(new Label { Text = label, Location = new Point(100, y), Size = new Size(150, 20), TextAlign = ContentAlignment.TopRight, ForeColor = Color.Black });
        var val = new Label { Text = "—", Location = new Point(260, y), Size = new Size(250, 20), Font = _boldFont, ForeColor = Color.Black };
        parent.Controls.Add(val);
        y += 22;
        return val;
    }

    private (Label, Label) AddStatusRow(Control parent, string label, ref int y)
    {
        parent.Controls.Add(new Label { Text = label, Location = new Point(90, y), Size = new Size(165, 20), TextAlign = ContentAlignment.TopRight, ForeColor = Color.Black });
        
        var icon = new Label { Text = "●", Location = new Point(260, y), Size = new Size(25, 20), Font = new Font("Segoe UI", 10f, FontStyle.Bold) };
        var text = new Label { Text = "—", Location = new Point(290, y), Size = new Size(200, 20), Font = _boldFont, ForeColor = Color.Black };
        
        parent.Controls.Add(icon);
        parent.Controls.Add(text);
        y += 25;
        return (icon, text);
    }

    private void SetStatusIndicator(Label icon, Label text, bool ok, string msg)
    {
        text.Text = msg;
        if (ok)
        {
            icon.Text = "✔";
            icon.ForeColor = Color.MediumSeaGreen;
            text.ForeColor = Color.DarkGreen;
        }
        else
        {
            icon.Text = "✖";
            icon.ForeColor = Color.Crimson;
            text.ForeColor = Color.Red;
        }
    }


    // ── Public API ────────────────────────────────────────────────────────────
    public void UpdateDisplay(AgentStatus? s)
    {
        if (InvokeRequired) { Invoke(UpdateDisplay, s); return; }

        if (s is null)
        {
            _valVersion.Text = "—";
            _valLicensedTo.Text = "—";
            _valDevices.Text = "—";
            _valExpiry.Text = "—";
            _statusLabel.Text = "Connected to service database: No encontrado";

            SetStatusIndicator(_iconServiceStatus, _lblServiceStatus, false, "Not installed");
            SetStatusIndicator(_iconStcStatus, _lblStcStatus, false, "Disconnected");
            SetStatusIndicator(_iconPortalStatus, _lblPortalStatus, false, "Disconnected");

            _valDevicesResponding.Text = "0 / 0";
            return;
        }

        _statusLabel.Text = $"Connected to service directory: {s.DataDir ?? "—"}";

        _valVersion.Text = s.Version ?? "1.0.0";
        _valLicensedTo.Text = s.AgentId ?? "Sin Licencia";
        _valDevices.Text = s.Activated ? "Ilimitado" : "0";
        _valExpiry.Text = s.Activated ? "Ilimitada" : "Expirada";

        bool svcRunning = s.Service == "running";
        SetStatusIndicator(_iconServiceStatus, _lblServiceStatus, svcRunning, svcRunning ? "Running" : (s.Service ?? "Stopped"));
        SetStatusIndicator(_iconStcStatus, _lblStcStatus, svcRunning, svcRunning ? "Active" : "Inactive");
        SetStatusIndicator(_iconPortalStatus, _lblPortalStatus, s.Activated, s.Activated ? "Connected" : "Not Registered");

        _valDevicesResponding.Text = "Monitoreando (ver portal)";

        if (s.Activated)
        {
            _lblActivationHint.Text = "El agente ya se encuentra activado correctamente.";
            _txtKey.Enabled = false;
            _txtServer.Enabled = false;
            _btnActivate.Enabled = false;
            _btnActivate.Text = "Activado";
        }
        else
        {
            _lblActivationHint.Text = "Ingrese su Clave de Activación para comenzar.";
            _txtKey.Enabled = true;
            _txtServer.Enabled = true;
            _btnActivate.Enabled = true;
            _btnActivate.Text = "Activar Agente";
        }
        
    }

    private async void BtnRefresh_Click(object? sender, EventArgs e)
    {
        _btnRefresh.Enabled = false;
        _statusLabel.Text = "Refrescando estado...";
        var status = await AgentService.GetStatusAsync();
        UpdateDisplay(status);
        _btnRefresh.Enabled = true;
    }

    private async void BtnActivate_Click(object? sender, EventArgs e)
    {
        var key = _txtKey.Text.Trim();
        var server = _txtServer.Text.Trim();

        if (string.IsNullOrEmpty(key))
        {
            MessageBox.Show("Por favor ingrese la clave de activación.", "Activación", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        SetActivationUIBusy(true);
        try
        {
            _lblActivationHint.Text = "Conectando con el servidor de activación...";
            var (ok, error) = await AgentService.ActivateAsync(key, server);

            if (ok)
            {
                _lblActivationHint.Text = "Activado. Configurando servicio de Windows...";
                AgentService.SetAutoStart();
                
                _lblActivationHint.Text = "Iniciando servicio STC Cloud Monitor...";
                var (svcOk, svcError) = await AgentService.StartServiceAsync();

                if (!svcOk)
                {
                    _lblActivationHint.Text = "Esperando estabilización del servicio...";
                    // Verificación final: el servicio puede haberse iniciado justo después del timeout
                    await Task.Delay(3000);
                    var finalStatus = await AgentService.GetStatusAsync();
                    if (finalStatus?.Service == "running")
                        svcOk = true;
                }

                if (svcOk)
                {
                    _lblActivationHint.Text = "¡Agente listo!";
                    MessageBox.Show(
                        "¡Agente activado! Iniciando escaneo de dispositivos inmediato. Los resultados aparecerán en el portal en breve.",
                        "Éxito", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                else
                {
                    MessageBox.Show($"Activado, pero no se pudo iniciar servicio:\n{svcError}", "Advertencia", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }

                await Task.Delay(500);
                var s = await AgentService.GetStatusAsync();
                UpdateDisplay(s);
                _tabControl.SelectedTab = _tabServiceInfo; // Go back to main tab
            }
            else
            {
                MessageBox.Show($"La activación falló:\n{error}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Error: {ex.Message}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            SetActivationUIBusy(false);
        }
    }

    private void SetActivationUIBusy(bool busy)
    {
        _btnActivate.Enabled = !busy;
        _txtKey.Enabled = !busy;
        _txtServer.Enabled = !busy;
        _progressBar.Visible = busy;
        if (busy) _lblActivationHint.Text = "Verificando clave, por favor espere...";
    }

    private void OpenLogs()
    {
        var logPath = AgentService.GetLogPath();
        if (!File.Exists(logPath))
        {
            MessageBox.Show($"Archivo de log no encontrado:\n{logPath}", "STC Cloud Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        try {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(logPath) { UseShellExecute = true });
        } catch {
            System.Diagnostics.Process.Start("notepad.exe", logPath);
        }
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (e.CloseReason == CloseReason.UserClosing)
        {
            e.Cancel = true;
            Hide();
        }
        else
        {
            base.OnFormClosing(e);
        }
    }
}

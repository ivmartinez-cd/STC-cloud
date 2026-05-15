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
    private readonly TabPage _tabProxy;
    private readonly TabPage _tabSupport;
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

    // ── Proxy Tab ─────────────────────────────────────────────────────────────
    private readonly TextBox _txtProxyHost;
    private readonly TextBox _txtProxyPort;
    private readonly TextBox _txtProxyUser;
    private readonly TextBox _txtProxyPass;
    private readonly Label _lblProxyStatus;
    private readonly Button _btnSaveProxy;


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

        _leftPanel.Controls.Add(new Label { Text = "Network / Proxy", Font = _boldFont, Location = new Point(10, 340), AutoSize = true });
        _leftPanel.Controls.Add(new Label { Text = "Proxy HTTP para redes corporativas con acceso restringido.", Location = new Point(10, 360), Size = new Size(200, 45) });

        _leftPanel.Controls.Add(new Label { Text = "Remote Support", Font = _boldFont, Location = new Point(10, 415), AutoSize = true });
        _leftPanel.Controls.Add(new Label { Text = "Herramientas de diagnóstico y soporte técnico remoto.", Location = new Point(10, 435), Size = new Size(200, 45) });


        Controls.Add(_leftPanel);

        // ── 2. Tab Control (Main Content) ─────────────────────────────────────
        _tabControl = new TabControl
        {
            Location = new Point(230, 10),
            Size = new Size(550, ClientSize.Height - 40),
            Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right
        };

        _tabServiceInfo = new TabPage("Service Information");
        _tabSettings    = new TabPage("Environment Settings");
        _tabProxy       = new TabPage("Network / Proxy");
        _tabSupport     = new TabPage("Remote Support");

        _tabControl.TabPages.Add(_tabServiceInfo);
        _tabControl.TabPages.Add(_tabSettings);
        _tabControl.TabPages.Add(_tabProxy);
        _tabControl.TabPages.Add(_tabSupport);

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

        // ====================================================================
        // TAB: Network / Proxy
        // ====================================================================
        _tabProxy.BackColor = Color.White;

        _tabProxy.Controls.Add(new Label
        {
            Text = "Configuración de Proxy de Red",
            Font = _titleFont,
            Location = new Point(20, 20),
            AutoSize = true,
            ForeColor = _hpBlue
        });

        _tabProxy.Controls.Add(new Label
        {
            Text = "Configure un proxy HTTP/HTTPS para entornos corporativos con acceso a Internet restringido.",
            Location = new Point(20, 60),
            Size = new Size(500, 20)
        });

        var gbProxy = new GroupBox
        {
            Text = "Proxy HTTP",
            Location = new Point(20, 95),
            Size = new Size(510, 170),
            ForeColor = Color.Blue
        };

        gbProxy.Controls.Add(new Label { Text = "Servidor:", Location = new Point(15, 35), Size = new Size(70, 20), ForeColor = Color.Black });
        _txtProxyHost = new TextBox
        {
            Location = new Point(90, 32),
            Size = new Size(240, 23),
            PlaceholderText = "proxy.empresa.com"
        };
        gbProxy.Controls.Add(_txtProxyHost);

        gbProxy.Controls.Add(new Label { Text = "Puerto:", Location = new Point(340, 35), Size = new Size(55, 20), ForeColor = Color.Black });
        _txtProxyPort = new TextBox
        {
            Location = new Point(395, 32),
            Size = new Size(85, 23),
            PlaceholderText = "8080"
        };
        gbProxy.Controls.Add(_txtProxyPort);

        gbProxy.Controls.Add(new Label { Text = "Usuario:", Location = new Point(15, 75), Size = new Size(70, 20), ForeColor = Color.Black });
        _txtProxyUser = new TextBox
        {
            Location = new Point(90, 72),
            Size = new Size(150, 23)
        };
        gbProxy.Controls.Add(_txtProxyUser);

        gbProxy.Controls.Add(new Label { Text = "Contraseña:", Location = new Point(255, 75), Size = new Size(80, 20), ForeColor = Color.Black });
        _txtProxyPass = new TextBox
        {
            Location = new Point(330, 72),
            Size = new Size(150, 23),
            UseSystemPasswordChar = true
        };
        gbProxy.Controls.Add(_txtProxyPass);

        gbProxy.Controls.Add(new Label
        {
            Text = "Deje usuario y contraseña en blanco si el proxy no requiere autenticación.\nDeje todos los campos en blanco para quitar el proxy.",
            Location = new Point(15, 105),
            Size = new Size(465, 35),
            ForeColor = Color.Gray,
            Font = new Font("Segoe UI", 8f)
        });

        _lblProxyStatus = new Label
        {
            Text = "Estado: sin proxy configurado.",
            Location = new Point(15, 140),
            Size = new Size(370, 20),
            ForeColor = Color.Gray
        };
        gbProxy.Controls.Add(_lblProxyStatus);

        _btnSaveProxy = new Button
        {
            Text = "Guardar",
            Location = new Point(390, 135),
            Size = new Size(100, 30),
            BackColor = _hpBlue,
            ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat,
            Font = _boldFont
        };
        _btnSaveProxy.FlatAppearance.BorderSize = 0;
        _btnSaveProxy.Click += BtnSaveProxy_Click;
        gbProxy.Controls.Add(_btnSaveProxy);

        _tabProxy.Controls.Add(gbProxy);

        _tabProxy.Controls.Add(new Label
        {
            Text = "Nota: después de guardar, el servicio se reiniciará automáticamente para aplicar los cambios.",
            Location = new Point(20, 280),
            Size = new Size(500, 35),
            ForeColor = Color.Gray,
            Font = new Font("Segoe UI", 8f)
        });

        // ====================================================================
        // TAB: Remote Support
        // ====================================================================
        _tabSupport.BackColor = Color.White;

        _tabSupport.Controls.Add(new Label
        {
            Text = "Herramientas de Soporte Remoto",
            Font = _titleFont,
            Location = new Point(20, 20),
            AutoSize = true,
            ForeColor = Color.FromArgb(247, 147, 29) // STC Orange
        });

        var gbSupport = new GroupBox
        {
            Text = "Acciones de Diagnóstico",
            Location = new Point(20, 70),
            Size = new Size(510, 250),
            ForeColor = Color.Blue
        };

        // --- Botón RESCAN ---
        AddSupportTool(gbSupport, "🔄  RESCAN", "Solicitar escaneo inmediato de dispositivos SNMP.", 35, (s, e) => {
            AgentService.ForceScan();
            MessageBox.Show("Se ha enviado la señal de escaneo inmediato.\nEl agente procesará la red en unos segundos.", "STC Support", MessageBoxButtons.OK, MessageBoxIcon.Information);
        });

        // --- Botón PING ---
        AddSupportTool(gbSupport, "⚡  PING TEST", "Verificar latencia y conectividad con el Portal STC Cloud.", 100, async (s, e) => {
            _statusLabel.Text = "Ejecutando ping al servidor...";
            var (ok, msg) = await TestPingAsync();
            MessageBox.Show(msg, "Resultado de Conectividad", MessageBoxButtons.OK, ok ? MessageBoxIcon.Information : MessageBoxIcon.Error);
            _statusLabel.Text = "Ping completado.";
        });

        // --- Botón RESTART ---
        AddSupportTool(gbSupport, "🔥  REINICIAR", "Reiniciar el servicio de Windows STC Cloud Monitor.", 165, (s, e) => {
            if (MessageBox.Show("¿Está seguro de que desea reiniciar el servicio del agente?", "Confirmación", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
            {
                _statusLabel.Text = "Reiniciando servicio...";
                AgentService.RestartService();
                MessageBox.Show("El servicio se ha reiniciado correctamente.", "Éxito", MessageBoxButtons.OK, MessageBoxIcon.Information);
                _statusLabel.Text = "Servicio reiniciado.";
            }
        }, Color.Crimson);

        _tabSupport.Controls.Add(gbSupport);

        _tabSupport.Controls.Add(new Label
        {
            Text = "Estas herramientas permiten forzar acciones que normalmente el agente realiza de forma automática según su ciclo de escaneo (cada 15 min).",
            Location = new Point(20, 330),
            Size = new Size(500, 45),
            ForeColor = Color.Gray,
            Font = new Font("Segoe UI", 8f)
        });

        ResumeLayout(false);
    }

    // Helper para el botón de Soporte (con label)
    private void AddSupportTool(Control parent, string text, string hint, int y, EventHandler onClick, Color? fore = null)
    {
        var btn = new Button
        {
            Text = text,
            Location = new Point(20, y),
            Size = new Size(160, 45),
            Font = _boldFont,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.WhiteSmoke,
            ForeColor = fore ?? Color.Black
        };
        btn.FlatAppearance.BorderColor = Color.LightGray;
        btn.Click += onClick;

        var lbl = new Label
        {
            Text = hint,
            Location = new Point(190, y + 12),
            Size = new Size(300, 20),
            ForeColor = Color.DimGray
        };

        parent.Controls.Add(btn);
        parent.Controls.Add(lbl);
    }

    private async Task<(bool, string)> TestPingAsync()
    {
        try {
            var status = await AgentService.GetStatusAsync();
            var server = status?.ServerUrl ?? "stc-cloud.onrender.com";
            
            // Limpiar URL si tiene http/https
            var host = server.Replace("https://", "").Replace("http://", "").Split('/')[0].Split(':')[0];
            
            using var ping = new System.Net.NetworkInformation.Ping();
            var reply = await ping.SendPingAsync(host, 4000);
            
            if (reply.Status == System.Net.NetworkInformation.IPStatus.Success)
                return (true, $"✅ Conexión exitosa con {host}\nTiempo de respuesta: {reply.RoundtripTime}ms");
            else
                return (false, $"❌ Error de red: {reply.Status}\nEl servidor {host} no responde al ping.");
        }
        catch (Exception ex) {
            return (false, $"❌ Error al ejecutar ping: {ex.Message}");
        }
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

        // Sincronizar pestaña Proxy con el estado actual del agente
        if (!string.IsNullOrEmpty(s.ProxyUrl))
        {
            _lblProxyStatus.Text = $"Estado: proxy activo → {s.ProxyUrl}";
            _lblProxyStatus.ForeColor = Color.DarkGreen;
            try
            {
                var uri = new Uri(s.ProxyUrl);
                _txtProxyHost.Text = uri.Host;
                _txtProxyPort.Text = uri.Port > 0 ? uri.Port.ToString() : "";
                
                if (!string.IsNullOrEmpty(uri.UserInfo))
                {
                    var parts = uri.UserInfo.Split(':', 2);
                    _txtProxyUser.Text = parts[0];
                    if (parts.Length > 1) _txtProxyPass.Text = Uri.UnescapeDataString(parts[1]);
                }
                else
                {
                    _txtProxyUser.Text = "";
                    _txtProxyPass.Text = "";
                }
            }
            catch
            {
                // Si falla el parsing, dejamos lo que esté
            }
        }
        else
        {
            _txtProxyHost.Text = "";
            _txtProxyPort.Text = "";
            _txtProxyUser.Text = "";
            _txtProxyPass.Text = "";
            _lblProxyStatus.Text = "Estado: sin proxy configurado.";
            _lblProxyStatus.ForeColor = Color.Gray;
        }

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

    private async void BtnSaveProxy_Click(object? sender, EventArgs e)
    {
        _btnSaveProxy.Enabled = false;
        _lblProxyStatus.Text = "Guardando...";
        _lblProxyStatus.ForeColor = Color.Gray;

        try
        {
            string proxyUrl = "";
            var host = _txtProxyHost.Text.Trim();
            var port = _txtProxyPort.Text.Trim();
            
            if (!string.IsNullOrEmpty(host))
            {
                var user = Uri.EscapeDataString(_txtProxyUser.Text.Trim());
                var pass = Uri.EscapeDataString(_txtProxyPass.Text);
                
                string auth = (!string.IsNullOrEmpty(user) || !string.IsNullOrEmpty(pass)) ? $"{user}:{pass}@" : "";
                string portStr = !string.IsNullOrEmpty(port) ? $":{port}" : "";
                
                // Si el host ya empieza con http, no lo duplicamos
                if (!host.StartsWith("http://") && !host.StartsWith("https://"))
                {
                    proxyUrl = $"http://{auth}{host}{portStr}";
                }
                else
                {
                    // Si el usuario pegó la URL completa en el host (ej. http://proxy:80), usamos el UriBuilder
                    var ub = new UriBuilder(host);
                    if (!string.IsNullOrEmpty(port)) ub.Port = int.Parse(port);
                    if (!string.IsNullOrEmpty(user)) ub.UserName = user;
                    if (!string.IsNullOrEmpty(pass)) ub.Password = pass;
                    proxyUrl = ub.Uri.ToString();
                }
            }

            var (ok, error) = await AgentService.SetProxyAsync(proxyUrl);

            if (ok)
            {
                string displayUrl = proxyUrl;
                if (!string.IsNullOrEmpty(_txtProxyPass.Text))
                {
                    displayUrl = proxyUrl.Replace(Uri.EscapeDataString(_txtProxyPass.Text), "***");
                }

                _lblProxyStatus.Text = string.IsNullOrEmpty(proxyUrl)
                    ? "Estado: proxy eliminado correctamente."
                    : $"Estado: proxy configurado → {displayUrl}";
                _lblProxyStatus.ForeColor = Color.DarkGreen;

                // Reiniciar el servicio para que el agente cargue la nueva config
                AgentService.RestartService();
                _statusLabel.Text = "Proxy guardado. Servicio reiniciado.";
            }
            else
            {
                _lblProxyStatus.Text = $"Error: {error}";
                _lblProxyStatus.ForeColor = Color.Red;
            }
        }
        catch (Exception ex)
        {
            _lblProxyStatus.Text = $"Error: {ex.Message}";
            _lblProxyStatus.ForeColor = Color.Red;
        }
        finally
        {
            _btnSaveProxy.Enabled = true;
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

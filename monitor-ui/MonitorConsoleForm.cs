using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace STC.Monitor.UI;

// STC Cloud Monitor Console — rediseño del handoff "Monitor Console y
// Iconos.dc.html" (ver design_handoff_stc_monitor_ui/README.md), pero con los
// tokens REALES del portal web (Branding.cs / Tokens) en vez de la paleta y
// tipografía de la maqueta: así la consola de escritorio se ve como una
// extensión del portal, no como una pieza aparte. Reemplaza a la vieja
// ActivationForm (estilo WinForms azul genérico).
internal sealed class MonitorConsoleForm : Form
{
    private const int SidebarWidth = 260;
    private const int StatusBarHeight = 26;

    // ── Sidebar ────────────────────────────────────────────────────────────
    private readonly NavItem _navService;
    private readonly NavItem _navEnv;
    private readonly NavItem _navProxy;
    private readonly Label _agentDot;
    private readonly Label _agentStatusText;
    private readonly Label _agentVersionText;

    // ── Content panels ─────────────────────────────────────────────────────
    private readonly Panel _panelService;
    private readonly Panel _panelEnv;
    private readonly Panel _panelProxy;

    // ── Statusbar ──────────────────────────────────────────────────────────
    private readonly Label _statusPathLabel;
    private readonly Label _statusConnLabel;

    // ── Service Information ───────────────────────────────────────────────
    private readonly Card _cardService;
    private readonly Card _cardStcMonitor;
    private readonly Card _cardPortal;
    private readonly Label _valServiceStatus;
    private readonly Label _valStcStatus;
    private readonly Label _valPortalStatus;
    private readonly Label _valPortalSub;
    private readonly Label _valVersion;
    private readonly Label _valLicense;
    private readonly Label _valDevices;
    private readonly Label _valExpiry;
    private readonly Label _valDevicesResponding;
    private readonly Label _lnkViewPortal;
    private readonly Button _btnViewLogs;
    private readonly Button _btnRefresh;
    private readonly Button _btnStartService;

    // ── Environment Settings ──────────────────────────────────────────────
    private readonly Panel _activationBanner;
    private readonly Label _activationBannerText;
    private readonly TokenTextBox _txtServer;
    private readonly TokenTextBox _txtKey;
    private readonly Button _btnActivate;
    private readonly Button _btnTestConnection;
    private readonly Label _lblActivationHint;
    private readonly ProgressBar _progressBar;

    // ── Proxy ──────────────────────────────────────────────────────────────
    private readonly Label _lblProxyStatus;
    private readonly TokenTextBox _txtProxyHost;
    private readonly TokenTextBox _txtProxyPort;
    private readonly TokenTextBox _txtProxyUser;
    private readonly TokenTextBox _txtProxyPass;
    private readonly Button _btnSaveProxy;

    private string? _serverUrl;

    public MonitorConsoleForm()
    {
        SuspendLayout();

        Text = "STC Cloud Monitor Console";
        ClientSize = new Size(1150, 740);
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        BackColor = Tokens.SurfacePage;
        Font = Branding.Body;

        var icon = Branding.LoadEmbeddedIcon("favicon.ico");
        if (icon != null) Icon = icon;

        // ── Sidebar ────────────────────────────────────────────────────────
        var sidebar = new Panel
        {
            Location = new Point(0, 0),
            Size = new Size(SidebarWidth, ClientSize.Height - StatusBarHeight),
            BackColor = Tokens.Ink900,
        };
        Controls.Add(sidebar);

        var logoImg = Branding.LoadEmbeddedImage("logo1.png"); // wordmark blanco — mismo que SidebarBrand.tsx sobre fondo oscuro
        if (logoImg != null)
        {
            sidebar.Controls.Add(new PictureBox
            {
                Image = logoImg,
                SizeMode = PictureBoxSizeMode.Zoom,
                Location = new Point(18, 18),
                Size = new Size(141, 30),
                BackColor = Color.Transparent,
            });
        }
        sidebar.Controls.Add(new Label
        {
            Text = Branding.Track("STC CLOUD", " "),
            Font = Branding.BrandTag,
            ForeColor = Tokens.Brand,
            AutoSize = true,
            Location = new Point(21, 55),
            BackColor = Color.Transparent,
        });
        sidebar.Controls.Add(new Panel { Location = new Point(0, 84), Size = new Size(SidebarWidth, 1), BackColor = Tokens.PanelDarkLine });

        sidebar.Controls.Add(new Label
        {
            Text = "Consola local del agente: consulta el estado del servicio y modifica su configuración sin salir del equipo.",
            Font = Branding.SidebarDesc,
            ForeColor = Tokens.PanelDarkText,
            AutoSize = false,
            Location = new Point(18, 100),
            Size = new Size(224, 58),
            BackColor = Color.Transparent,
        });

        sidebar.Controls.Add(new Label
        {
            Text = Branding.Track("SECCIONES", " "),
            Font = Branding.NavGroup,
            ForeColor = Tokens.PanelDarkLabel,
            AutoSize = true,
            Location = new Point(18, 172),
            BackColor = Color.Transparent,
        });

        _navService = new NavItem("Estado del servicio", "Versión, licencia y actividad");
        _navEnv     = new NavItem("Entorno y activación", "Acceso al portal");
        _navProxy   = new NavItem("Red / Proxy", "Proxy HTTP corporativo");
        _navService.Location = new Point(0, 194); _navService.Size = new Size(SidebarWidth, 58);
        _navEnv.Location     = new Point(0, 252); _navEnv.Size     = new Size(SidebarWidth, 58);
        _navProxy.Location   = new Point(0, 310); _navProxy.Size   = new Size(SidebarWidth, 58);
        sidebar.Controls.Add(_navService);
        sidebar.Controls.Add(_navEnv);
        sidebar.Controls.Add(_navProxy);
        _navService.Activated += (_, _) => SelectSection(0);
        _navEnv.Activated     += (_, _) => SelectSection(1);
        _navProxy.Activated   += (_, _) => SelectSection(2);

        // Pie del sidebar — estado del agente
        int footerY = sidebar.Height - 74;
        sidebar.Controls.Add(new Label
        {
            Text = Branding.Track("AGENTE", " "),
            Font = Branding.NavGroup,
            ForeColor = Tokens.PanelDarkLabel,
            AutoSize = true,
            Location = new Point(18, footerY),
            Anchor = AnchorStyles.Bottom | AnchorStyles.Left,
            BackColor = Color.Transparent,
        });
        _agentDot = new Label
        {
            Text = "●",
            Font = new Font("Segoe UI", 8f),
            ForeColor = Tokens.Ink500,
            AutoSize = true,
            Location = new Point(18, footerY + 18),
            Anchor = AnchorStyles.Bottom | AnchorStyles.Left,
            BackColor = Color.Transparent,
        };
        _agentStatusText = new Label
        {
            Text = "—",
            Font = Branding.Body,
            ForeColor = Tokens.PanelDarkItem,
            AutoSize = true,
            Location = new Point(32, footerY + 16),
            Anchor = AnchorStyles.Bottom | AnchorStyles.Left,
            BackColor = Color.Transparent,
        };
        _agentVersionText = new Label
        {
            Text = "—",
            Font = Branding.StatusBarMono,
            ForeColor = Tokens.PanelDarkText,
            AutoSize = true,
            Location = new Point(18, footerY + 38),
            Anchor = AnchorStyles.Bottom | AnchorStyles.Left,
            BackColor = Color.Transparent,
        };
        sidebar.Controls.Add(_agentDot);
        sidebar.Controls.Add(_agentStatusText);
        sidebar.Controls.Add(_agentVersionText);

        // ── Content area ───────────────────────────────────────────────────
        // Sin tab strip arriba: quedaba duplicando la navegación del sidebar
        // (mismas 3 secciones, mismo estado) — Iván lo sacó después de ver la
        // consola corriendo.
        var contentArea = new Panel
        {
            Location = new Point(SidebarWidth, 0),
            Size = new Size(ClientSize.Width - SidebarWidth, ClientSize.Height - StatusBarHeight),
            BackColor = Tokens.SurfacePage,
        };
        Controls.Add(contentArea);

        _panelService = new Panel { Dock = DockStyle.Fill, BackColor = Tokens.SurfacePage, AutoScroll = true };
        _panelEnv     = new Panel { Dock = DockStyle.Fill, BackColor = Tokens.SurfacePage, AutoScroll = true, Visible = false };
        _panelProxy   = new Panel { Dock = DockStyle.Fill, BackColor = Tokens.SurfacePage, AutoScroll = true, Visible = false };
        contentArea.Controls.Add(_panelProxy);
        contentArea.Controls.Add(_panelEnv);
        contentArea.Controls.Add(_panelService);

        // ── Statusbar ──────────────────────────────────────────────────────
        var statusBar = new Panel
        {
            Location = new Point(0, ClientSize.Height - StatusBarHeight),
            Size = new Size(ClientSize.Width, StatusBarHeight),
            BackColor = Tokens.Surface,
            Anchor = AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right,
        };
        statusBar.Controls.Add(new Panel { Location = new Point(0, 0), Size = new Size(ClientSize.Width, 1), Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right, BackColor = Tokens.Border });
        _statusPathLabel = new Label { Text = "Iniciando...", Font = Branding.StatusBarMono, ForeColor = Tokens.Ink500, AutoSize = true, Location = new Point(14, 6) };
        _statusConnLabel = new Label { Text = "● DESCONECTADO", Font = Branding.Micro, ForeColor = Tokens.SeverityCritical, AutoSize = true, Location = new Point(ClientSize.Width - 220, 6), Anchor = AnchorStyles.Top | AnchorStyles.Right };
        statusBar.Controls.Add(_statusPathLabel);
        statusBar.Controls.Add(_statusConnLabel);
        Controls.Add(statusBar);

        // ════════════════════════════════════════════════════════════════
        // Panel 1 — Service Information
        // ════════════════════════════════════════════════════════════════
        AddSectionLabel(_panelService, "ESTADO OPERATIVO DEL AGENTE LOCAL", 16);

        const int cardW = 275, cardGap = 12;
        _cardService    = new Card { Location = new Point(20, 44), Size = new Size(cardW, 92) };
        _cardStcMonitor = new Card { Location = new Point(20 + cardW + cardGap, 44), Size = new Size(cardW, 92) };
        _cardPortal     = new Card { Location = new Point(20 + 2 * (cardW + cardGap), 44), Size = new Size(cardW, 92) };
        _valServiceStatus = BuildStatusCard(_cardService, "SERVICIO");
        _valStcStatus      = BuildStatusCard(_cardStcMonitor, "STC MONITOR");
        _valPortalStatus   = BuildStatusCard(_cardPortal, "PORTAL");
        _valPortalSub = (Label)_cardPortal.Controls[2];
        _panelService.Controls.Add(_cardService);
        _panelService.Controls.Add(_cardStcMonitor);
        _panelService.Controls.Add(_cardPortal);

        var cardAppInfo = new Card { Location = new Point(20, 150), Size = new Size(850, 168) };
        AddCardHeader(cardAppInfo, "INFORMACIÓN DE LA APLICACIÓN");
        int rowY = 44;
        _valVersion = AddInfoRow(cardAppInfo, "VERSIÓN DEL PRODUCTO", ref rowY, mono: true);
        _valLicense = AddInfoRow(cardAppInfo, "LICENCIA", ref rowY, mono: true);
        _valDevices = AddInfoRow(cardAppInfo, "NÚMERO DE DISPOSITIVOS", ref rowY);
        _valExpiry  = AddInfoRow(cardAppInfo, "CADUCIDAD DE LA LICENCIA", ref rowY);
        _panelService.Controls.Add(cardAppInfo);

        var cardDevices = new Card { Location = new Point(20, 332), Size = new Size(850, 152) };
        AddCardHeader(cardDevices, "DISPOSITIVOS RESPONDIENDO / TOTAL");
        _valDevicesResponding = new Label { Text = "—", Font = Branding.StatusValue, ForeColor = Tokens.Ink900, AutoSize = true, Location = new Point(16, 40) };
        _lnkViewPortal = new Label { Text = "VER EN EL PORTAL →", Font = Branding.BodyBold, ForeColor = Tokens.Brand, AutoSize = true, Location = new Point(16, 78), Cursor = Cursors.Hand };
        _lnkViewPortal.Click += (_, _) => OpenServerUrl();
        cardDevices.Controls.Add(_valDevicesResponding);
        cardDevices.Controls.Add(_lnkViewPortal);

        // Fila de acciones, debajo del KPI (una fila sola con las 3 no entraba
        // a lo ancho de la tarjeta). "Iniciar servicio" va primero y sólo se
        // ve cuando corresponde (activado + servicio detenido); "Ver logs
        // locales" y "Actualizar estado" reservan su posición a partir del
        // ancho real de los botones anteriores para no superponerse nunca.
        const int actionsY = 108;
        _btnStartService = Buttons.New("Iniciar servicio", ButtonKind.Outline);
        _btnStartService.Location = new Point(16, actionsY);
        _btnStartService.Visible = false;
        _btnStartService.Click += BtnStartService_Click;
        _btnViewLogs = Buttons.New("Ver logs locales", ButtonKind.Outline);
        _btnViewLogs.Location = new Point(16 + _btnStartService.Width + 10, actionsY);
        _btnViewLogs.Click += (_, _) => OpenLogs();
        _btnRefresh = Buttons.New("Actualizar estado", ButtonKind.Primary);
        _btnRefresh.Location = new Point(_btnViewLogs.Left + _btnViewLogs.Width + 10, actionsY);
        _btnRefresh.Click += BtnRefresh_Click;
        cardDevices.Controls.Add(_btnViewLogs);
        cardDevices.Controls.Add(_btnRefresh);
        cardDevices.Controls.Add(_btnStartService);
        _panelService.Controls.Add(cardDevices);

        // ════════════════════════════════════════════════════════════════
        // Panel 2 — Environment Settings
        // ════════════════════════════════════════════════════════════════
        AddSectionLabel(_panelEnv, "CONFIGURACIÓN Y ACTIVACIÓN DEL AGENTE", 16);

        _activationBanner = new Panel { Location = new Point(20, 46), Size = new Size(850, 40), BackColor = Tokens.SuccessBg };
        _activationBanner.Paint += (_, e) => { using var p = new Pen(Tokens.SuccessBorder); e.Graphics.DrawRectangle(p, 0, 0, _activationBanner.Width - 1, _activationBanner.Height - 1); };
        var bannerDot = new Label { Text = "●", ForeColor = Tokens.SuccessDot, Font = new Font("Segoe UI", 9f), AutoSize = true, Location = new Point(14, 11) };
        _activationBannerText = new Label { Text = "El agente ya se encuentra activado correctamente.", Font = Branding.BodyBold, ForeColor = Tokens.Ink900, AutoSize = true, Location = new Point(32, 11) };
        _activationBanner.Controls.Add(bannerDot);
        _activationBanner.Controls.Add(_activationBannerText);
        _panelEnv.Controls.Add(_activationBanner);

        var cardEnv = new Card { Location = new Point(20, 100), Size = new Size(850, 116) };
        _txtServer = AddInputRow(cardEnv, "URL DEL SERVIDOR", 20, 24, 190, 620);
        _txtServer.Input.Text = "http://localhost:3000";
        _txtKey = AddInputRow(cardEnv, "CLAVE DE ACTIVACIÓN", 20, 68, 190, 620, mono: true);
        Placeholder.Attach(_txtKey.Input, "XXXX-XXXX-XXXX");
        _panelEnv.Controls.Add(cardEnv);

        _btnActivate = Buttons.New("Activar agente", ButtonKind.Primary);
        _btnActivate.Location = new Point(20, 232);
        _btnActivate.Click += BtnActivate_Click;
        _btnTestConnection = Buttons.New("Probar conexión", ButtonKind.Outline);
        _btnTestConnection.Location = new Point(20 + _btnActivate.Width + 10, 232);
        _btnTestConnection.Click += BtnTestConnection_Click;
        _lblActivationHint = new Label { Text = "Ingrese su clave de activación para comenzar.", Font = Branding.Body, ForeColor = Tokens.Ink300, AutoSize = true, Location = new Point(20 + _btnActivate.Width + _btnTestConnection.Width + 32, 246) };
        _progressBar = new ProgressBar { Location = new Point(20, 276), Size = new Size(500, 4), Style = ProgressBarStyle.Marquee, Visible = false };
        _panelEnv.Controls.Add(_btnActivate);
        _panelEnv.Controls.Add(_btnTestConnection);
        _panelEnv.Controls.Add(_lblActivationHint);
        _panelEnv.Controls.Add(_progressBar);

        // ════════════════════════════════════════════════════════════════
        // Panel 3 — Network / Proxy
        // ════════════════════════════════════════════════════════════════
        AddSectionLabel(_panelProxy, "CONFIGURACIÓN DE PROXY DE RED", 16);
        _panelProxy.Controls.Add(new Label
        {
            Text = "Configuración de un proxy HTTP/HTTPS para entornos corporativos con acceso restringido a Internet.",
            Font = Branding.Body, ForeColor = Tokens.Ink600, AutoSize = true, Location = new Point(20, 40),
        });

        var cardProxy = new Card { Location = new Point(20, 74), Size = new Size(850, 210) };
        AddCardHeader(cardProxy, "PROXY HTTP");
        _lblProxyStatus = new Label { Text = Branding.Track("● SIN PROXY CONFIGURADO", " "), Font = Branding.Micro, ForeColor = Tokens.Ink400, AutoSize = true, Location = new Point(cardProxy.Width - 230, 16) };
        cardProxy.Controls.Add(_lblProxyStatus);

        _txtProxyHost = AddInputRow(cardProxy, "SERVIDOR", 16, 52, 90, 340);
        Placeholder.Attach(_txtProxyHost.Input, "proxy.empresa.com");
        _txtProxyPort = AddInputRow(cardProxy, "PUERTO", 470, 52, 65, 130);
        Placeholder.Attach(_txtProxyPort.Input, "8080");

        _txtProxyUser = AddInputRow(cardProxy, "USUARIO", 16, 96, 90, 340);
        _txtProxyPass = AddInputRow(cardProxy, "CONTRASEÑA", 470, 96, 100, 130);
        _txtProxyPass.Input.UseSystemPasswordChar = true;

        cardProxy.Controls.Add(new Label
        {
            Text = "Deje usuario y contraseña en blanco si el proxy no requiere autenticación.\nDeje todos los campos en blanco para quitar el proxy.",
            Font = new Font("Segoe UI", 8f), ForeColor = Tokens.Ink300, AutoSize = false, Location = new Point(16, 148), Size = new Size(500, 34),
        });

        _btnSaveProxy = Buttons.New("Guardar", ButtonKind.Primary);
        _btnSaveProxy.Location = new Point(cardProxy.Width - _btnSaveProxy.Width - 16, 150);
        _btnSaveProxy.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        _btnSaveProxy.Click += BtnSaveProxy_Click;
        cardProxy.Controls.Add(_btnSaveProxy);
        _panelProxy.Controls.Add(cardProxy);

        _panelProxy.Controls.Add(new Label
        {
            Text = "Nota: después de guardar, el servicio se reiniciará automáticamente para aplicar los cambios.",
            Font = new Font("Segoe UI", 8f), ForeColor = Tokens.Ink300, AutoSize = true, Location = new Point(20, 296),
        });

        SelectSection(0);
        ResumeLayout(false);
    }

    // ── Layout helpers ────────────────────────────────────────────────────

    private static void AddSectionLabel(Control parent, string text, int y)
    {
        parent.Controls.Add(new Panel { Location = new Point(20, y + 8), Size = new Size(26, 2), BackColor = Tokens.Brand });
        parent.Controls.Add(new Label
        {
            Text = Branding.Track(text, " "),
            Font = Branding.Micro,
            ForeColor = Tokens.Ink400,
            AutoSize = true,
            Location = new Point(56, y),
        });
    }

    private static void AddCardHeader(Control card, string text)
    {
        card.Controls.Add(new Label
        {
            Text = Branding.Track(text, " "),
            Font = Branding.Micro,
            ForeColor = Tokens.Ink400,
            AutoSize = true,
            Location = new Point(16, 14),
        });
    }

    // Tarjeta de estado (SERVICIO / STC MONITOR / PORTAL): micro-label + valor grande + sub-línea.
    private static Label BuildStatusCard(Card card, string label)
    {
        card.Controls.Add(new Label { Text = Branding.Track(label, " "), Font = Branding.Micro, ForeColor = Tokens.Ink400, AutoSize = true, Location = new Point(14, 12) });
        var val = new Label { Text = "—", Font = Branding.StatusValue, ForeColor = Tokens.Ink500, AutoSize = true, Location = new Point(13, 30) };
        var sub = new Label { Text = "—", Font = Branding.Body, ForeColor = Tokens.Ink400, AutoSize = true, Location = new Point(14, 62) };
        card.Controls.Add(val);
        card.Controls.Add(sub);
        return val;
    }

    // Fila "etiqueta / valor" con separador — para tarjetas de información.
    private Label AddInfoRow(Control parent, string label, ref int y, bool mono = false)
    {
        parent.Controls.Add(new Label
        {
            Text = Branding.Track(label, " "),
            Font = Branding.Micro,
            ForeColor = Tokens.Ink300,
            AutoSize = false,
            TextAlign = ContentAlignment.MiddleLeft,
            Location = new Point(16, y),
            Size = new Size(300, 18),
        });
        var val = new Label
        {
            Text = "—",
            Font = mono ? Branding.BodyMono : Branding.Body,
            ForeColor = Tokens.Ink900,
            AutoSize = false,
            TextAlign = ContentAlignment.MiddleRight,
            Location = new Point(400, y - 2),
            Size = new Size(434, 20),
            Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right,
        };
        parent.Controls.Add(val);
        parent.Controls.Add(new Panel { Location = new Point(16, y + 22), Size = new Size(818, 1), Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right, BackColor = Tokens.BorderSoft });
        y += 30;
        return val;
    }

    // Fila "etiqueta encima / input" — para las 3 pestañas con formularios.
    private TokenTextBox AddInputRow(Control parent, string label, int x, int y, int labelWidth, int inputWidth, bool mono = false)
    {
        parent.Controls.Add(new Label
        {
            Text = Branding.Track(label, " "),
            Font = Branding.Micro,
            ForeColor = Tokens.Ink300,
            AutoSize = false,
            TextAlign = ContentAlignment.MiddleLeft,
            Location = new Point(x, y + 9),
            Size = new Size(labelWidth, 18),
        });
        var box = new TokenTextBox(mono) { Location = new Point(x + labelWidth, y), Size = new Size(inputWidth, 38) };
        parent.Controls.Add(box);
        return box;
    }

    private void SelectSection(int index)
    {
        _navService.Active = index == 0;
        _navEnv.Active = index == 1;
        _navProxy.Active = index == 2;
        _panelService.Visible = index == 0;
        _panelEnv.Visible = index == 1;
        _panelProxy.Visible = index == 2;
    }

    private void SetStatusValue(Label label, bool ok, string text)
    {
        label.Text = text;
        label.ForeColor = ok ? Tokens.SeverityOk : Tokens.SeverityCritical;
    }

    private void OpenServerUrl()
    {
        if (string.IsNullOrWhiteSpace(_serverUrl)) return;
        try { Process.Start(new ProcessStartInfo(_serverUrl) { UseShellExecute = true }); }
        catch (Exception ex) { AgentService.LogCrash("OpenServerUrl", ex); }
    }

    // ── Public API ────────────────────────────────────────────────────────

    public void UpdateDisplay(AgentStatus? s)
    {
        if (InvokeRequired) { Invoke(UpdateDisplay, s); return; }

        _serverUrl = s?.ServerUrl;

        if (s is null)
        {
            _cardService.TopAccent = Tokens.SeverityCritical;
            _cardStcMonitor.TopAccent = Tokens.SeverityCritical;
            _cardPortal.TopAccent = Tokens.SeverityCritical;
            SetStatusValue(_valServiceStatus, false, "Not installed");
            SetStatusValue(_valStcStatus, false, "Disconnected");
            SetStatusValue(_valPortalStatus, false, "Disconnected");
            _valPortalSub.Text = "—";

            _valVersion.Text = "—";
            _valLicense.Text = "—";
            _valDevices.Text = "—";
            _valExpiry.Text = "—";
            _valDevicesResponding.Text = "0 / 0";

            _statusPathLabel.Text = "Directorio del servicio: no encontrado";
            _statusConnLabel.Text = Branding.Track("● DESCONECTADO", " ");
            _statusConnLabel.ForeColor = Tokens.SeverityCritical;

            _agentDot.ForeColor = Tokens.SeverityCritical;
            _agentStatusText.Text = "Agente no encontrado";
            _agentVersionText.Text = "—";
            return;
        }

        _statusPathLabel.Text = $"Directorio del servicio: {s.DataDir ?? "—"}";

        _valVersion.Text = s.Version ?? "1.0.0";
        _valLicense.Text = s.AgentId ?? "Sin licencia";
        _valDevices.Text = s.Activated ? "Ilimitado" : "0";
        _valExpiry.Text = s.Activated ? "Ilimitada" : "Expirada";

        bool svcRunning = s.Service == "running";
        // "SERVICIO" y "STC MONITOR" leen la misma señal real (el servicio de
        // Windows) — el handoff los muestra como dos tarjetas separadas, pero
        // acá sólo hay un dato de verdad detrás de ambas.
        SetStatusValue(_valServiceStatus, svcRunning, svcRunning ? "Running" : (s.Service ?? "Stopped"));
        SetStatusValue(_valStcStatus, svcRunning, svcRunning ? "Active" : "Inactive");
        SetStatusValue(_valPortalStatus, s.Activated, s.Activated ? "Connected" : "Not registered");
        _valPortalSub.Text = s.ServerUrl ?? "—";
        _cardService.TopAccent = svcRunning ? Tokens.SeverityOk : Tokens.SeverityCritical;
        _cardStcMonitor.TopAccent = svcRunning ? Tokens.SeverityOk : Tokens.SeverityCritical;
        _cardPortal.TopAccent = s.Activated ? Tokens.SeverityOk : Tokens.Brand;
        _cardService.Invalidate(); _cardStcMonitor.Invalidate(); _cardPortal.Invalidate();

        _valDevicesResponding.Text = "Monitoreando (ver portal)";
        _btnStartService.Visible = !svcRunning && s.Activated;

        _statusConnLabel.Text = Branding.Track(s.Activated ? "● CONECTADO" : "● SIN ACTIVAR", " ");
        _statusConnLabel.ForeColor = s.Activated ? Tokens.SeverityOk : Tokens.Ink400;

        _agentDot.ForeColor = svcRunning ? Tokens.SeverityOk : Tokens.SeverityCritical;
        _agentStatusText.Text = svcRunning ? "En ejecución" : (s.Service ?? "Detenido");
        _agentVersionText.Text = s.Version is null ? "—" : $"v{s.Version} · stable";

        // Pestaña Proxy
        if (!string.IsNullOrEmpty(s.ProxyUrl))
        {
            _lblProxyStatus.Text = Branding.Track("● PROXY ACTIVO", " ");
            _lblProxyStatus.ForeColor = Tokens.SeverityOk;
            try
            {
                var uri = new Uri(s.ProxyUrl);
                _txtProxyHost.Input.Text = uri.Host;
                _txtProxyHost.Input.ForeColor = Tokens.Ink900;
                _txtProxyPort.Input.Text = uri.Port > 0 ? uri.Port.ToString() : "";
                _txtProxyPort.Input.ForeColor = Tokens.Ink900;

                if (!string.IsNullOrEmpty(uri.UserInfo))
                {
                    var parts = uri.UserInfo.Split(new[] { ':' }, 2);
                    _txtProxyUser.Input.Text = parts[0];
                    if (parts.Length > 1) _txtProxyPass.Input.Text = Uri.UnescapeDataString(parts[1]);
                }
                else
                {
                    _txtProxyUser.Input.Text = "";
                    _txtProxyPass.Input.Text = "";
                }
            }
            catch { /* si falla el parsing, dejamos lo que esté cargado */ }
        }
        else
        {
            Placeholder.Reset(_txtProxyHost.Input);
            Placeholder.Reset(_txtProxyPort.Input);
            _txtProxyUser.Input.Text = "";
            _txtProxyPass.Input.Text = "";
            _lblProxyStatus.Text = Branding.Track("● SIN PROXY CONFIGURADO", " ");
            _lblProxyStatus.ForeColor = Tokens.Ink400;
        }

        // Pestaña Entorno / Activación
        _activationBanner.Visible = s.Activated;
        _txtKey.Input.Enabled = !s.Activated;
        _txtServer.Input.Enabled = !s.Activated;
        _btnActivate.Text = Branding.Track((s.Activated ? "Reactivar agente" : "Activar agente").ToUpperInvariant(), " ");
        _lblActivationHint.Text = s.Activated
            ? "El agente ya se encuentra activado."
            : "Ingrese su clave de activación para comenzar.";
    }

    // ── Acciones ──────────────────────────────────────────────────────────

    private async void BtnSaveProxy_Click(object? sender, EventArgs e)
    {
        _btnSaveProxy.Enabled = false;
        _lblProxyStatus.Text = Branding.Track("GUARDANDO...", " ");
        _lblProxyStatus.ForeColor = Tokens.Ink400;

        try
        {
            string proxyUrl = "";
            var host = Placeholder.GetValue(_txtProxyHost.Input).Trim();
            var port = Placeholder.GetValue(_txtProxyPort.Input).Trim();

            if (!string.IsNullOrEmpty(host))
            {
                var user = Uri.EscapeDataString(_txtProxyUser.Input.Text.Trim());
                var pass = Uri.EscapeDataString(_txtProxyPass.Input.Text);

                string auth = (!string.IsNullOrEmpty(user) || !string.IsNullOrEmpty(pass)) ? $"{user}:{pass}@" : "";
                string portStr = !string.IsNullOrEmpty(port) ? $":{port}" : "";

                if (!host.StartsWith("http://") && !host.StartsWith("https://"))
                {
                    proxyUrl = $"http://{auth}{host}{portStr}";
                }
                else
                {
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
                _lblProxyStatus.Text = Branding.Track(string.IsNullOrEmpty(proxyUrl) ? "● PROXY ELIMINADO" : "● PROXY GUARDADO", " ");
                _lblProxyStatus.ForeColor = Tokens.SeverityOk;
                AgentService.RestartService();
                _statusPathLabel.Text = "Proxy guardado. Servicio reiniciado.";
            }
            else
            {
                _lblProxyStatus.Text = Branding.Track("● ERROR", " ");
                _lblProxyStatus.ForeColor = Tokens.SeverityCritical;
                MessageBox.Show($"No se pudo guardar el proxy:\n{error}", "STC Cloud Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
        catch (Exception ex)
        {
            AgentService.LogCrash("BtnSaveProxy", ex);
            _lblProxyStatus.Text = Branding.Track("● ERROR", " ");
            _lblProxyStatus.ForeColor = Tokens.SeverityCritical;
        }
        finally
        {
            _btnSaveProxy.Enabled = true;
        }
    }

    private async void BtnRefresh_Click(object? sender, EventArgs e)
    {
        _btnRefresh.Enabled = false;
        _statusPathLabel.Text = "Actualizando estado...";
        try
        {
            var status = await AgentService.GetStatusAsync();
            UpdateDisplay(status);
        }
        catch (Exception ex)
        {
            AgentService.LogCrash("BtnRefresh", ex);
            _statusPathLabel.Text = $"Error al actualizar: {ex.Message}";
        }
        finally
        {
            _btnRefresh.Enabled = true;
        }
    }

    private async void BtnTestConnection_Click(object? sender, EventArgs e)
    {
        _btnTestConnection.Enabled = false;
        _lblActivationHint.Text = "Probando conexión con el agente y el portal...";
        try
        {
            var status = await AgentService.GetStatusAsync();
            if (status is null)
            {
                _lblActivationHint.Text = "No se pudo contactar al agente local.";
            }
            else if (!status.Activated)
            {
                _lblActivationHint.Text = "El agente responde, pero todavía no está activado.";
            }
            else
            {
                _lblActivationHint.Text = status.Service == "running"
                    ? "Conexión OK: agente activado y servicio en ejecución."
                    : "Agente activado, pero el servicio no está en ejecución.";
            }
            UpdateDisplay(status);
        }
        catch (Exception ex)
        {
            AgentService.LogCrash("BtnTestConnection", ex);
            _lblActivationHint.Text = $"Error al probar la conexión: {ex.Message}";
        }
        finally
        {
            _btnTestConnection.Enabled = true;
        }
    }

    private async void BtnStartService_Click(object? sender, EventArgs e)
    {
        _btnStartService.Enabled = false;
        _statusPathLabel.Text = "Iniciando servicio de Windows...";

        try
        {
            var (ok, error) = await Task.Run(() =>
            {
                AgentService.SetAutoStart();
                return AgentService.StartService();
            });

            if (ok)
            {
                _statusPathLabel.Text = "Servicio iniciado correctamente.";
            }
            else
            {
                _statusPathLabel.Text = "Solicitando permisos para iniciar servicio...";
                var (elevatedOk, elevatedError) = await Task.Run(() =>
                {
                    try
                    {
                        var nodeExe = AgentService.FindAgentExe();
                        if (nodeExe == null) return (false, "Ejecutable no encontrado");
                        var nssmExe = Path.Combine(Path.GetDirectoryName(nodeExe)!, "nssm.exe");
                        if (!File.Exists(nssmExe)) return (false, "NSSM no encontrado");

                        var psi = new ProcessStartInfo(nssmExe, "start STCCloudMonitor")
                        {
                            UseShellExecute = true,
                            Verb = "runas",
                            WindowStyle = ProcessWindowStyle.Hidden,
                            CreateNoWindow = true,
                        };
                        using var proc = Process.Start(psi);
                        proc?.WaitForExit(10000);
                        return (proc?.ExitCode == 0, "");
                    }
                    catch (Exception ex) { return (false, ex.Message); }
                });

                if (elevatedOk)
                {
                    _statusPathLabel.Text = "Servicio iniciado correctamente con privilegios.";
                }
                else
                {
                    MessageBox.Show($"No se pudo iniciar el servicio:\n{elevatedError ?? error}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    _statusPathLabel.Text = "Fallo al iniciar el servicio.";
                }
            }

            var s = await AgentService.GetStatusAsync();
            UpdateDisplay(s);
        }
        catch (Exception ex)
        {
            AgentService.LogCrash("BtnStartService", ex);
            MessageBox.Show($"Error inesperado al iniciar el servicio:\n{ex.Message}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            _statusPathLabel.Text = "Fallo al iniciar el servicio.";
        }
        finally
        {
            _btnStartService.Enabled = true;
        }
    }

    private async void BtnActivate_Click(object? sender, EventArgs e)
    {
        var key = Placeholder.GetValue(_txtKey.Input).Trim();
        var server = _txtServer.Input.Text.Trim();

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
                    await Task.Delay(3000);
                    var finalStatus = await AgentService.GetStatusAsync();
                    if (finalStatus?.Service == "running") svcOk = true;
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
                    MessageBox.Show($"Activado, pero no se pudo iniciar el servicio:\n{svcError}", "Advertencia", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }

                await Task.Delay(500);
                var s = await AgentService.GetStatusAsync();
                UpdateDisplay(s);
                SelectSection(0);
            }
            else
            {
                MessageBox.Show($"La activación falló:\n{error}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
        catch (Exception ex)
        {
            AgentService.LogCrash("BtnActivate", ex);
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
        _txtKey.Input.Enabled = !busy;
        _txtServer.Input.Enabled = !busy;
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
        try { Process.Start(new ProcessStartInfo(logPath) { UseShellExecute = true }); }
        catch { Process.Start("notepad.exe", logPath); }
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

using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

namespace STC.Monitor.UI;

// Tokens de diseño de STC Cloud Monitor Console — NO son los del handoff de
// diseño (paleta #E8811F / fuente Archivo+IBM Plex Mono / icono revectorizado
// a mano): son los tokens REALES que ya usa el portal web
// (cloud/portal/src/index.css @theme, cloud/portal/src/app/layout/SidebarBrand.tsx
// y SidebarNav.tsx). El handoff pide layout/espaciado/comportamiento; los
// colores, la tipografía y el logo vienen de acá para que la consola de
// escritorio se vea como una extensión del portal, no de la maqueta.
internal static class Tokens
{
    public static readonly Color Brand      = ColorTranslator.FromHtml("#F7941D");
    public static readonly Color BrandHover = ColorTranslator.FromHtml("#D97E0F");

    public static readonly Color Ink900 = ColorTranslator.FromHtml("#2E3033"); // fondo sidebar / texto principal
    public static readonly Color Ink700 = ColorTranslator.FromHtml("#3C4144");
    public static readonly Color Ink600 = ColorTranslator.FromHtml("#4B5053");
    public static readonly Color Ink500 = ColorTranslator.FromHtml("#9BA0A2");
    public static readonly Color Ink400 = ColorTranslator.FromHtml("#8A9094");
    public static readonly Color Ink300 = ColorTranslator.FromHtml("#9FA4A7");

    public static readonly Color PanelDarkLine  = ColorTranslator.FromHtml("#3E4144");
    public static readonly Color PanelDarkText  = ColorTranslator.FromHtml("#A9AEB0");
    public static readonly Color PanelDarkLabel = ColorTranslator.FromHtml("#8A9096");
    public static readonly Color PanelDarkItem  = ColorTranslator.FromHtml("#C9CDD0");

    // SidebarNav.tsx: activo = "border-brand bg-brand/[0.13]" sobre fondo Ink900;
    // hover = "hover:bg-white/5" sobre el mismo fondo. Son colores compuestos
    // (opacidad sobre Ink900), precalculados acá porque WinForms no pinta con
    // transparencia real entre controles.
    public static readonly Color NavActiveBg = ColorTranslator.FromHtml("#483D30");
    public static readonly Color NavHoverBg  = ColorTranslator.FromHtml("#383A3D");

    public static readonly Color Border     = ColorTranslator.FromHtml("#E2E6E6");
    public static readonly Color BorderSoft = ColorTranslator.FromHtml("#EDEFEF");
    public static readonly Color SurfacePage = ColorTranslator.FromHtml("#F7F8F8");
    public static readonly Color Surface     = Color.White;

    // Escala de severidad "semáforo apagado" — la misma que Ivan pidió el
    // 11/09/2026 para todo el portal (chips de estado, barras de consumibles,
    // alertas): nunca el semáforo saturado tipo Bootstrap.
    public static readonly Color SeverityOk       = ColorTranslator.FromHtml("#4B8B5D");
    public static readonly Color SeverityWarning  = ColorTranslator.FromHtml("#BF9430");
    public static readonly Color SeverityCritical = ColorTranslator.FromHtml("#B5504A");

    // ToastContext.tsx: type "success" → bg-emerald-50/border-emerald-100,
    // ícono CheckCircle text-emerald-500. Mismos hex de Tailwind que ya
    // pinta ese toast en el portal.
    public static readonly Color SuccessBg     = ColorTranslator.FromHtml("#ECFDF5");
    public static readonly Color SuccessBorder = ColorTranslator.FromHtml("#D1FAE5");
    public static readonly Color SuccessDot    = ColorTranslator.FromHtml("#10B981");
}

// Fuentes: el portal usa Montserrat (títulos) + Source Sans 3 (cuerpo) +
// JetBrains Mono (valores técnicos), todas cargadas de Google Fonts en el
// navegador. Una app de escritorio que corre en print servers de clientes
// (algunos sin salida a internet, ver pestaña Proxy) no puede depender de esa
// descarga, así que acá se usan las equivalentes ya instaladas en Windows:
// Segoe UI (grotesca del sistema, mismo rol que Source Sans/Montserrat) y
// Consolas (mono del sistema, mismo rol que JetBrains Mono) — ambas ya se
// usaban en este proyecto antes de este cambio.
internal static class Branding
{
    public static readonly Font Micro       = new("Segoe UI", 7.5f, FontStyle.Bold);   // micro-labels tracked (~10.5px)
    public static readonly Font Body        = new("Segoe UI", 9f);                     // valor de fila (~13px)
    public static readonly Font BodyBold    = new("Segoe UI", 9f, FontStyle.Bold);
    public static readonly Font BodyMono    = new("Consolas", 9.5f);                   // valores técnicos (IDs, versiones, URLs)
    public static readonly Font NavTitle    = new("Segoe UI", 10f, FontStyle.Bold);    // título de ítem de sidebar (~13.5px)
    public static readonly Font NavTitleReg = new("Segoe UI", 10f);
    public static readonly Font NavDesc     = new("Segoe UI", 8.25f);                  // descripción de ítem (~11.5px)
    public static readonly Font NavGroup    = new("Segoe UI", 7f, FontStyle.Bold);     // "SECCIONES" (~9.5px)
    public static readonly Font BrandTag    = new("Segoe UI", 7f, FontStyle.Bold);     // "STC CLOUD" bajo el logo
    public static readonly Font StatusValue = new("Segoe UI", 15f, FontStyle.Bold);    // "Running" / "Active" (~22px)
    public static readonly Font Button      = new("Segoe UI", 8f, FontStyle.Bold);
    public static readonly Font StatusBarMono = new("Consolas", 8f);
    public static readonly Font SidebarDesc = new("Segoe UI", 8.5f);

    // Pseudo letter-spacing: WinForms Label no soporta tracking nativo, así
    // que para las micro-labels/botones en mayúscula (donde el handoff pide
    // tracking marcado) se intercala un hair space entre letras.
    public static string Track(string s, string sep = " ") =>
        string.Join(sep, s.ToCharArray());

    // ── Recursos incrustados (logo.png / logo1.png / favicon.ico) ────────────

    public static Image? LoadEmbeddedImage(string fileName)
    {
        try
        {
            var asm = Assembly.GetExecutingAssembly();
            using var stream = asm.GetManifestResourceStream($"STC.Monitor.UI.{fileName}");
            return stream is null ? null : Image.FromStream(stream);
        }
        catch { return null; }
    }

    public static Icon? LoadEmbeddedIcon(string fileName)
    {
        try
        {
            var asm = Assembly.GetExecutingAssembly();
            using var stream = asm.GetManifestResourceStream($"STC.Monitor.UI.{fileName}");
            return stream is null ? null : new Icon(stream);
        }
        catch { return null; }
    }

    // Ícono de bandeja: la marca oficial (favicon.ico, el abanico naranja de
    // Canal Directo) con un disco de estado superpuesto en la esquina
    // inferior derecha — mismo patrón que describe el handoff para la
    // bandeja, aplicado sobre el asset real en vez de revectorizarlo.
    public static Icon MakeTrayIcon(Color dotColor)
    {
        using var bmp = new Bitmap(16, 16, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.Clear(Color.Transparent);

            using var mark = LoadEmbeddedIcon("favicon.ico");
            if (mark != null)
            {
                using var markBmp = mark.ToBitmap();
                g.DrawImage(markBmp, new Rectangle(0, 0, 16, 16));
            }

            var dotRect = new Rectangle(9, 9, 6, 6);
            using var dotFill = new SolidBrush(dotColor);
            using var dotBorder = new Pen(Color.White, 1f);
            g.FillEllipse(dotFill, dotRect);
            g.DrawEllipse(dotBorder, dotRect);
        }
        return Icon.FromHandle(bmp.GetHicon());
    }
}

internal enum ButtonKind { Primary, Dark, Outline }

// Tarjeta blanca con borde fino y, opcionalmente, un acento de 3px arriba —
// el mismo patrón de tarjeta que usan las 3 vistas de la consola.
internal sealed class Card : Panel
{
    // DesignerSerializationVisibility.Hidden: estos controles se arman todos
    // a mano por código (sin designer de WinForms) — sin este atributo, el
    // analizador WFO1000 del SDK de .NET 9 exige codegen de diseñador para
    // toda propiedad settable, lo cual no aplica acá.
    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    public Color TopAccent { get; set; } = Color.Transparent;

    public Card()
    {
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint |
                  ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
        BackColor = Tokens.Surface;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        if (TopAccent != Color.Transparent)
        {
            using var accentBrush = new SolidBrush(TopAccent);
            e.Graphics.FillRectangle(accentBrush, 0, 0, Width, 3);
        }
        using var borderPen = new Pen(Tokens.Border);
        e.Graphics.DrawRectangle(borderPen, 0, 0, Width - 1, Height - 1);
    }
}

// Input con borde token-driven (gris en reposo, naranja de marca en foco) —
// TextBox.BorderStyle nativo no permite eso sin owner-draw.
internal sealed class TokenTextBox : Panel
{
    public TextBox Input { get; }

    public TokenTextBox(bool mono = false)
    {
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint |
                  ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
        BackColor = Tokens.SurfacePage;
        Padding = new Padding(12, 7, 12, 7);
        Height = 38;

        Input = new TextBox
        {
            BorderStyle = BorderStyle.None,
            Font = mono ? Branding.BodyMono : Branding.Body,
            ForeColor = Tokens.Ink900,
            BackColor = Tokens.SurfacePage,
            Dock = DockStyle.Fill,
        };
        Controls.Add(Input);

        Input.GotFocus  += (_, _) => { BackColor = Color.White; Input.BackColor = Color.White; Invalidate(); };
        Input.LostFocus += (_, _) => { BackColor = Tokens.SurfacePage; Input.BackColor = Tokens.SurfacePage; Invalidate(); };
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        using var pen = new Pen(Input.Focused ? Tokens.Brand : Tokens.Border);
        e.Graphics.DrawRectangle(pen, 0, 0, Width - 1, Height - 1);
    }
}

// Ítem de navegación del sidebar oscuro — mismos valores compuestos que
// SidebarNav.tsx (border-l-[3px] + bg-brand/13% activo, bg-white/5% hover).
internal sealed class NavItem : Panel
{
    public event EventHandler? Activated;
    private readonly Label _title;
    private bool _active;
    private bool _hover;

    public NavItem(string title, string desc)
    {
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint |
                  ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
        Cursor = Cursors.Hand;
        BackColor = Color.Transparent;

        _title = new Label
        {
            Text = title,
            Font = Branding.NavTitleReg,
            ForeColor = Tokens.PanelDarkItem,
            AutoSize = false,
            Location = new Point(16, 9),
            Size = new Size(220, 18),
            Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right,
            BackColor = Color.Transparent,
        };
        var descLabel = new Label
        {
            Text = desc,
            Font = Branding.NavDesc,
            ForeColor = Tokens.PanelDarkText,
            AutoSize = false,
            Location = new Point(16, 28),
            Size = new Size(220, 30),
            Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right,
            BackColor = Color.Transparent,
        };
        Controls.Add(_title);
        Controls.Add(descLabel);

        foreach (Control c in new Control[] { this, _title, descLabel })
        {
            c.Click += (_, _) => Activated?.Invoke(this, EventArgs.Empty);
            c.MouseEnter += (_, _) => { _hover = true; Invalidate(); };
            c.MouseLeave += (_, _) => { _hover = false; Invalidate(); };
        }
    }

    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    public bool Active
    {
        get => _active;
        set { _active = value; _title.Font = value ? Branding.NavTitle : Branding.NavTitleReg; _title.ForeColor = value ? Color.White : Tokens.PanelDarkItem; Invalidate(); }
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var bg = _active ? Tokens.NavActiveBg : (_hover ? Tokens.NavHoverBg : (Color?)null);
        if (bg != null)
            using (var b = new SolidBrush(bg.Value)) e.Graphics.FillRectangle(b, ClientRectangle);
        if (_active)
            using (var b = new SolidBrush(Tokens.Brand)) e.Graphics.FillRectangle(b, 0, 0, 3, Height);
        base.OnPaint(e);
    }
}

internal static class Buttons
{
    public static Button New(string text, ButtonKind kind)
    {
        var trackedText = Branding.Track(text.ToUpperInvariant(), " ");
        var textSize = TextRenderer.MeasureText(trackedText, Branding.Button);
        var btn = new Button
        {
            Text = trackedText,
            Font = Branding.Button,
            FlatStyle = FlatStyle.Flat,
            AutoSize = false,
            Size = new Size(textSize.Width + 32, 34),
            Cursor = Cursors.Hand,
            UseVisualStyleBackColor = false,
        };
        btn.FlatAppearance.BorderSize = kind == ButtonKind.Outline ? 1 : 0;

        switch (kind)
        {
            case ButtonKind.Primary:
                btn.BackColor = Tokens.Brand;
                btn.ForeColor = Color.White;
                btn.FlatAppearance.MouseOverBackColor = Tokens.BrandHover;
                break;
            case ButtonKind.Dark:
                btn.BackColor = Tokens.Ink900;
                btn.ForeColor = Color.White;
                btn.FlatAppearance.MouseOverBackColor = Tokens.Ink700;
                break;
            case ButtonKind.Outline:
                btn.BackColor = Color.White;
                btn.ForeColor = Tokens.Ink600;
                btn.FlatAppearance.BorderColor = Tokens.Border;
                btn.FlatAppearance.MouseOverBackColor = Tokens.SurfacePage;
                break;
        }
        return btn;
    }
}

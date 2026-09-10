using System.Drawing;
using System.Runtime.CompilerServices;
using System.Windows.Forms;

namespace STC.Monitor.UI;

// TextBox.PlaceholderText no existe en WinForms de .NET Framework (solo en
// .NET Core 3+) — este helper emula el mismo comportamiento a mano para que
// el archivo se comparte sin cambios entre STC.Monitor.UI.csproj (net9) y
// STC.Monitor.UI.Legacy.csproj (net48, para Server 2008 R2). Usar
// Placeholder.GetValue(tb) en vez de tb.Text donde el placeholder puede estar
// mostrándose — tb.Text a secas devolvería el texto de placeholder, no "".
internal static class Placeholder
{
    private static readonly ConditionalWeakTable<TextBox, string> _placeholders = new();

    public static void Attach(TextBox tb, string text)
    {
        _placeholders.Add(tb, text);
        Show(tb);
        tb.GotFocus += (_, _) => Hide(tb);
        tb.LostFocus += (_, _) => Show(tb);
    }

    public static string GetValue(TextBox tb) => IsShowingPlaceholder(tb) ? "" : tb.Text;

    // Vaciar el campo y volver a mostrar el placeholder (para cuando el código
    // limpia el valor programáticamente, fuera del ciclo normal de foco).
    public static void Reset(TextBox tb)
    {
        tb.Text = "";
        Show(tb);
    }

    private static bool IsShowingPlaceholder(TextBox tb) =>
        _placeholders.TryGetValue(tb, out var placeholder) && tb.Text == placeholder && tb.ForeColor == Color.Gray;

    private static void Show(TextBox tb)
    {
        if (!_placeholders.TryGetValue(tb, out var placeholder)) return;
        if (string.IsNullOrEmpty(tb.Text))
        {
            tb.Text = placeholder;
            tb.ForeColor = Color.Gray;
        }
    }

    private static void Hide(TextBox tb)
    {
        if (IsShowingPlaceholder(tb))
        {
            tb.Text = "";
            tb.ForeColor = Color.Black;
        }
    }
}

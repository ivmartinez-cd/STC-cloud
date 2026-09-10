using System.Threading;
using System.Windows.Forms;

namespace STC.Monitor.UI;

static class Program
{
    [STAThread]
    static void Main()
    {
        // Guarantee single instance — only one tray icon at a time
        using var mutex = new Mutex(true, "Global\\STC-Monitor-UI-Singleton", out bool isNewInstance);

        if (!isNewInstance)
        {
            MessageBox.Show(
                "STC Cloud Monitor ya esta en ejecucion.\nRevise el area de notificaciones (bandeja del sistema).",
                "STC Cloud Monitor",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        // Equivalente manual a ApplicationConfiguration.Initialize() (generado por
        // el SDK, no existe en .NET Framework) — mismo resultado en ambos
        // targets, así el archivo se comparte entre STC.Monitor.UI.csproj (net9,
        // Windows 10+) y STC.Monitor.UI.Legacy.csproj (net48, Server 2008 R2+).
#if NET5_0_OR_GREATER
        // Application.SetHighDpiMode no existe en WinForms de .NET Framework —
        // ahí la DPI-awareness se declara en el manifest, no por código.
        Application.SetHighDpiMode(HighDpiMode.SystemAware);
#endif
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new TrayApplication());
    }
}

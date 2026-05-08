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
                "STC Cloud Monitor ya está en ejecución.\nRevise el área de notificaciones (bandeja del sistema).",
                "STC Cloud Monitor",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        ApplicationConfiguration.Initialize();
        Application.Run(new TrayApplication());
    }
}

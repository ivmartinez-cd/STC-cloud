using System;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace STC.Monitor.UI;

static class Program
{
    // "Mostrar una sola vez por sesion": si el error se repite (p. ej. en cada
    // Tick del timer de estado, cada 30 s) no hay que taparle el escritorio al
    // operador con un cartel cada vez — ya queda en el log.
    private static int _threadExceptionsShown;

    [STAThread]
    static void Main()
    {
        // Red de contencion: SIN esto, cualquier excepcion no manejada en el
        // hilo de la bandeja (el Tick del poll de estado, un boton async sin
        // try/catch) cerraba el proceso entero sin dejar mas rastro que un
        // codigo de falla generico en el Visor de eventos de Windows — asi
        // llego el reporte del 14/09/2026: "se cierra solo con un error que
        // no pude capturar". Ahora la excepcion completa (con pila) queda en
        // monitor-ui.log, y las que ocurren en el hilo de UI no cierran la
        // bandeja: `Application.ThreadException` deja que el message loop
        // siga corriendo despues de manejarla.
        //
        // `AppDomain.UnhandledException` cubre lo que pasa en OTRO hilo (no
        // se puede evitar el cierre desde ahi, `e.IsTerminating` va a ser casi
        // siempre true, pero al menos queda constancia). `TaskScheduler.
        // UnobservedTaskException` cubre una Task en segundo plano que nadie
        // esperó y que tira una excepcion recien en el finalizador.
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += OnThreadException;
        AppDomain.CurrentDomain.UnhandledException += OnUnhandledException;
        TaskScheduler.UnobservedTaskException += OnUnobservedTaskException;

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

    private static void OnThreadException(object? sender, ThreadExceptionEventArgs e)
    {
        AgentService.LogCrash("UI", e.Exception);
        if (Interlocked.Increment(ref _threadExceptionsShown) == 1)
        {
            MessageBox.Show(
                "STC Cloud Monitor encontro un error y se recupero automaticamente.\n\n" +
                $"Detalle: {e.Exception.Message}\n\n" +
                $"Quedo registrado en:\n{AgentService.GetCrashLogPath()}",
                "STC Cloud Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private static void OnUnhandledException(object? sender, UnhandledExceptionEventArgs e)
    {
        var ex = e.ExceptionObject as Exception
            ?? new Exception($"Objeto de excepcion no estandar: {e.ExceptionObject}");
        AgentService.LogCrash(e.IsTerminating ? "Fatal" : "Hilo secundario", ex);
    }

    private static void OnUnobservedTaskException(object? sender, UnobservedTaskExceptionEventArgs e)
    {
        AgentService.LogCrash("Task no observada", e.Exception);
        e.SetObserved(); // evita que el finalizador la relance y tire abajo el proceso
    }
}

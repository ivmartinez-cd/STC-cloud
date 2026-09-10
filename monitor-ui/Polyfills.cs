#if !NET5_0_OR_GREATER
// El accesor `init` (usado en AgentService.cs) es una feature del compilador de
// C# 9 que necesita este tipo marcador para compilar — viene incluido en el BCL
// de .NET 5+ pero no existe en .NET Framework. El #if de arriba hace que esta
// definición solo compile en STC.Monitor.UI.Legacy.csproj (net48); en
// STC.Monitor.UI.csproj (net9.0-windows) ya viene del propio framework, y
// declararlo ahí también chocaría con la definición real.
namespace System.Runtime.CompilerServices
{
    internal static class IsExternalInit { }
}
#endif

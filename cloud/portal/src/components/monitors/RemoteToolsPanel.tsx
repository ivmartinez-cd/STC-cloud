import { RefreshCw, Zap, Download, Settings } from 'lucide-react';

interface Props {
  commandLoading: string | null;
  onCommand: (action: string) => void;
}

interface CommandDef {
  action: string;
  label: string;
  tooltip: string;
  colorClass: string;
  hoverClass: string;
  icon: typeof RefreshCw;
}

const COMMANDS: CommandDef[] = [
  {
    action: 'RESCAN',
    label: 'Rescan',
    tooltip: 'Escanea la red local en busca de nuevos dispositivos',
    colorClass: 'text-brand border-blue-100',
    hoverClass: 'hover:bg-brand hover:text-white',
    icon: RefreshCw,
  },
  {
    action: 'RESTART',
    label: 'Reiniciar',
    tooltip: 'Reinicia el servicio del agente de forma remota',
    colorClass: 'text-rose-600 border-rose-100',
    hoverClass: 'hover:bg-rose-600 hover:text-white',
    icon: Zap,
  },
  {
    action: 'FORCE_UPDATE',
    label: 'Actualizar',
    tooltip: 'Fuerza la descarga e instalación de la última versión',
    colorClass: 'text-emerald-600 border-emerald-100',
    hoverClass: 'hover:bg-emerald-600 hover:text-white',
    icon: Download,
  },
];

const RemoteToolsPanel = ({ commandLoading, onCommand }: Props) => (
  <div className="mb-8 p-6 bg-slate-50 rounded-3xl border border-slate-100">
    <div className="flex items-center gap-3 mb-6">
      <Settings size={16} className="text-brand" />
      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Herramientas de Soporte Remoto</h4>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {COMMANDS.map(({ action, label, tooltip, colorClass, hoverClass, icon: Icon }) => (
        <div key={action} className="relative group">
          <button
            onClick={() => onCommand(action)}
            disabled={commandLoading === action}
            className={`w-full py-3 px-4 bg-white border rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 ${colorClass} ${hoverClass}`}
          >
            <Icon size={14} className={commandLoading === action ? 'animate-spin' : ''} />
            {label}
          </button>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-900 text-white text-[10px] font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none whitespace-nowrap z-50 shadow-xl border border-slate-700/50 translate-y-1 group-hover:translate-y-0">
            {tooltip}
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-900" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default RemoteToolsPanel;

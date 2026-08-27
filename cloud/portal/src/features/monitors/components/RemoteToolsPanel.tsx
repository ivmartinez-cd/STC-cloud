import { RefreshCw, Zap, Download } from 'lucide-react';

interface Props {
  commandLoading: string | null;
  onCommand: (action: string) => void;
}

interface CommandDef {
  action: string;
  label: string;
  description: string;
  icon: typeof RefreshCw;
}

const COMMANDS: CommandDef[] = [
  { action: 'RESCAN', label: 'Rescan', description: 'Barrido inmediato de la red local en busca de nuevos dispositivos.', icon: RefreshCw },
  { action: 'RESTART', label: 'Reiniciar', description: 'Corta la telemetría por ~40 s y reinicia el servicio del agente.', icon: Zap },
  { action: 'FORCE_UPDATE', label: 'Actualizar', description: 'Instala la versión publicada más reciente del agente.', icon: Download },
];

/** Herramientas de soporte remoto (handoff hifi "Monitor — detalle", §5 punto
 * 11) — tarjetas blancas con explicación de una línea y botón EJECUTAR, no
 * botones sueltos de colores distintos. */
const RemoteToolsPanel = ({ commandLoading, onCommand }: Props) => (
  <div className="mb-4 short:mb-3 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
    {COMMANDS.map(({ action, label, description, icon: Icon }) => (
      <div key={action} className="flex flex-col rounded-[5px] border border-line-100 bg-white p-4">
        <div className="mb-2 flex items-center gap-2.5">
          <Icon size={15} className={`text-ink-300 ${commandLoading === action ? 'animate-spin' : ''}`} />
          <span className="font-montserrat text-[12px] font-semibold text-ink-900">{label}</span>
        </div>
        <p className="mb-3.5 flex-1 font-sans text-[12px] leading-[1.5] text-ink-300">{description}</p>
        <button
          type="button" onClick={() => onCommand(action)} disabled={commandLoading === action}
          className="self-start rounded-[3px] border border-line-300 bg-white px-3.5 py-2 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-ink-600 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover disabled:opacity-50"
        >
          {commandLoading === action ? 'Ejecutando…' : 'Ejecutar'}
        </button>
      </div>
    ))}
  </div>
);

export default RemoteToolsPanel;

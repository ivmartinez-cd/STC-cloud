import { Globe, Loader2 } from 'lucide-react';
import { useRemoteEwsToggle } from '../hooks/useRemoteEwsToggle';

const STATE_BUTTON = 'flex items-center gap-2 rounded-[3px] px-4 py-2.5 font-montserrat text-[10.5px] font-semibold uppercase tracking-[.08em] transition-colors duration-150 ease-in-out disabled:opacity-50';

/**
 * Interruptor del acceso remoto a la web embebida (EWS) de los equipos de este
 * monitor — el permiso que habilita la pestaña "EWS" de cada ficha de
 * dispositivo. Fuera del `<form>` de configuración a propósito: se guarda solo
 * (ver `useRemoteEwsToggle`), no con "Guardar cambios".
 */
const Description = () => (
  <>
    <p className="mb-3.5 font-sans text-[12.5px] leading-[1.55] text-ink-700">
      Permite traer, desde la ficha de un equipo, una página suelta de su servidor web embebido (EWS) sin VPN: la pide el
      agente desde adentro de la red del cliente, por el mismo canal saliente que ya usa. Es de sólo lectura (un GET por vez),
      sólo alcanza equipos ya sincronizados por este monitor y cada uso queda en la auditoría.
    </p>
    <p className="mb-3.5 font-sans text-[11.5px] leading-[1.5] text-ink-300 short:hidden">
      Viene deshabilitado de fábrica. Mientras lo esté, la nube rechaza el pedido sin llegar a encolarlo.
    </p>
  </>
);

export default function RemoteEwsPanel({ agentId, initialEnabled }: { agentId: string; initialEnabled: boolean }) {
  const { enabled, saving, toggle } = useRemoteEwsToggle(agentId, initialEnabled);
  return (
    <div className="rounded-[5px] border border-line-100 bg-white p-5 short:p-4">
      <div className="mb-4 flex items-center justify-between border-b border-line-150 pb-3.5">
        <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">Acceso remoto a la web embebida</span>
        <Globe size={14} className={enabled ? 'text-brand' : 'text-ink-300'} />
      </div>
      <Description />
      <button type="button" onClick={toggle} disabled={saving}
        className={`${STATE_BUTTON} ${enabled ? 'bg-brand text-white hover:bg-brand-severe' : 'border border-line-300 bg-white text-ink-600 hover:bg-surface-btn-hover'}`}>
        {saving && <Loader2 size={14} className="animate-spin" />}
        {enabled ? 'Habilitado — deshabilitar' : 'Deshabilitado — habilitar'}
      </button>
    </div>
  );
}

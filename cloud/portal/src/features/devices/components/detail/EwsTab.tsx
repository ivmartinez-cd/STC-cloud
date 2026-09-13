import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Globe, Loader2, ShieldOff, TriangleAlert } from 'lucide-react';
import { Card, CardTitle } from './primitives';
import EwsPathBar from './EwsPathBar';
import EwsResultView from './EwsResultView';
import { useEwsProxy, useRemoteEwsFlag } from '../../hooks/useEwsProxy';
import { presetsFor } from '../../lib/ewsPaths';
import type { DeviceDetailData } from '../../types/deviceDetailPage';

const CENTERED = 'flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-8 py-10 text-center';

const Loading = () => (
  <div className={CENTERED}><Loader2 size={24} className="animate-spin text-brand" /></div>
);

/** El flag es del monitor y es opt-in explícito: acá sólo se explica y se manda a habilitarlo, no se habilita solo. */
const DisabledNotice = ({ agentId, monitorName }: { agentId?: string | null; monitorName?: string }) => (
  <div className={CENTERED}>
    <ShieldOff size={26} className="text-ink-300" />
    <p className="font-sans text-[12.5px] text-ink-700">
      {agentId
        ? 'El acceso remoto a la web embebida está deshabilitado para este monitor.'
        : 'Este equipo no está asociado a ningún monitor: no hay agente que pueda alcanzar su web embebida.'}
    </p>
    {agentId && (
      <>
        <p className="max-w-[46rem] font-sans text-[12px] leading-[1.55] text-ink-400">
          Viene apagado de fábrica y se habilita monitor por monitor, desde su configuración. Mientras está apagado, la nube no
          acepta ni encola el pedido.
        </p>
        <Link to={`/monitors/${agentId}?tab=config`} className="font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent hover:underline">
          Habilitarlo en {monitorName ?? 'el monitor'} →
        </Link>
      </>
    )}
  </div>
);

const RequestError = ({ message }: { message: string }) => (
  <div className={CENTERED}>
    <TriangleAlert size={26} className="text-severity-critical" />
    <p className="max-w-[46rem] font-sans text-[12.5px] leading-[1.55] text-ink-700">{message}</p>
  </div>
);

const Placeholder = () => (
  <div className={CENTERED}>
    <Globe size={26} className="text-ink-300" />
    <p className="max-w-[46rem] font-sans text-[12.5px] leading-[1.55] text-ink-400">
      Elegí una ruta conocida o escribí una para traer esa página de la web embebida del equipo. Es una sola página por
      consulta — no una sesión abierta contra la impresora — y queda registrada en la auditoría: ruta y código de estado, nunca
      el contenido.
    </p>
  </div>
);

function EwsPanelBody({ device }: { device: DeviceDetailData }) {
  const { loading, error, result, lastPath, request } = useEwsProxy(device.agent_id, device.id);
  const [path, setPath] = useState('/');
  const presets = useMemo(() => presetsFor(device.brand), [device.brand]);
  const pick = (chosen: string) => { setPath(chosen); void request(chosen); };
  return (
    <>
      <EwsPathBar
        value={path} onChange={setPath} onSubmit={() => void request(path)} onPick={pick}
        loading={loading} presets={presets} ip={device.ip_address}
      />
      {loading ? <Loading />
        : error ? <RequestError message={error} />
        : result && lastPath ? <EwsResultView result={result} path={lastPath} />
        : <Placeholder />}
    </>
  );
}

/**
 * Pestaña "EWS": acceso remoto controlado a la web embebida del equipo, por el
 * túnel sobre el WSS que el agente ya tiene abierto (sección 10 de la auditoría
 * de sistemas e IT). No abre ningún puerto nuevo — la nube encola un GET, lo
 * emite el agente desde adentro de la red del cliente y la respuesta vuelve por
 * el mismo canal.
 *
 * Sólo admin/operator: la pestaña ya viene gateada desde `DeviceDetail`, y el
 * backend deja la ruta fuera de `CLIENT_VIEWER_ROUTES` (deny-by-default).
 */
export default function EwsTab({ device }: { device: DeviceDetailData }) {
  const enabled = useRemoteEwsFlag(device.agent_id);
  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardTitle icon={<Globe size={16} />}>Web embebida del equipo · {device.ip_address}</CardTitle>
      {enabled === null ? <Loading />
        : !enabled ? <DisabledNotice agentId={device.agent_id} monitorName={device.monitor_name} />
        : <EwsPanelBody device={device} />}
    </Card>
  );
}

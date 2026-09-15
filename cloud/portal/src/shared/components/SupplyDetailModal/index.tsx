import { Loader2 } from 'lucide-react';
import { useAuth } from '../../../store/AuthContext';
import { useSupplyHistory } from '../../hooks/useSupplyHistory';
import { BTN_PRIMARY_SM, BTN_SECONDARY_SM } from '../../lib/buttons';
import { formatDateTime } from '../../lib/formatters';
import type { SupplyHistory } from '../../types/supplyHistory';
import { BrandModal } from '../BrandModal';
import CardError from '../CardError';
import { StatTile } from './primitives';
import SupplyIdentificationCard from './SupplyIdentificationCard';
import SupplyHistoryPanel from './SupplyHistoryPanel';
import SupplyPerformanceCard from './SupplyPerformanceCard';
import SupplyRequestsHistory from './SupplyRequestsHistory';
import { exportSupplyHistoryCsv } from './exportSupplyHistoryCsv';
import { useSupplyOrder } from './useSupplyOrder';
import { fmtInt } from '../../lib/supplies';

export interface SupplyDetailTarget {
  deviceId: string;
  supplyKey: string;
}

interface Props {
  target: SupplyDetailTarget | null;
  onClose: () => void;
}

function MetaLine({ history }: { history: SupplyHistory }) {
  const { device, supply } = history;
  const bits = [
    device.client_name, device.model,
    device.serial_number ? `Serie ${device.serial_number}` : null,
    supply.serial ? `Cartucho ${supply.serial}` : null,
    device.last_seen ? `Última lectura ${formatDateTime(device.last_seen)}` : null,
  ].filter(Boolean);
  return <p className="font-sans text-[12px] text-ink-300">{bits.join(' · ')}</p>;
}

function Actions({ history, canOrder, onOrdered }: { history: SupplyHistory; canOrder: boolean; onOrdered: () => void }) {
  const { order, busy } = useSupplyOrder(history, onOrdered);
  return (
    <div className="flex shrink-0 gap-2">
      <button type="button" className={BTN_SECONDARY_SM} onClick={() => exportSupplyHistoryCsv(history, history.points)}>EXPORTAR</button>
      {canOrder && (
        <button type="button" className={BTN_PRIMARY_SM} disabled={busy} onClick={() => void order()}>
          {busy ? 'CREANDO…' : 'PEDIR CONSUMIBLE'}
        </button>
      )}
    </div>
  );
}

function Body({ history, canOrder, reload }: { history: SupplyHistory; canOrder: boolean; reload: () => void }) {
  const { cycle, supply } = history;
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-150 pb-3.5">
        <MetaLine history={history} />
        <Actions history={history} canOrder={canOrder} onOrdered={reload} />
      </div>
      <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-[300px_minmax(0,1fr)_320px]">
        <SupplyIdentificationCard supply={supply} device={history.device} />
        <SupplyHistoryPanel history={history} />
        <div className="flex flex-col gap-3.5">
          <SupplyPerformanceCard cycle={cycle} />
          <div className="grid grid-cols-2 gap-3.5">
            <StatTile label="Días restantes" value={supply.remainingDays ?? '—'} note="según el ritmo de 30 días" />
            <StatTile label="Pág. restantes" value={fmtInt(supply.remainingPages)} note="informadas por el equipo" accent />
          </div>
        </div>
      </div>
      <SupplyRequestsHistory rows={history.requests} />
    </div>
  );
}

/**
 * "Detalles del consumible" — el modal que abre el SDS al tocar el
 * porcentaje de un insumo (pedido de Ivan, 15/09/2026). Vive en `shared/`
 * y no en `features/supplies/` porque lo abren dos features distintos
 * (Consumibles y Dispositivo — detalle) y `check-guards` prohíbe que un
 * feature importe de otro.
 */
export default function SupplyDetailModal({ target, onClose }: Props) {
  const { role } = useAuth();
  const { history, loading, error, reload } = useSupplyHistory(target);
  const title = history?.supply.description ?? 'Detalles del consumible';

  return (
    <BrandModal isOpen={!!target} onClose={onClose} title={title} widthPx={1480}>
      {error ? <CardError onRetry={reload} /> : null}
      {!error && (loading || !history) ? (
        <div className="flex items-center justify-center gap-2 py-20 font-sans text-[12.5px] text-ink-300">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando histórico del consumible…
        </div>
      ) : null}
      {!error && !loading && history ? <Body history={history} canOrder={role !== 'client_viewer'} reload={reload} /> : null}
    </BrandModal>
  );
}

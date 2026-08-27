import BrandBadge from '../../../shared/components/BrandBadge';
import EstadoChip from '../../../shared/components/EstadoChip';
import { TableEmptyState, TableSkeletonRow } from '../../../shared/components/TableStates';
import { SUPPLY_REQUEST_STATUS_LABELS, type SupplyRequest } from '../types/supplyRequests';
import { fmtAge, fmtDate, originChipProps, originLabel, statusChipProps } from '../lib/supplyRequestsPresentation';
import { GRID_COLS } from './supplyRequestsGrid';

const HEAD_LABELS = ['EQUIPO', 'CLIENTE Y SEDE', 'CONSUMIBLE SOLICITADO', 'ORIGEN', 'ESTADO'];

function EquipmentCell({ r }: { r: SupplyRequest }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <BrandBadge brand={r.device_label} />
      <div className="min-w-0">
        <div className="truncate font-sans text-[12.5px] font-semibold text-ink-900">{r.device_label ?? 'Sin equipo'}</div>
        <div className="truncate font-mono text-[11px] text-ink-300">{r.device_serial ?? '—'}</div>
      </div>
    </div>
  );
}

function SupplyCell({ r }: { r: SupplyRequest }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-sans text-[12.5px] text-ink-700">{r.description ?? `${r.supply_kind} ${r.supply_color ?? ''}`}</div>
      <div className={`truncate font-mono text-[11px] ${r.sku ? 'text-ink-300' : 'text-brand-severe'}`}>{r.sku ?? 'Sin SKU'}</div>
    </div>
  );
}

/** Sin "sede": el DTO de pedido no trae agente/sitio (sólo `client_id`) — no
 * hay de dónde sacarla sin fabricarla. Cliente resuelto vía la lista de
 * clientes ya cargada (`clientName`), mismo criterio que `EmailLog.tsx`. */
function ClientCell({ clientId, clientName }: { clientId: string; clientName: (id: string) => string }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-sans text-[12.5px] text-ink-700">{clientName(clientId)}</div>
      <div className="truncate font-sans text-[11px] text-ink-200">Sin dato de sede</div>
    </div>
  );
}

function Row({ r, clientName, onOpen }: { r: SupplyRequest; clientName: (id: string) => string; onOpen: (id: string) => void }) {
  const statusChip = statusChipProps(r.status);
  const originChip = originChipProps(r.origin);
  const pending = r.status === 'pending';
  return (
    <button
      type="button" data-fit-row onClick={() => onOpen(r.id)}
      className={`grid ${GRID_COLS} min-h-[54px] w-full items-center gap-x-[14px] border-b border-line-200 px-5 py-[11px] text-left transition-colors duration-150 ease-in-out hover:bg-surface-hover`}
    >
      <EquipmentCell r={r} />
      <ClientCell clientId={r.client_id} clientName={clientName} />
      <SupplyCell r={r} />
      <span className="justify-self-start"><EstadoChip label={originLabel(r.origin)} variant={originChip.variant} /></span>
      <span className="justify-self-start"><EstadoChip label={SUPPLY_REQUEST_STATUS_LABELS[r.status].toUpperCase()} variant={statusChip.variant} /></span>
      <span className="text-right font-sans text-[12px] text-ink-600">{fmtDate(r.opened_at)}</span>
      <span className={`text-right font-montserrat text-[12.5px] font-semibold ${pending ? 'text-brand-severe' : 'text-ink-600'}`}>{fmtAge(r.opened_at, r.closed_at)}</span>
      <span className="justify-self-end font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent">{pending ? 'TRAMITAR →' : 'VER →'}</span>
    </button>
  );
}

function HeaderRow() {
  return (
    <div data-fit-fixed className={`grid ${GRID_COLS} items-center gap-x-[14px] border-b border-line-100 bg-surface-table-head px-5 py-3`}>
      {HEAD_LABELS.map((l) => <div key={l} className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">{l}</div>)}
      <div className="text-right font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-600">APERTURA</div>
      <div className="text-right font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">ANTIGÜEDAD</div>
      <div />
    </div>
  );
}

const SKELETON_WIDTHS = ['w-3/5', 'w-2/5', 'w-1/2', 'w-2/5', 'w-2/5', 'w-2/5', 'w-2/5', ''];

interface Props {
  items: SupplyRequest[];
  clientName: (id: string) => string;
  loading: boolean;
  onOpen: (id: string) => void;
  skeletonRows?: number;
}

/** Tabla de Pedidos (handoff hifi #3, fase 3, 26/08/2026): cliente y sede,
 * consumible con SKU faltante marcado como bloqueante, CTA única por fila. */
export default function SupplyRequestsTable({ items, clientName, loading, onOpen, skeletonRows = 8 }: Props) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1180px]" role="table" aria-label="Pedidos">
        <HeaderRow />
        {loading ? (
          Array.from({ length: skeletonRows }, (_, i) => <TableSkeletonRow key={i} gridCols={GRID_COLS} widths={SKELETON_WIDTHS} />)
        ) : items.length === 0 ? (
          <TableEmptyState message="Sin pedidos en este estado" />
        ) : (
          items.map((r) => <Row key={r.id} r={r} clientName={clientName} onOpen={onOpen} />)
        )}
      </div>
    </div>
  );
}

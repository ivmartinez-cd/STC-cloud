import { useNavigate } from 'react-router-dom';
import EstadoChip from '../../../shared/components/EstadoChip';
import { TableEmptyState, TableErrorState, TableSkeletonRow } from '../../../shared/components/TableStates';
import { EVENT_LABELS, STATUS_LABELS, eventDot, fmtDate, statusChipProps } from '../lib/emailLogPresentation';
import type { EmailLogRow } from '../types/emailLog';
import { GRID_COLS } from './emailLogGrid';

const HEAD_LABELS = ['FECHA ↓', 'CLIENTE', 'EVENTO', 'DESTINATARIO', 'ASUNTO', 'RESULTADO'];

function RecipientCell({ recipient }: { recipient: string | null }) {
  if (!recipient) return <span className="truncate font-mono text-[12px] text-ink-200">Sin destinatario</span>;
  return <span className="truncate font-mono text-[12px] text-ink-700">{recipient}</span>;
}

/** CTA por fila según la causa (handoff hifi #3, 26/08/2026): `ASIGNAR CONTACTO →`
 * cuando falta destinatario es navegación real al cliente. El mockup también
 * pide `REINTENTAR →` para el fallo de servidor, pero no existe cola de
 * reintentos (`services/notificationService/mailer.ts` no reintenta nada) —
 * un botón "reintentar" que no reintenta sería un control falso. En su lugar,
 * el CTA lleva a la causa real: configurar el SMTP. */
function RowCta({ row }: { row: EmailLogRow }) {
  const navigate = useNavigate();
  if (row.status === 'skipped_no_recipient' && row.client_id) {
    return (
      <button type="button" onClick={() => navigate(`/clients/${row.client_id}`)} className="justify-self-end font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent hover:underline">
        ASIGNAR CONTACTO →
      </button>
    );
  }
  if (row.status === 'skipped_no_transport' || row.status === 'error') {
    return (
      <button type="button" onClick={() => navigate('/settings')} className="justify-self-end font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent hover:underline">
        CONFIGURAR SMTP →
      </button>
    );
  }
  return <span />;
}

function Row({ row, clientName }: { row: EmailLogRow; clientName: (id: string | null) => string }) {
  const chip = statusChipProps(row.status);
  return (
    <div className={`grid ${GRID_COLS} min-h-[54px] items-center gap-x-[14px] border-b border-line-200 px-5 py-[11px] transition-colors duration-150 ease-in-out hover:bg-surface-hover`}>
      <span className="font-sans text-[12px] text-ink-600">{fmtDate(row.created_at)}</span>
      <span className="truncate font-sans text-[12.5px] font-semibold text-ink-900">{clientName(row.client_id)}</span>
      <span className="justify-self-start"><EstadoChip label={EVENT_LABELS[row.event] ?? row.event} variant="neutral" dotClassName={eventDot(row.event)} /></span>
      <RecipientCell recipient={row.recipient} />
      <span className="truncate font-sans text-[12.5px] text-ink-700" title={row.subject}>{row.subject}</span>
      <span className="justify-self-start"><EstadoChip label={STATUS_LABELS[row.status]} variant={chip.variant} dotClassName={chip.dotClassName} /></span>
      <RowCta row={row} />
    </div>
  );
}

function HeaderRow() {
  return (
    <div className={`grid ${GRID_COLS} items-center gap-x-[14px] border-b border-line-100 bg-surface-table-head px-5 py-3`}>
      {HEAD_LABELS.map((l) => <div key={l} className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">{l}</div>)}
      <div className="text-right font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">ACCIÓN</div>
    </div>
  );
}

const SKELETON_WIDTHS = ['w-3/5', 'w-2/5', 'w-1/2', 'w-3/5', 'w-3/5', 'w-2/5', ''];

interface Props {
  items: EmailLogRow[];
  clientName: (id: string | null) => string;
  loading: boolean;
  error: string;
  onRetry: () => void;
}

/** Tabla de Correo (handoff hifi #3, 26/08/2026): destinatario y CTA hacen
 * visible cuál de las dos causas explica cada fila, en vez de `—` sin contexto. */
export default function EmailLogTable({ items, clientName, loading, error, onRetry }: Props) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1260px]" role="table" aria-label="Registro de correo">
        <HeaderRow />
        {error ? (
          <TableErrorState message="No se pudo cargar" onRetry={onRetry} />
        ) : loading ? (
          Array.from({ length: 8 }, (_, i) => <TableSkeletonRow key={i} gridCols={GRID_COLS} widths={SKELETON_WIDTHS} />)
        ) : items.length === 0 ? (
          <TableEmptyState message="Sin registros de correo con estos filtros" />
        ) : (
          items.map((r) => <Row key={r.id} row={r} clientName={clientName} />)
        )}
      </div>
    </div>
  );
}

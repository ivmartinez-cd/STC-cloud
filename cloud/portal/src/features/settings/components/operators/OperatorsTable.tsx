import { ChevronRight } from 'lucide-react';
import EstadoChip from '../../../../shared/components/EstadoChip';
import InitialsAvatar from '../../../../shared/components/InitialsAvatar';
import { TableEmptyState, TableSkeletonRow } from '../../../../shared/components/TableStates';
import { ROLE_LABELS, roleDotClass, scopeOf } from '../../lib/settingsPresentation';
import type { DBUser } from '../../types/settings';
import { GRID_COLS } from './operatorsGrid';

const HEAD_LABELS = ['OPERADOR', 'ROL', 'ALCANCE', 'ESTADO'];

function ScopeCell({ user }: { user: DBUser }) {
  const scope = scopeOf(user);
  return <span className={`truncate font-sans text-[12.5px] ${scope.blocked ? 'text-brand-severe' : 'text-ink-700'}`}>{scope.text}</span>;
}

function OperatorCell({ user, isSelf }: { user: DBUser; isSelf: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <InitialsAvatar name={user.username} variant={user.role === 'admin' ? 'brand' : 'neutral'} />
      <div className="min-w-0">
        <div className="truncate font-sans text-[12.5px] font-semibold text-ink-900">{user.username}{isSelf ? ' (vos)' : ''}</div>
        {user.totp_required && <div className="truncate font-sans text-[11px] text-ink-300">2FA requerido</div>}
      </div>
    </div>
  );
}

/** Último acceso / IP (handoff hifi #3, fase 2, 26/08/2026): `users` no tiene
 * `last_login_at`/`last_login_ip` — agregarlo toca el handler de login, que
 * otra sesión estaba editando en paralelo en este mismo checkout al momento
 * de esta fase. Se deja "Sin datos" en vez de fabricar fechas, pendiente de
 * una pasada aparte. */
function LastAccessCells() {
  return (
    <>
      <span className="text-right font-sans text-[12px] text-ink-200">Sin datos</span>
      <span className="font-mono text-[11.5px] text-ink-200">—</span>
    </>
  );
}

function Row({ user, isSelf, onOpen }: { user: DBUser; isSelf: boolean; onOpen: (u: DBUser) => void }) {
  return (
    <button
      type="button" onClick={() => onOpen(user)} data-fit-row
      className={`grid ${GRID_COLS} min-h-[54px] w-full items-center gap-x-[14px] border-b border-line-200 px-5 py-[11px] text-left transition-colors duration-150 ease-in-out hover:bg-surface-hover`}
    >
      <OperatorCell user={user} isSelf={isSelf} />
      <span className="justify-self-start"><EstadoChip label={ROLE_LABELS[user.role] ?? user.role} variant={user.role === 'admin' ? 'attention' : 'neutral'} dotClassName={roleDotClass(user.role)} /></span>
      <ScopeCell user={user} />
      <span className="justify-self-start"><EstadoChip label={user.active ? 'ACTIVO' : 'SUSPENDIDO'} variant={user.active ? 'neutral' : 'attention'} /></span>
      <LastAccessCells />
      <ChevronRight size={15} className="justify-self-end text-ink-300" />
    </button>
  );
}

interface Props {
  users: DBUser[];
  currentUserId: string | null;
  loading: boolean;
  onOpen: (u: DBUser) => void;
  /** Filas del skeleton — la página pasa las que caben (`useFitRows`). */
  skeletonRows?: number;
}

function HeaderRow() {
  return (
    <div data-fit-fixed className={`grid ${GRID_COLS} items-center gap-x-[14px] border-b border-line-100 bg-surface-table-head px-5 py-3`}>
      {HEAD_LABELS.map((l) => <div key={l} className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">{l}</div>)}
      <div className="text-right font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-600">ÚLTIMO ACCESO</div>
      <div className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">ORIGEN</div>
      <div />
    </div>
  );
}

function Body({ users, currentUserId, loading, onOpen, skeletonRows = 5 }: Props) {
  if (loading) return <>{Array.from({ length: skeletonRows }, (_, i) => <TableSkeletonRow key={i} gridCols={GRID_COLS} widths={['w-3/5', 'w-2/5', 'w-1/2', 'w-2/5', '', '', '']} />)}</>;
  if (users.length === 0) return <TableEmptyState message="Ningún operador coincide con el filtro" />;
  return <>{users.map((u) => <Row key={u.id} user={u} isSelf={u.id === currentUserId} onOpen={onOpen} />)}</>;
}

/** Tabla de operadores (handoff hifi #3, fase 2, 26/08/2026) — reemplaza
 * `UserTable.tsx`: fila clicable que abre el detalle/acciones (rol, estado,
 * reset, borrar) en un panel lateral en vez de controles sueltos por celda. */
export default function OperatorsTable(props: Props) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1180px]" role="table" aria-label="Operadores">
        <HeaderRow />
        <Body {...props} />
      </div>
    </div>
  );
}

import { BrandModal } from '../../../../shared/components/BrandModal';
import EstadoChip from '../../../../shared/components/EstadoChip';
import { BTN_PRIMARY_SM, BTN_SECONDARY_SM, BTN_WARNING_SM } from '../../../../shared/lib/buttons';
import { scopeOf } from '../../lib/settingsPresentation';
import type { DBUser } from '../../types/settings';

const ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'operator', label: 'Operador' },
  { value: 'admin', label: 'Administrador' },
  { value: 'client_viewer', label: 'Cliente (sólo lectura)' },
];

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-line-200 py-2.5">
      <span className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">{label}</span>
      {children}
    </div>
  );
}

interface Props {
  user: DBUser;
  isSelf: boolean;
  onClose: () => void;
  onRoleChange: (user: DBUser, role: string) => void;
  onToggleActive: (user: DBUser) => void;
  onResetPassword: (user: DBUser) => void;
  onDelete: (user: DBUser) => void;
}

function RoleSelect({ user, isSelf, onRoleChange }: Pick<Props, 'user' | 'isSelf' | 'onRoleChange'>) {
  return (
    <select
      value={user.role} disabled={isSelf}
      onChange={(e) => onRoleChange(user, e.target.value)}
      className="rounded-[3px] border border-line-100 bg-white px-2.5 py-1.5 font-sans text-[12.5px] text-ink-900 outline-none focus:border-brand disabled:opacity-50"
    >
      {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function InfoRows({ user, isSelf, onRoleChange, onToggleActive }: Pick<Props, 'user' | 'isSelf' | 'onRoleChange' | 'onToggleActive'>) {
  const scope = scopeOf(user);
  return (
    <div className="space-y-0.5">
      <InfoRow label="ROL"><RoleSelect user={user} isSelf={isSelf} onRoleChange={onRoleChange} /></InfoRow>
      <InfoRow label="ALCANCE">
        <span className={`font-sans text-[12.5px] ${scope.blocked ? 'text-brand-severe' : 'text-ink-700'}`}>{scope.text}</span>
      </InfoRow>
      <InfoRow label="ESTADO">
        <button type="button" onClick={() => onToggleActive(user)} disabled={isSelf} className="disabled:opacity-50">
          <EstadoChip label={user.active ? 'ACTIVO' : 'SUSPENDIDO'} variant={user.active ? 'neutral' : 'attention'} />
        </button>
      </InfoRow>
    </div>
  );
}

function Actions({ user, isSelf, onClose, onResetPassword, onDelete }: Pick<Props, 'user' | 'isSelf' | 'onClose' | 'onResetPassword' | 'onDelete'>) {
  return (
    <div className="mt-5 flex flex-wrap gap-2.5">
      <button type="button" onClick={() => onResetPassword(user)} className={BTN_SECONDARY_SM}>RESTABLECER CONTRASEÑA</button>
      {!isSelf && <button type="button" onClick={() => onDelete(user)} className={BTN_WARNING_SM}>ELIMINAR OPERADOR</button>}
      <button type="button" onClick={onClose} className={`ml-auto ${BTN_PRIMARY_SM}`}>CERRAR</button>
    </div>
  );
}

/** Panel de detalle de operador (handoff hifi #3, fase 2, 26/08/2026) — el
 * mockup abre esto con el chevron `›` de la fila en vez de controles sueltos
 * por celda. Rol/estado se cambian acá; reset de contraseña y borrado siguen
 * delegando en `ResetPasswordModal`/confirm existentes (capa de acción no
 * rediseñada en esta fase, ver nota en `OperatorsTable.tsx`). */
export default function OperatorDetailModal(props: Props) {
  return (
    <BrandModal isOpen onClose={props.onClose} title={props.user.username} widthPx={440}>
      <InfoRows {...props} />
      <Actions {...props} />
    </BrandModal>
  );
}

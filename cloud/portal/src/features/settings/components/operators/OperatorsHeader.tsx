import { BTN_PRIMARY_SM, BTN_SECONDARY_SM } from '../../../../shared/lib/buttons';
import ZoneLabel from '../../../../shared/components/ZoneLabel';

interface Props {
  count: number;
  isAdmin: boolean;
  onViewPermissions: () => void;
  onAddOperator: () => void;
}

/** Handoff hifi #3, fase 2, 26/08/2026 — "GESTIÓN DE OPERADORES · N CUENTAS" +
 * `VER PERMISOS POR ROL` / `+ AGREGAR OPERADOR`. */
export default function OperatorsHeader({ count, isAdmin, onViewPermissions, onAddOperator }: Props) {
  return (
    <div className="mb-3.5 mt-6 flex flex-wrap items-end justify-between gap-3.5">
      <ZoneLabel text={`GESTIÓN DE OPERADORES · ${count} CUENTA${count === 1 ? '' : 'S'}`} lineColorClass="bg-brand-gray" />
      <div className="flex flex-wrap gap-2.5">
        <button type="button" onClick={onViewPermissions} className={BTN_SECONDARY_SM}>VER PERMISOS POR ROL</button>
        {isAdmin && <button type="button" onClick={onAddOperator} className={BTN_PRIMARY_SM}>+ AGREGAR OPERADOR</button>}
      </div>
    </div>
  );
}

import { BrandModal } from '../../../../shared/components/BrandModal';

const ROLES: Array<{ label: string; description: string }> = [
  { label: 'ADMIN GENERAL', description: 'Acceso completo a todos los clientes, configuración del sistema, operadores y credenciales. Es el único rol que puede crear o borrar operadores.' },
  { label: 'OPERADOR', description: 'Ve y gestiona todos los clientes de la red (dispositivos, alertas, incidentes, pedidos, reportes). No puede modificar Configuración del sistema ni la lista de operadores.' },
  { label: 'SOLO LECTURA', description: 'Acceso de sólo lectura, limitado a un único cliente asignado. No puede reconocer alertas, crear incidentes ni modificar nada — sólo consultar su propia información.' },
];

/** "VER PERMISOS POR ROL" (handoff hifi #3, fase 2, 26/08/2026) — el RBAC real
 * (`rolePolicy.ts`) no se expone por HTTP (el backend lo aplica, pero nada lo
 * sirve para que el front lo consulte). En vez de fabricar un endpoint nuevo
 * para esto, es un panel estático con la descripción de los 3 roles reales
 * del sistema — fiel a `CLIENT_VIEWER_ROUTES` y al resto de `rolePolicy.ts`,
 * pero sin pretender ser una fuente de verdad consultable en vivo. */
export default function RolePermissionsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <BrandModal isOpen={isOpen} onClose={onClose} title="Permisos por rol" widthPx={480}>
      <div className="space-y-4 p-5">
        {ROLES.map((r) => (
          <div key={r.label} className="rounded-[5px] border border-line-100 p-4">
            <div className="font-montserrat text-[10px] font-bold uppercase tracking-[.1em] text-ink-600">{r.label}</div>
            <p className="mt-1.5 font-sans text-[12.5px] leading-[1.55] text-ink-100">{r.description}</p>
          </div>
        ))}
      </div>
    </BrandModal>
  );
}

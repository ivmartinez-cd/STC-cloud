import type { MaskedSnmpCredential } from '../../../shared/types/monitor';

interface Props {
  available: MaskedSnmpCredential[];
  selected: string[] | undefined;
  onChange: (ids: string[] | undefined) => void;
}

/** `undefined` en vez de `[]` cuando queda vacío — nunca una lista vacía explícita, que dejaría el rango sin ninguna credencial utilizable (mismo fail-open que `agentService/config.ts::getConfig` del lado cloud). */
function toggled(active: Set<string>, id: string): string[] | undefined {
  const next = active.has(id) ? [...active].filter((x) => x !== id) : [...active, id];
  return next.length > 0 ? next : undefined;
}

/**
 * Qué credenciales SNMP probar en ESTE rango/host puntual durante discovery
 * (`IpRange.credential_ids`). Vacío/ausente = pool completo, el
 * comportamiento de siempre. Sin credenciales adicionales configuradas en el
 * agente, no hay nada que elegir.
 */
export default function CredentialIdsSelect({ available, selected, onChange }: Props) {
  if (available.length === 0) return null;
  const active = new Set(selected ?? []);
  return (
    <div className="space-y-1.5">
      <label className="block font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">
        Credenciales SNMP para este rango (vacío = probar todas)
      </label>
      <div className="flex flex-wrap gap-1.5">
        {available.map((c) => (
          <CredentialChip key={c.id} credential={c} active={active.has(c.id)} onToggle={() => onChange(toggled(active, c.id))} />
        ))}
      </div>
    </div>
  );
}

function CredentialChip({ credential, active, onToggle }: { credential: MaskedSnmpCredential; active: boolean; onToggle: () => void }) {
  const label = credential.label || credential.username || credential.version.toUpperCase();
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`rounded-[3px] px-2.5 py-1 font-montserrat text-[10px] font-semibold uppercase tracking-[.06em] transition-colors duration-150 ease-in-out ${
        active ? 'bg-brand text-white' : 'border border-line-300 bg-white text-ink-400 hover:bg-surface-btn-hover'
      }`}
    >
      {label}
    </button>
  );
}

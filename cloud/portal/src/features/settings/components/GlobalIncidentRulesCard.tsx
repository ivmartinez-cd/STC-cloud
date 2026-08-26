import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../../../shared/lib/api';
import { useToast } from '../../../store/ToastContext';
import EstadoChip from '../../../shared/components/EstadoChip';
import { BTN_PRIMARY_SM } from '../../../shared/lib/buttons';
import type { IncidentRule } from '../../../shared/types/incidents';
import type { AlertClassOption } from '../../../shared/types/alerts';

const HEAD_LABELS = ['Clase', 'Activo', 'Severidad mínima', 'Retardo (min)', 'SLA (hs)', 'Auto-cierre'];

type RuleCellProps = { r: IncidentRule; onChange: (klass: string, patch: Partial<IncidentRule>) => void };

function ActiveCell({ r, onChange }: RuleCellProps) {
  return (
    <td className="px-3 py-2">
      <button type="button" onClick={() => onChange(r.class, { enabled: !r.enabled })} className="block">
        <EstadoChip variant={r.enabled ? 'attention' : 'neutral'} label={r.enabled ? 'SÍ' : 'NO'} />
      </button>
    </td>
  );
}

function NumberCell({ value, min, max, onChange }: { value: number | ''; min: number; max?: number; onChange: (v: number | null) => void }) {
  return (
    <td className="px-3 py-2">
      <input type="number" min={min} max={max} value={value} placeholder="—"
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="w-16 rounded-[3px] border border-line-300 bg-white px-2 py-1 font-mono text-[11.5px] text-ink-700 outline-none focus:border-brand" />
    </td>
  );
}

function SeverityCell({ r, onChange }: RuleCellProps) {
  return (
    <td className="px-3 py-2">
      <select value={r.min_severity} onChange={(e) => onChange(r.class, { min_severity: e.target.value as IncidentRule['min_severity'] })}
        className="cursor-pointer rounded-[3px] border border-line-300 bg-white px-2 py-1 font-sans text-[11.5px] text-ink-700 outline-none focus:border-brand">
        <option value="critical">Crítico</option>
        <option value="warning">Advertencia</option>
      </select>
    </td>
  );
}

function AutoCloseCell({ r, onChange }: RuleCellProps) {
  return (
    <td className="px-3 py-2">
      <input type="checkbox" checked={r.auto_close_on_alerts_resolved} className="accent-brand"
        onChange={(e) => onChange(r.class, { auto_close_on_alerts_resolved: e.target.checked })} />
    </td>
  );
}

function RuleRow({ r, classOptions, onChange }: { r: IncidentRule; classOptions: AlertClassOption[]; onChange: (klass: string, patch: Partial<IncidentRule>) => void }) {
  return (
    <tr>
      <td className="px-3 py-2 font-sans font-semibold text-ink-900">{classOptions.find((c) => (c.id as string) === r.class)?.label ?? r.class}</td>
      <ActiveCell r={r} onChange={onChange} />
      <SeverityCell r={r} onChange={onChange} />
      <NumberCell value={r.delay_minutes} min={0} max={1440} onChange={(v) => onChange(r.class, { delay_minutes: v ?? 0 })} />
      <NumberCell value={r.sla_hours ?? ''} min={1} onChange={(v) => onChange(r.class, { sla_hours: v })} />
      <AutoCloseCell r={r} onChange={onChange} />
    </tr>
  );
}

function RulesTable({ rules, classOptions, onChange }: { rules: IncidentRule[]; classOptions: AlertClassOption[]; onChange: (klass: string, patch: Partial<IncidentRule>) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-[11.5px]">
        <thead className="border-b border-line-150 bg-surface-table-head">
          <tr>{HEAD_LABELS.map((h) => <th key={h} className="px-3 py-2 font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line-200">
          {rules.map((r) => <RuleRow key={r.class} r={r} classOptions={classOptions} onChange={onChange} />)}
        </tbody>
      </table>
    </div>
  );
}

function useGlobalRulesState() {
  const [rules, setRules] = useState<IncidentRule[]>([]);
  const [classOptions, setClassOptions] = useState<AlertClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  return { rules, setRules, classOptions, setClassOptions, loading, setLoading, saving, setSaving };
}

type GlobalRulesState = ReturnType<typeof useGlobalRulesState>;

function fetchGlobalRules(): Promise<{ rules: IncidentRule[]; classOptions: AlertClassOption[] }> {
  return Promise.all([
    api.get<IncidentRule[]>('/settings/system/incident-rules'),
    api.get<{ classes: AlertClassOption[] }>('/alerts/classes'),
  ]).then(([r, c]) => ({ rules: r, classOptions: c.classes }));
}

function toRulePayload(rules: IncidentRule[]) {
  return rules.map((r) => ({
    class: r.class, enabled: r.enabled, min_severity: r.min_severity,
    delay_minutes: r.delay_minutes, sla_hours: r.sla_hours, auto_close_on_alerts_resolved: r.auto_close_on_alerts_resolved,
  }));
}

function useLoadRules(st: GlobalRulesState) {
  const { setRules, setClassOptions, setLoading } = st;
  const load = useCallback(() => {
    setLoading(true);
    fetchGlobalRules()
      .then(({ rules: r, classOptions: c }) => { setRules(r); setClassOptions(c); })
      .catch(() => setRules([]))
      .finally(() => setLoading(false));
  }, [setRules, setClassOptions, setLoading]);
  useEffect(() => { load(); }, [load]);
  return load;
}

function useSaveRules(st: GlobalRulesState, load: () => void) {
  const { showToast } = useToast();
  const { setSaving } = st;
  return async () => {
    setSaving(true);
    try {
      await api.put('/settings/system/incident-rules', { rules: toRulePayload(st.rules) });
      showToast('Reglas globales actualizadas', 'success');
      load();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  };
}

function useGlobalRules() {
  const st = useGlobalRulesState();
  const load = useLoadRules(st);
  const save = useSaveRules(st, load);
  const updateRule = (klass: string, patch: Partial<IncidentRule>) => {
    st.setRules((prev) => prev.map((r) => (r.class === klass ? { ...r, ...patch } : r)));
  };
  return { rules: st.rules, classOptions: st.classOptions, loading: st.loading, saving: st.saving, updateRule, save };
}

/**
 * Reglas de auto-creación de incidentes GLOBALES (`client_id IS NULL`) —
 * cierre de gap post-verificación del handoff hifi #3, 26/08/2026. Antes
 * sólo existía `IncidentRulesCard` (por cliente, en `features/clients/`,
 * duplicado a propósito acá — el guard `arch-portal` bloquea importar entre
 * features): esta es la regla que de verdad aplica a un cliente SIN
 * override propio, y el destino real de "VER REGLA" en el banner de
 * Incidentes (antes navegaba a un cliente puntual como aproximación).
 * Sólo admin (`PUT /settings/system/incident-rules` es 403 para operator).
 */
function CardHeader({ activeCount, saving, onSave }: { activeCount: number; saving: boolean; onSave: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line-150 px-5 py-[14px]">
      <div>
        <div className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">REGLAS DE INCIDENTES GLOBALES</div>
        <div className="mt-[5px] font-sans text-[11.5px] text-ink-300">Aplican a todos los clientes sin una regla propia para esa clase</div>
      </div>
      <div className="flex items-center gap-2.5">
        <EstadoChip label={activeCount > 0 ? `${activeCount} activas` : 'SIN CONFIGURAR'} variant={activeCount > 0 ? 'attention' : 'neutral'} />
        <button type="button" onClick={onSave} disabled={saving} className={BTN_PRIMARY_SM}>{saving ? 'GUARDANDO…' : 'GUARDAR'}</button>
      </div>
    </div>
  );
}

export default function GlobalIncidentRulesCard() {
  const s = useGlobalRules();
  const activeCount = s.rules.filter((r) => r.enabled).length;

  return (
    <div id="global-incident-rules" className="flex flex-col rounded-[5px] border border-line-100 bg-white">
      <CardHeader activeCount={activeCount} saving={s.saving} onSave={s.save} />
      <div className="px-5 py-[18px]">
        {s.loading ? (
          <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-brand" /></div>
        ) : (
          <RulesTable rules={s.rules} classOptions={s.classOptions} onChange={s.updateRule} />
        )}
      </div>
    </div>
  );
}

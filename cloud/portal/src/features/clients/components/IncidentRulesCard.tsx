import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../../../shared/lib/api';
import { useToast } from '../../../store/ToastContext';
import ConfigCardShell from './ConfigCardShell';
import EstadoChip from '../../../shared/components/EstadoChip';
import type { IncidentRule } from '../../../shared/types/incidents';
import type { AlertClassOption } from '../../../shared/types/alerts';
import { APP_LOCALE } from '../../../shared/lib/formatters';

/**
 * Reglas de auto-creación de incidentes por cliente (Fase 11 del gap
 * analysis vs HP SDS). Filas sembradas globales (`client_id: null`) llegan
 * con `enabled=false` — este panel es lo único que las convierte en una
 * fila propia del cliente al guardar (el backend hace upsert, ver
 * `incidentService.upsertIncidentRule`). Oculto para `client_viewer`
 * (`canEdit=false` en `ClientDetail.tsx`, mismo criterio que `ApiKeysCard`).
 */
export default function IncidentRulesCard({ clientId, canEdit }: { clientId: string; canEdit: boolean }) {
  const { showToast } = useToast();
  const [rules, setRules] = useState<IncidentRule[]>([]);
  const [classOptions, setClassOptions] = useState<AlertClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<IncidentRule[]>(`/clients/${clientId}/incident-rules`),
      api.get<{ classes: AlertClassOption[] }>('/alerts/classes'),
    ])
      .then(([r, c]) => { setRules(r); setClassOptions(c.classes); })
      .catch(() => { setRules([]); })
      .finally(() => setLoading(false));
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const updateRule = (klass: string, patch: Partial<IncidentRule>) => {
    setRules((prev) => prev.map((r) => (r.class === klass ? { ...r, ...patch } : r)));
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/clients/${clientId}/incident-rules`, {
        rules: rules.map((r) => ({
          class: r.class, enabled: r.enabled, min_severity: r.min_severity,
          delay_minutes: r.delay_minutes, sla_hours: r.sla_hours, auto_close_on_alerts_resolved: r.auto_close_on_alerts_resolved,
        })),
      });
      showToast('Reglas de incidentes actualizadas', 'success');
      load();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit) return null;

  const activeCount = rules.filter((r) => r.enabled).length;
  const lastEdited = rules.reduce<string | null>((max, r) => (!max || r.updated_at > max ? r.updated_at : max), null);

  return (
    <ConfigCardShell
      title="Reglas de incidentes automáticos"
      status={{ label: activeCount > 0 ? `${activeCount} activas` : 'SIN CONFIGURAR', active: activeCount > 0 }}
      meta={lastEdited ? `Última edición ${new Date(lastEdited).toLocaleDateString(APP_LOCALE)}` : 'Sin ediciones'}
      cta={{ label: saving ? 'Guardando…' : 'Administrar', onClick: save }}
    >
      <p className="mb-4 font-sans text-[12.5px] text-ink-400">
        Opt-in por clase de alerta: si está activo, una alerta que cumpla la severidad mínima abre (o agrupa en) un incidente automático para este cliente.
      </p>
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-brand" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[11.5px]">
            <thead className="border-b border-line-150 bg-surface-table-head">
              <tr>
                <th className="px-3 py-2 font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">Clase</th>
                <th className="px-3 py-2 font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">Activo</th>
                <th className="px-3 py-2 font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">Severidad mínima</th>
                <th className="px-3 py-2 font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">Retardo (min)</th>
                <th className="px-3 py-2 font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">SLA (hs)</th>
                <th className="px-3 py-2 font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">Auto-cierre</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-200">
              {rules.map((r) => (
                <tr key={r.class}>
                  <td className="px-3 py-2 font-sans font-semibold text-ink-900">{classOptions.find((c) => (c.id as string) === r.class)?.label ?? r.class}</td>
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => updateRule(r.class, { enabled: !r.enabled })} className="block">
                      <EstadoChip variant={r.enabled ? 'attention' : 'neutral'} label={r.enabled ? 'SÍ' : 'NO'} />
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <select value={r.min_severity} onChange={(e) => updateRule(r.class, { min_severity: e.target.value as IncidentRule['min_severity'] })}
                      className="cursor-pointer rounded-[3px] border border-line-300 bg-white px-2 py-1 font-sans text-[11.5px] text-ink-700 outline-none focus:border-brand">
                      <option value="critical">Crítico</option>
                      <option value="warning">Advertencia</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" min={0} max={1440} value={r.delay_minutes}
                      onChange={(e) => updateRule(r.class, { delay_minutes: Number(e.target.value) })}
                      className="w-16 rounded-[3px] border border-line-300 bg-white px-2 py-1 font-mono text-[11.5px] text-ink-700 outline-none focus:border-brand" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" min={1} value={r.sla_hours ?? ''} placeholder="—"
                      onChange={(e) => updateRule(r.class, { sla_hours: e.target.value ? Number(e.target.value) : null })}
                      className="w-16 rounded-[3px] border border-line-300 bg-white px-2 py-1 font-mono text-[11.5px] text-ink-700 outline-none focus:border-brand" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={r.auto_close_on_alerts_resolved} className="accent-brand"
                      onChange={(e) => updateRule(r.class, { auto_close_on_alerts_resolved: e.target.checked })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ConfigCardShell>
  );
}

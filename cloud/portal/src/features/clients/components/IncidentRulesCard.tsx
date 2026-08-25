import { useState, useEffect, useCallback } from 'react';
import { AlertOctagon, Loader2, Save } from 'lucide-react';
import { api } from '../../../shared/lib/api';
import { useToast } from '../../../store/ToastContext';
import type { IncidentRule } from '../../../shared/types/incidents';
import type { AlertClassOption } from '../../../shared/types/alerts';

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

  return (
    <div className="cd-panel p-8">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-black text-[#1a2333] tracking-tight flex items-center gap-3">
          <div className="p-2 bg-brand/10 text-brand rounded-xl"><AlertOctagon size={18} /></div>
          Reglas de Incidentes Automáticos
        </h3>
        <button onClick={save} disabled={saving || loading} className="flex items-center gap-2 px-4 py-2 bg-brand hover:bg-brand-hover text-white rounded-xl text-[11px] font-black uppercase tracking-wider transition-all disabled:opacity-50">
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar
        </button>
      </div>
      <p className="text-xs text-slate-500 font-medium mb-4">
        Opt-in por clase de alerta: si está activo, una alerta que cumpla la severidad mínima abre (o agrupa en) un incidente automático para este cliente.
      </p>
      {loading ? (
        <div className="py-10 flex justify-center"><Loader2 size={24} className="text-brand animate-spin" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px] border-collapse">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="py-2 px-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Clase</th>
                <th className="py-2 px-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Activo</th>
                <th className="py-2 px-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Severidad mínima</th>
                <th className="py-2 px-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Retardo (min)</th>
                <th className="py-2 px-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">SLA (hs)</th>
                <th className="py-2 px-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Auto-cierre</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rules.map((r) => (
                <tr key={r.class}>
                  <td className="py-2 px-3 font-bold text-slate-700">{classOptions.find((c) => (c.id as string) === r.class)?.label ?? r.class}</td>
                  <td className="py-2 px-3">
                    <button
                      onClick={() => updateRule(r.class, { enabled: !r.enabled })}
                      className={`px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wider transition-all ${
                        r.enabled ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}
                    >
                      {r.enabled ? 'Sí' : 'No'}
                    </button>
                  </td>
                  <td className="py-2 px-3">
                    <select value={r.min_severity} onChange={(e) => updateRule(r.class, { min_severity: e.target.value as IncidentRule['min_severity'] })}
                      className="bg-slate-50 text-slate-700 text-[11px] font-bold px-2 py-1 rounded-lg border border-slate-100 outline-none focus:border-brand cursor-pointer">
                      <option value="critical">Crítico</option>
                      <option value="warning">Advertencia</option>
                    </select>
                  </td>
                  <td className="py-2 px-3">
                    <input type="number" min={0} max={1440} value={r.delay_minutes}
                      onChange={(e) => updateRule(r.class, { delay_minutes: Number(e.target.value) })}
                      className="w-16 bg-slate-50 text-slate-700 text-[11px] font-bold px-2 py-1 rounded-lg border border-slate-100 outline-none focus:border-brand" />
                  </td>
                  <td className="py-2 px-3">
                    <input type="number" min={1} value={r.sla_hours ?? ''} placeholder="—"
                      onChange={(e) => updateRule(r.class, { sla_hours: e.target.value ? Number(e.target.value) : null })}
                      className="w-16 bg-slate-50 text-slate-700 text-[11px] font-bold px-2 py-1 rounded-lg border border-slate-100 outline-none focus:border-brand" />
                  </td>
                  <td className="py-2 px-3">
                    <input type="checkbox" checked={r.auto_close_on_alerts_resolved}
                      onChange={(e) => updateRule(r.class, { auto_close_on_alerts_resolved: e.target.checked })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { Loader2, PackageSearch, Save } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../context/ToastContext';

interface Settings { enabled: boolean; threshold_pct: number; }

/**
 * Opt-in de pedidos automáticos de consumibles por cliente (Fase 4.2 del
 * gap analysis vs HP SDS). Mismo criterio que IncidentRulesCard: oculto
 * para client_viewer, default deshabilitado.
 */
export default function SupplyRequestSettingsCard({ clientId, canEdit }: { clientId: string; canEdit: boolean }) {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api.get<Settings>(`/clients/${clientId}/supply-request-settings`)
      .then(setSettings)
      .catch(() => setSettings(null));
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await api.put(`/clients/${clientId}/supply-request-settings`, settings);
      showToast('Configuración de pedidos actualizada', 'success');
    } catch (err) {
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
          <div className="p-2 bg-brand/10 text-brand rounded-xl"><PackageSearch size={18} /></div>
          Pedidos Automáticos de Consumibles
        </h3>
        <button onClick={save} disabled={saving || !settings}
          className="flex items-center gap-2 px-4 py-2 bg-brand hover:bg-brand-hover text-white rounded-xl text-[11px] font-black uppercase tracking-wider transition-all disabled:opacity-50">
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar
        </button>
      </div>
      <p className="text-xs text-slate-500 font-medium mb-4">
        Si está activo, un consumible que cae bajo el umbral abre un pedido automático,
        y el pedido se completa solo cuando el nivel vuelve a subir (cartucho reemplazado).
      </p>
      {!settings ? (
        <div className="py-6 flex justify-center"><Loader2 size={20} className="text-brand animate-spin" /></div>
      ) : (
        <div className="flex items-center gap-6">
          <button onClick={() => setSettings({ ...settings, enabled: !settings.enabled })}
            className={`px-3 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider transition-all ${
              settings.enabled ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-500 border border-slate-200'
            }`}>
            {settings.enabled ? 'Activo' : 'Inactivo'}
          </button>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
            Umbral
            <input type="number" min={1} max={99} value={settings.threshold_pct}
              onChange={(e) => setSettings({ ...settings, threshold_pct: Number(e.target.value) })}
              className="w-16 bg-slate-50 text-slate-700 text-[12px] font-bold px-2 py-1 rounded-lg border border-slate-100 outline-none focus:border-brand" />
            %
          </label>
        </div>
      )}
    </div>
  );
}

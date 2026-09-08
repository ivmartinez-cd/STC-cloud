import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../../../shared/lib/api';
import { useToast } from '../../../store/ToastContext';
import ConfigCardShell from './ConfigCardShell';
import EstadoChip from '../../../shared/components/EstadoChip';

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
    <ConfigCardShell
      title="Pedidos automáticos de consumibles"
      status={{ label: settings?.enabled ? 'ACTIVO' : 'SIN CONFIGURAR', active: !!settings?.enabled }}
      meta=""
      cta={{ label: saving ? 'Guardando…' : 'Administrar', onClick: save }}
    >
      <p className="mb-4 font-sans text-[12.5px] text-ink-400">
        Si está activo, un consumible que cae bajo el umbral abre un pedido automático,
        y el pedido se completa solo cuando el nivel vuelve a subir (cartucho reemplazado).
      </p>
      {!settings ? (
        <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-brand" /></div>
      ) : (
        <div className="flex items-center gap-5">
          <button type="button" onClick={() => setSettings({ ...settings, enabled: !settings.enabled })} className="block">
            <EstadoChip variant={settings.enabled ? 'attention' : 'neutral'} label={settings.enabled ? 'ACTIVO' : 'INACTIVO'} />
          </button>
          <label className="flex items-center gap-2 font-sans text-[12.5px] font-semibold text-ink-600">
            Umbral
            <input type="number" min={1} max={99} value={settings.threshold_pct}
              onChange={(e) => setSettings({ ...settings, threshold_pct: Number(e.target.value) })}
              className="w-16 rounded-[3px] border border-line-300 bg-white px-2 py-1 font-mono text-[12.5px] text-ink-700 outline-none focus:border-brand" />
            %
          </label>
        </div>
      )}
    </ConfigCardShell>
  );
}

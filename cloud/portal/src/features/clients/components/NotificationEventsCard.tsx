import { useState, useEffect, useCallback } from 'react';
import { BellRing, Loader2, Save } from 'lucide-react';
import { api } from '../../../shared/lib/api';
import { useToast } from '../../../store/ToastContext';

const ALL_EVENTS = [
  'alert.created', 'incident.created',
  'supply_request.created', 'supply_request.completed', 'report.closed',
  'alert.digest',
] as const;

const EVENT_LABELS: Record<string, string> = {
  'alert.created': 'Alertas críticas',
  'incident.created': 'Incidentes abiertos',
  'supply_request.created': 'Pedidos de consumibles (nuevos)',
  'supply_request.completed': 'Pedidos de consumibles (completados)',
  'report.closed': 'Cierres mensuales',
  'alert.digest': 'Resumen diario de alertas (07:00)',
};

/**
 * Opt-out de notificaciones por evento (Fase 4.3 del gap analysis vs HP
 * SDS — el "Activo sí/no por activador" del SDS). Aplica al email/webhook
 * del cliente; los webhooks de la API pública tienen su propio filtro.
 */
export default function NotificationEventsCard({ clientId, canEdit }: { clientId: string; canEdit: boolean }) {
  const { showToast } = useToast();
  const [events, setEvents] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api.get<{ notification_events?: string[] }>(`/clients/${clientId}`)
      .then((c) => setEvents(Array.isArray(c.notification_events) ? c.notification_events : [...ALL_EVENTS]))
      .catch(() => setEvents(null));
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const toggle = (event: string) => {
    if (!events) return;
    setEvents(events.includes(event) ? events.filter((e) => e !== event) : [...events, event]);
  };

  const save = async () => {
    if (!events) return;
    setSaving(true);
    try {
      await api.put(`/clients/${clientId}`, { notification_events: events });
      showToast('Eventos de notificación actualizados', 'success');
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
          <div className="p-2 bg-brand/10 text-brand rounded-xl"><BellRing size={18} /></div>
          Eventos Notificados
        </h3>
        <button onClick={save} disabled={saving || !events}
          className="flex items-center gap-2 px-4 py-2 bg-brand hover:bg-brand-hover text-white rounded-xl text-[11px] font-black uppercase tracking-wider transition-all disabled:opacity-50">
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar
        </button>
      </div>
      <p className="text-xs text-slate-500 font-medium mb-4">
        Qué eventos llegan al email/webhook de este cliente. Destildar un evento lo silencia (el historial en el portal no cambia).
      </p>
      {!events ? (
        <div className="py-6 flex justify-center"><Loader2 size={20} className="text-brand animate-spin" /></div>
      ) : (
        <div className="space-y-2">
          {ALL_EVENTS.map((event) => (
            <label key={event} className="flex items-center gap-3 text-xs font-bold text-slate-600 cursor-pointer">
              <input type="checkbox" checked={events.includes(event)} onChange={() => toggle(event)} />
              {EVENT_LABELS[event]}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../../../shared/lib/api';
import { useToast } from '../../../store/ToastContext';
import ConfigCardShell from './ConfigCardShell';

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

  const silenced = events ? ALL_EVENTS.length - events.length : 0;

  return (
    <ConfigCardShell
      title="Eventos notificados"
      status={{ label: events ? `${events.length} de ${ALL_EVENTS.length}` : '—', active: true }}
      meta={events ? `${silenced} evento${silenced === 1 ? '' : 's'} silenciado${silenced === 1 ? '' : 's'}` : '—'}
      cta={{ label: saving ? 'Guardando…' : 'Administrar', onClick: save }}
    >
      <p className="mb-4 font-sans text-[12.5px] text-ink-400">
        Qué eventos llegan al email/webhook de este cliente. Destildar un evento lo silencia (el historial en el portal no cambia).
      </p>
      {!events ? (
        <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-brand" /></div>
      ) : (
        <div className="space-y-2">
          {ALL_EVENTS.map((event) => (
            <label key={event} className="flex cursor-pointer items-center gap-3 font-sans text-[12.5px] font-semibold text-ink-700">
              <input type="checkbox" checked={events.includes(event)} onChange={() => toggle(event)} className="accent-brand" />
              {EVENT_LABELS[event]}
            </label>
          ))}
        </div>
      )}
    </ConfigCardShell>
  );
}

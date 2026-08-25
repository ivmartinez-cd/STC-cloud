import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardTitle } from './primitives';
import { formatRelativeTime } from '../../../../shared/lib/formatters';
import { api } from '../../../../shared/lib/api';
import { alertTierOf, ALERT_TIER_STYLE } from '../../lib/deviceAlertTier';
import type { Alert, AlertClassOption } from '../../../../shared/types/alerts';
import type { ActiveAlertItem } from '../../types/deviceDetailPage';

const PREVIEW_COUNT = 4;

function closedThisMonth(alerts: Alert[], deviceId: string): number {
  const now = new Date();
  return alerts.filter((a) => a.device_id === deviceId && a.resolved && a.resolved_at
    && new Date(a.resolved_at).getMonth() === now.getMonth() && new Date(a.resolved_at).getFullYear() === now.getFullYear()).length;
}

const MONTH_LONG_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "Alertas actuales" (handoff hifi "Dispositivo — detalle") — border-top
 * naranja oscuro (tarjeta prioritaria), severidad ALTA/MEDIA/BAJA derivada de
 * `alertTierOf`. El título usa el label de clase (`GET /alerts/classes`, única
 * fuente de verdad) cuando el ítem viene de servidor; la explicación es el
 * mensaje crudo — nunca se fabrica una redacción que el dato no tiene. */
export default function DeviceAlertsCard({ activeAlerts, allAlerts, deviceId }: { activeAlerts: ActiveAlertItem[]; allAlerts: Alert[]; deviceId: string }) {
  const [classLabels, setClassLabels] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    api.get<{ classes: AlertClassOption[] }>('/alerts/classes').then((d) => setClassLabels(new Map(d.classes.map((c) => [c.id, c.label])))).catch(() => {});
  }, []);

  const closed = closedThisMonth(allAlerts, deviceId);
  const monthLabel = MONTH_LONG_ES[new Date().getMonth()];

  return (
    <Card className="border-t-[3px] !border-t-brand-severe">
      <CardTitle right={<span className="font-sans text-[11.5px] text-ink-300">{activeAlerts.length} abiertas</span>}>Alertas actuales</CardTitle>
      <div className="px-5 pb-4 pt-2">
        {activeAlerts.length === 0 && <p className="py-4 text-center font-sans text-[12.5px] text-ink-300">No hay alertas actuales para este equipo.</p>}
        {activeAlerts.slice(0, PREVIEW_COUNT).map((a) => {
          const tier = alertTierOf(a.severity, a.alertClass);
          const style = ALERT_TIER_STYLE[tier];
          const title = (a.alertClass && classLabels.get(a.alertClass)) || a.message;
          return (
            <div key={a.key} className="border-b border-line-200 py-3 last:border-0">
              <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
                <span className={`inline-flex items-center gap-[7px] rounded-[2px] ${style.bg} px-2 py-[3px] font-montserrat text-[9px] font-semibold uppercase tracking-[.08em] ${style.fg}`}>
                  <span className={`block h-1.5 w-1.5 rounded-full ${style.dot}`} />{tier}
                </span>
                <span className="font-sans text-[12px] font-semibold text-ink-900">{title}</span>
                <div className="flex-1" />
                {a.time && <span className="font-sans text-[11.5px] text-ink-300">{formatRelativeTime(a.time).toLowerCase()}</span>}
              </div>
              {title !== a.message && <div className="font-sans text-[12px] leading-[1.5] text-ink-400">{a.message}</div>}
            </div>
          );
        })}
        <div className="flex items-center justify-between pt-3">
          <span className="font-sans text-[11.5px] text-ink-300">{closed} alertas cerradas en {monthLabel}</span>
          <Link to={`/alerts?device_id=${deviceId}`} className="font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent hover:underline">Ver todas →</Link>
        </div>
      </div>
    </Card>
  );
}

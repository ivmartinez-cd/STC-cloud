import type { Client, Monitor, UsageMonth } from '../../../shared/types/monitor';
import ZoneLabel from '../../../shared/components/ZoneLabel';
import DuplicateDevicesCard from './DuplicateDevicesCard';
import ClientUsageChart from './ClientUsageChart';
import NotificationSettingsCard from './NotificationSettingsCard';
import DeviceApprovalCard from './DeviceApprovalCard';
import ClientMonitorsSection from './ClientMonitorsSection';

interface Props {
  client: Client;
  usage: UsageMonth[];
  monitors: Monitor[];
  now: number;
  isReadOnlyViewer: boolean;
  onSaveNotifications: (fields: { notification_email: string; notification_webhook_url: string }) => Promise<void>;
  onToggleDeviceApproval: (value: boolean) => Promise<void>;
  onCreateMonitor: () => void;
  onDeleteMonitor: (monitor: { id: string; name: string }) => void;
}

/** Tab "Resumen" completa (rediseño sin scroll, 27/08/2026): dos columnas que
 * llenan el alto que deja la tarjeta de identidad. Izquierda (1.5fr): la zona
 * "Requiere atención" — duplicados (4 pares por página) y, creciendo hasta el
 * pie, los monitores instalados (filas según alto disponible). Derecha (1fr):
 * consumo mensual, notificaciones y registro de dispositivos, de altura fija.
 * Antes eran 3 bandas apiladas y la lista de duplicados empujaba todo lo demás
 * fuera de la pantalla. */
export default function ClientAttentionZone({
  client, usage, monitors, now, isReadOnlyViewer, onSaveNotifications, onToggleDeviceApproval, onCreateMonitor, onDeleteMonitor,
}: Props) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 min-[1100px]:grid-cols-[1.5fr_1fr]">
      <section className="flex min-h-0 flex-col gap-3.5">
        <ZoneLabel text="Requiere atención" lineColorClass="bg-brand-severe" />
        {!isReadOnlyViewer && <DuplicateDevicesCard clientId={client.id} />}
        <ClientMonitorsSection
          monitors={monitors} now={now} isReadOnlyViewer={isReadOnlyViewer}
          onCreateClick={onCreateMonitor} onDeleteClick={onDeleteMonitor}
        />
      </section>

      <section className="flex min-h-0 flex-col gap-3.5">
        <ZoneLabel text="Consumo y canales" lineColorClass="bg-brand-gray" />
        <ClientUsageChart usage={usage} />
        <NotificationSettingsCard
          email={client.notification_email} webhookUrl={client.notification_webhook_url}
          canEdit={!isReadOnlyViewer} onSave={onSaveNotifications}
        />
        {!isReadOnlyViewer && (
          <DeviceApprovalCard
            clientId={client.id} canEdit={!isReadOnlyViewer}
            requireApproval={client.device_approval_required} onToggleRequireApproval={onToggleDeviceApproval}
          />
        )}
      </section>
    </div>
  );
}

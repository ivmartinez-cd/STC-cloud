import type { Client, UsageMonth } from '../../../shared/types/monitor';
import ZoneLabel from './ZoneLabel';
import DuplicateDevicesCard from './DuplicateDevicesCard';
import ClientUsageChart from './ClientUsageChart';
import NotificationSettingsCard from './NotificationSettingsCard';
import DeviceApprovalCard from './DeviceApprovalCard';

/** Zona "Requiere atención" completa (handoff hifi "Cliente — detalle", 25/08/2026):
 * duplicados + consumo mensual (grid 1.5fr/1fr) y notificaciones + registro de
 * dispositivos (grid 1fr/1fr) debajo. Sólo en la tab "Resumen" (no tiene tab propia). */
export default function ClientAttentionZone({
  client, usage, isReadOnlyViewer, onSaveNotifications, onToggleDeviceApproval,
}: {
  client: Client;
  usage: UsageMonth[];
  isReadOnlyViewer: boolean;
  onSaveNotifications: (fields: { notification_email: string; notification_webhook_url: string }) => Promise<void>;
  onToggleDeviceApproval: (value: boolean) => Promise<void>;
}) {
  return (
    <section className="space-y-3.5">
      <ZoneLabel text="Requiere atención" lineColorClass="bg-brand-severe" />

      <div className="grid grid-cols-1 gap-4 min-[1100px]:grid-cols-[1.5fr_1fr]">
        {!isReadOnlyViewer && <DuplicateDevicesCard clientId={client.id} />}
        <ClientUsageChart usage={usage} />
      </div>

      <div className="grid grid-cols-1 gap-4 min-[1100px]:grid-cols-2">
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
      </div>
    </section>
  );
}

import ZoneLabel from './ZoneLabel';
import ApiKeysCard from './ApiKeysCard';
import CustomFieldsCard from './CustomFieldsCard';
import IncidentRulesCard from './IncidentRulesCard';
import SupplyRequestSettingsCard from './SupplyRequestSettingsCard';
import NotificationEventsCard from './NotificationEventsCard';

/** Zona "Configuración de la cuenta" completa (rótulo + grilla de 5 tarjetas) —
 * reusada tal cual en "Resumen" y en la tab "Configuración" a pantalla completa. */
export default function ClientConfigZone({ clientId, canEdit }: { clientId: string; canEdit: boolean }) {
  return (
    <section className="space-y-3.5">
      <ZoneLabel text="Configuración de la cuenta" lineColorClass="bg-brand-gray" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
        <ApiKeysCard clientId={clientId} canEdit={canEdit} />
        <CustomFieldsCard clientId={clientId} canEdit={canEdit} />
        <IncidentRulesCard clientId={clientId} canEdit={canEdit} />
        <SupplyRequestSettingsCard clientId={clientId} canEdit={canEdit} />
        <NotificationEventsCard clientId={clientId} canEdit={canEdit} />
      </div>
    </section>
  );
}

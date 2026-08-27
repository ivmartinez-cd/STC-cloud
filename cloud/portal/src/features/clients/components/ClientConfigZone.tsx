import ZoneLabel from '../../../shared/components/ZoneLabel';
import ApiKeysCard from './ApiKeysCard';
import CustomFieldsCard from './CustomFieldsCard';
import IncidentRulesCard from './IncidentRulesCard';
import SupplyRequestSettingsCard from './SupplyRequestSettingsCard';
import NotificationEventsCard from './NotificationEventsCard';
import SftpDestinationCard from './SftpDestinationCard';

/** Zona "Configuración de la cuenta" (tab "Configuración"): 6 tarjetas en una
 * grilla fija de 3×2 que reparte el alto disponible (27/08/2026, rediseño sin
 * scroll) — antes `auto-fit` apilaba 2 filas de altura libre y la segunda
 * quedaba fuera de pantalla. Cada celda recorta (`overflow-hidden`) en vez de
 * abrir scroll; las listas internas se paginan (reglas de incidente). */
export default function ClientConfigZone({ clientId, canEdit }: { clientId: string; canEdit: boolean }) {
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3.5">
      <ZoneLabel text="Configuración de la cuenta" lineColorClass="bg-brand-gray" />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-2 md:grid-rows-3 xl:grid-cols-3 xl:grid-rows-2">
        <div className="min-h-0 overflow-hidden"><ApiKeysCard clientId={clientId} canEdit={canEdit} /></div>
        <div className="min-h-0 overflow-hidden"><CustomFieldsCard clientId={clientId} canEdit={canEdit} /></div>
        <div className="min-h-0 overflow-hidden"><IncidentRulesCard clientId={clientId} canEdit={canEdit} /></div>
        <div className="min-h-0 overflow-hidden"><SupplyRequestSettingsCard clientId={clientId} canEdit={canEdit} /></div>
        <div className="min-h-0 overflow-hidden"><NotificationEventsCard clientId={clientId} canEdit={canEdit} /></div>
        <div className="min-h-0 overflow-hidden"><SftpDestinationCard clientId={clientId} canEdit={canEdit} /></div>
      </div>
    </section>
  );
}

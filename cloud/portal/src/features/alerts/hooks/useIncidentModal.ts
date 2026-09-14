import { useState } from 'react';
import type { Alert } from '../../../shared/types/alerts';
import { deriveIncidentContext, type AlertsPageState } from './useAlertsPage';

/**
 * Incidente manual: fila puntual (`rowAlert`) o selección en bloque (`bulkIds`) —
 * mismo modal, contexto distinto. Nunca ambos a la vez. Compartido por la
 * pantalla de Alertas y por la pestaña "Alertas" de la ficha de cliente.
 */
export function useIncidentModal(s: Pick<AlertsPageState, 'selectedAlerts'>) {
  const [rowAlert, setRowAlert] = useState<Alert | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const bulkAlerts = bulkOpen ? s.selectedAlerts() : [];
  const isOpen = !!rowAlert || bulkOpen;
  const close = () => { setRowAlert(null); setBulkOpen(false); };
  const ctx = rowAlert
    ? { clientId: rowAlert.client_id ?? undefined, deviceId: rowAlert.device_id ?? undefined, alertClass: rowAlert.alert_class ?? undefined, alertIds: [rowAlert.id] }
    : { ...deriveIncidentContext(bulkAlerts), alertIds: bulkAlerts.map((a) => a.id) };
  return { rowAlert, setRowAlert, bulkOpen, setBulkOpen, isOpen, close, ctx };
}

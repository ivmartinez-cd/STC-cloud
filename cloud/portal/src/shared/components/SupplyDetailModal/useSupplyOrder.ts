import { useState } from 'react';
import { api } from '../../lib/api';
import { useToast } from '../../../store/ToastContext';
import type { SupplyHistory } from '../../types/supplyHistory';

function payloadFor(history: SupplyHistory) {
  return {
    client_id: history.device.client_id,
    device_id: history.device.id,
    supply_key: history.supply.key,
    supply_kind: history.supply.kind,
    supply_color: history.supply.color,
    description: history.supply.description,
    sku: history.supply.code,
  };
}

/**
 * "Pedir consumible" desde el modal: crea un pedido MANUAL enganchado al
 * `supply_key` real del insumo (no al `manual:<kind>:<color>` genérico), así
 * la solicitud aparece en el historial de este mismo modal.
 */
export function useSupplyOrder(history: SupplyHistory | null, onCreated: () => void) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  const order = async () => {
    if (!history?.device.client_id) return;
    setBusy(true);
    try {
      await api.post('/supply-requests', payloadFor(history));
      showToast('Pedido creado', 'success');
      onCreated();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo crear el pedido', 'error');
    } finally {
      setBusy(false);
    }
  };

  return { order, busy };
}

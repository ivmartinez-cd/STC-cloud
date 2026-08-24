/**
 * Cola de registro de dispositivos (Fase 7 del gap analysis vs HP SDS). La
 * lógica vive en `services/deviceRegistrationService.ts` (dominio
 * `pending-devices`, todavía repartido entre agentService/deviceController —
 * ver Fase 3 del plan); las rutas `/clients/:id/pending-devices*` son
 * presentación del cliente y delegan acá. Cuando exista `modules/pending-devices`,
 * este puerto se implementa con su fachada y estas rutas pueden mudarse.
 * Los resultados se devuelven tal cual (wire shape del servicio).
 */
export interface ListPendingDevicesQuery {
  clientId: string;
  limit?: number;
  offset?: number;
  q?: string;
  agentId?: string;
}

export interface PendingDeviceActionInput {
  clientId: string;
  deviceIds: string[];
  actorId: string | null;
  ip: string | null;
}

export interface DeviceRegistrationGateway {
  listPending(query: ListPendingDevicesQuery): Promise<unknown>;
  register(input: PendingDeviceActionInput): Promise<unknown>;
  ignore(input: PendingDeviceActionInput & { reason: string }): Promise<unknown>;
}

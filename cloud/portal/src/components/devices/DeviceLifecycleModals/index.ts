/**
 * Modales de ciclo de vida de dispositivo (§2.4 del gap analysis): editar,
 * dar de baja, mover y fusionar, más sus variantes en bloque (Fase 9). Todos
 * usan el chrome existente (`BrandModal`/`ConfirmationModal`) — sin
 * componentes de UI nuevos.
 */
export { EditDeviceModal } from './EditDeviceModal';
export { DecommissionDeviceModal } from './DecommissionDeviceModal';
export { MoveDeviceModal } from './MoveDeviceModal';
export { BulkDecommissionModal } from './BulkDecommissionModal';
export { BulkRecommissionModal } from './BulkRecommissionModal';
export { BulkMoveDevicesModal } from './BulkMoveDevicesModal';
export { BulkMonitorStateModal } from './BulkMonitorStateModal';
export { MergeDeviceModal } from './MergeDeviceModal';
export type { ClientOption, AgentOption, BulkActionResult } from './types';

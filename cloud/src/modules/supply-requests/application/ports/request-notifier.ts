import type { SupplyRequest } from "../../domain/entities/supply-request";

/** Puerto de salida: notificación de pedidos creados/completados (cola BullMQ). */
export interface RequestNotifier {
  created(request: SupplyRequest): Promise<void>;
  completed(request: SupplyRequest): Promise<void>;
}

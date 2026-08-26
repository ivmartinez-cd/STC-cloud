import type { AlertRepository } from "../../domain/repositories/alert-repository";
import type { ListAlertsInput } from "../dtos/alert-dtos";
import { toAlertFilters } from "./list-alerts";

/** `GET /alerts/count` — total real de `GET /alerts` con los mismos filtros, sin
 * paginar (handoff hifi #3, 26/08/2026). Antes la paginación de Alertas era "ciega". */
export class CountAlertsUseCase {
  constructor(private readonly alerts: AlertRepository) {}

  execute(input: ListAlertsInput): Promise<number> {
    return this.alerts.countMatching(input.scope, toAlertFilters(input));
  }
}

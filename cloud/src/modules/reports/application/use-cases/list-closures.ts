import type { ReportClosure } from "../../domain/entities/report-closure";
import type { ReportClosureRepository } from "../../domain/repositories/report-closure-repository";

/** `GET /clients/:id/reports` — historial de cierres del cliente, más reciente primero. */
export class ListClosuresUseCase {
  constructor(private readonly closures: ReportClosureRepository) {}

  execute(clientId: string): Promise<ReportClosure[]> {
    return this.closures.listByClient(clientId);
  }
}

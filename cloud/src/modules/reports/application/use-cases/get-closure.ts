import { ClosureNotFoundError } from "../../domain/errors/report-error";
import type { ReportClosureRepository } from "../../domain/repositories/report-closure-repository";
import type { ClosureDetail, ClosureLookupInput } from "../dtos/report-dtos";

/** `GET /clients/:id/reports/:closureId` — cierre + sus líneas (404 si no es del cliente). */
export class GetClosureUseCase {
  constructor(private readonly closures: ReportClosureRepository) {}

  async execute(input: ClosureLookupInput): Promise<ClosureDetail> {
    const closure = await this.closures.findOwned(input.closureId, input.clientId);
    if (!closure) throw new ClosureNotFoundError();
    const lines = await this.closures.findLines(closure.id);
    return { closure, lines };
  }
}

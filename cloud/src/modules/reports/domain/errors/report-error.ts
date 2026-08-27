import { AppError } from "../../../../shared/domain/errors";

/** Error de dominio con el status HTTP que le corresponde en el borde (mismo criterio que `AlertError`). */
export class ReportError extends AppError {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "ReportError";
  }
}

export class InvalidPeriodError extends ReportError {
  constructor() {
    super("Período inválido, se espera YYYY-MM", 400);
    this.name = "InvalidPeriodError";
  }
}

/** Ya hay un cierre `closed` para (client, period): nunca se sobreescribe, hay que reabrirlo primero. */
export class ClosurePeriodConflictError extends ReportError {
  constructor(period: string) {
    super(`Ya existe un cierre para ${period}. Reabrilo primero si necesitás uno nuevo.`, 409);
    this.name = "ClosurePeriodConflictError";
  }
}

export class ClosureNotFoundError extends ReportError {
  constructor() {
    super("Cierre no encontrado", 404);
    this.name = "ClosureNotFoundError";
  }
}

export class ClosureNotReopenableError extends ReportError {
  constructor() {
    super("Sólo se puede reabrir un cierre en estado 'closed'", 400);
    this.name = "ClosureNotReopenableError";
  }
}

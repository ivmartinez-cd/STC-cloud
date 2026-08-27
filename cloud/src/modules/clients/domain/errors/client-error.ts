import { AppError } from "../../../../shared/domain/errors";

/** Error de dominio con el status HTTP que le corresponde en el borde (mismo criterio que `AlertError`/`ReportError`). */
export class ClientError extends AppError {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "ClientError";
  }
}

export class ClientValidationError extends ClientError {
  constructor(message: string) {
    super(message, 400);
    this.name = "ClientValidationError";
  }
}

export class ClientNotFoundError extends ClientError {
  constructor(message = "Cliente no encontrado") {
    super(message, 404);
    this.name = "ClientNotFoundError";
  }
}

import { AppError } from "../../../../shared/domain/errors";

/** Error de dominio con el status HTTP que le corresponde en el borde (mismo criterio que `DeviceError`/`AlertError`). */
export class IncidentError extends AppError {
  statusCode: number;
  conflictId?: string;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

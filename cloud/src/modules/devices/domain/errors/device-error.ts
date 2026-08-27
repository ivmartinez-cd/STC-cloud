import { AppError } from "../../../../shared/domain/errors";

/** Error de dominio con el status HTTP que le corresponde en el borde. */
export class DeviceError extends AppError {
  constructor(message: string, public readonly statusCode: number, public readonly extra?: Record<string, unknown>) {
    super(message);
    this.name = "DeviceError";
  }
}

export class DeviceNotFoundError extends DeviceError {
  constructor(message = "Dispositivo no encontrado") {
    super(message, 404);
    this.name = "DeviceNotFoundError";
  }
}

export class DeviceValidationError extends DeviceError {
  constructor(message: string) {
    super(message, 400);
    this.name = "DeviceValidationError";
  }
}

/** Un registro fusionado (lápida) no se edita, no se mueve, no se da de baja ni se reactiva. */
export class DeviceMergedError extends DeviceError {
  constructor(message: string, extra?: Record<string, unknown>) {
    super(message, 409, extra);
    this.name = "DeviceMergedError";
  }
}

/** 409 genérico (colisión de serial en destino, historial de facturación, etc.). */
export class DeviceConflictError extends DeviceError {
  constructor(message: string, extra?: Record<string, unknown>) {
    super(message, 409, extra);
    this.name = "DeviceConflictError";
  }
}

/** Nombres conservados de `deviceMonitorService`/`deviceLifecycleService`/`deviceRegistrationService` — los consumidores externos los referencian. */
export class MonitorStateError extends DeviceError {
  constructor(message: string, statusCode = 400) {
    super(message, statusCode);
    this.name = "MonitorStateError";
  }
}

export class BulkActionError extends DeviceError {
  constructor(message: string, statusCode = 400) {
    super(message, statusCode);
    this.name = "BulkActionError";
  }
}

export class DeviceRegistrationError extends DeviceError {
  constructor(message: string, statusCode = 400) {
    super(message, statusCode);
    this.name = "DeviceRegistrationError";
  }
}

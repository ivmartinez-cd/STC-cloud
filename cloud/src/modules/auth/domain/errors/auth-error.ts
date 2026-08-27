import { AppError } from "../../../../shared/domain/errors";

/** Error de dominio con el status HTTP que le corresponde en el borde (mismo criterio que `DeviceError`/`ClientError`). */
export class AuthError extends AppError {
  constructor(message: string, public readonly statusCode: number, public readonly totpRequired = false) {
    super(message);
  }
}

export class InvalidCredentialsError extends AuthError {
  constructor(message = "Credenciales inválidas", totpRequired = false) {
    super(message, 401, totpRequired);
  }
}

export class UserDisabledError extends AuthError {
  constructor() { super("El usuario está desactivado", 401); }
}

export class TotpRequiredError extends AuthError {
  constructor() { super("Código de verificación requerido", 401, true); }
}

export class UsernameTakenError extends AuthError {
  constructor() { super("El nombre de usuario ya existe", 409); }
}

export class UserNotFoundError extends AuthError {
  constructor() { super("Usuario no encontrado", 404); }
}

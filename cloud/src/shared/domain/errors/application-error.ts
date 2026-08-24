import { AppError } from "./app-error";

// Errores de orquestación de casos de uso (permisos, recursos inexistentes),
// distintos de las violaciones de reglas de negocio del dominio.
export abstract class ApplicationError extends AppError {}

export class NotFoundError extends ApplicationError {}

export class UnauthorizedError extends ApplicationError {}

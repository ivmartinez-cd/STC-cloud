import { AppError } from "./app-error";

// Errores de reglas de negocio: son parte del modelo del dominio, no
// excepciones inesperadas (ARCHITECTURE_GUIDE.md §6).
export abstract class DomainError extends AppError {}

export class ValidationError extends DomainError {}

export class BusinessRuleViolationError extends DomainError {}

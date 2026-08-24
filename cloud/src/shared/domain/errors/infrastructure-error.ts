import { AppError } from "./app-error";

// Fallas de infraestructura (DB, servicios externos). Siempre se envuelven
// antes de subir al dominio — nunca se propaga el error crudo del driver
// (ARCHITECTURE_GUIDE.md §6).
export abstract class InfrastructureError extends AppError {}

export class DatabaseError extends InfrastructureError {}

export class ExternalServiceError extends InfrastructureError {}

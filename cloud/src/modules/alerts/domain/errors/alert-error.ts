/** Error de dominio con el status HTTP que le corresponde en el borde (mismo criterio que `CustomFieldError`). */
export class AlertError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "AlertError";
  }
}

export class AlertFilterError extends AlertError {
  constructor(message: string) {
    super(message, 400);
    this.name = "AlertFilterError";
  }
}

export class AlertNotFoundError extends AlertError {
  constructor() {
    super("Alerta no encontrada", 404);
    this.name = "AlertNotFoundError";
  }
}

export class AlertUpdateError extends AlertError {
  constructor(message: string) {
    super(message, 400);
    this.name = "AlertUpdateError";
  }
}

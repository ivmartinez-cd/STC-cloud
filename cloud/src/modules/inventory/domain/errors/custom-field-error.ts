/** Error de validación de negocio con el código HTTP que ya devolvía el
 * controller original (400 por defecto, 409 en conflicto de key duplicada) —
 * mismo contrato externo. */
export class CustomFieldError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

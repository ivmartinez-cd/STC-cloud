export interface AppErrorOptions {
  cause?: unknown;
  context?: Record<string, unknown>;
}

export abstract class AppError extends Error {
  readonly context?: Record<string, unknown>;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = this.constructor.name;
    this.context = options.context;
  }
}

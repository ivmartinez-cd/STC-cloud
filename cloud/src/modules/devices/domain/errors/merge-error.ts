/** Familia de errores de fusión — nombres conservados de `deviceLifecycleService/merge-types.ts` (los referencia `agentService`). */
export class MergeError extends Error {}
export class MergeIdentityConflictError extends MergeError {}
export class MergeClientMismatchError extends MergeError {}
export class MergeTooLargeError extends MergeError {
  constructor(public count: number, public max: number) {
    super(`El equipo fuente tiene ${count} lecturas (máximo permitido: ${max}); requiere un merge offline por lotes.`);
  }
}
export class MergeOverlapError extends MergeError {
  constructor(
    public from: Date,
    public to: Date,
    public sourceCount: number,
    public targetCount: number
  ) {
    super(
      `Las series de lecturas se solapan entre ${from.toISOString()} y ${to.toISOString()} ` +
      `(fuente: ${sourceCount}, destino: ${targetCount}) — elegí onOverlap para continuar.`
    );
  }
}

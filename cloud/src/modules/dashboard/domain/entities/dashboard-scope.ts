/**
 * Alcance de datos del panel — estructuralmente idéntico a
 * `api/utils/scope.ts::Scope` (unión discriminada a propósito, nunca
 * `string | null`: un `null` que significa a la vez "admin sin restricción" y
 * "viewer sin cliente" está a un `if` invertido de una fuga entre clientes).
 * Duplicado acá para que el dominio no importe de la capa HTTP — mismo criterio
 * y misma forma que `AlertScope` en `modules/alerts`.
 */
export type DashboardScope = { kind: "all" } | { kind: "client"; id: string };

/** El id del cliente, o `null` si el scope abarca toda la red. */
export function clientIdOf(scope: DashboardScope): string | null {
  return scope.kind === "client" ? scope.id : null;
}

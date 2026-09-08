import type { Knex } from "knex";
import type { EffectiveIdentity, IdentityResolver } from "../../application/ports/identity-resolver";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class KnexIdentityResolver implements IdentityResolver {
  constructor(private readonly db: Knex) {}

  async resolveEffectiveIdentity(user: { userId: string; username?: string }): Promise<EffectiveIdentity> {
    // Antes esto sólo consultaba `users` en el caso del admin hardcodeado. Ahora
    // busca siempre, porque `clientId` no viene en el JWT y hace falta para
    // scopear la fila de `audit_logs` (ARCHITECTURE_GUIDE §8.8). Es un lookup
    // por PK (o por `username` único) en una acción de feedback: costo irrelevante.
    // El `where({ id })` va sólo si el userId parece un uuid: `users.id` es
    // uuid y Postgres tira 22P02 (→ 500) con cualquier otra cosa.
    const row = user.userId === "admin"
      ? await this.db("users").where({ username: "admin" }).first()
      : UUID_RX.test(user.userId)
        ? await this.db("users").where({ id: user.userId }).first()
        : undefined;

    if (row) {
      return { id: row.id, username: row.username, clientId: row.client_id ?? null };
    }
    return { id: user.userId, username: user.username || "unknown", clientId: null };
  }
}

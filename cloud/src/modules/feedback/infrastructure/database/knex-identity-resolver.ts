import type { Knex } from "knex";
import type { EffectiveIdentity, IdentityResolver } from "../../application/ports/identity-resolver";

export class KnexIdentityResolver implements IdentityResolver {
  constructor(private readonly db: Knex) {}

  async resolveEffectiveIdentity(user: { userId: string; username?: string }): Promise<EffectiveIdentity> {
    if (user.userId === "admin") {
      const adminRow = await this.db("users").where({ username: "admin" }).first();
      if (adminRow) {
        return { id: adminRow.id, username: adminRow.username };
      }
    }
    return { id: user.userId, username: user.username || "unknown" };
  }
}

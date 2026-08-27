import type { Knex } from "knex";
import type {
  CreateUserRow, UpdateUserRow, UserListRow, UserRepository, UserRow,
} from "../../domain/repositories/user-repository";

const LIST_COLUMNS = [
  "users.id", "users.username", "users.role", "users.active", "users.client_id",
  "clients.name as client_name", "users.totp_required", "users.created_at", "users.updated_at",
];

const RETURNING_COLUMNS = ["id", "username", "role", "active", "client_id", "totp_required", "created_at", "updated_at"];

export class KnexUserRepository implements UserRepository {
  constructor(private readonly db: Knex) {}

  findByUsername(username: string): Promise<UserRow | undefined> {
    return this.db("users").where({ username }).first();
  }

  findById(id: string): Promise<UserRow | undefined> {
    return this.db("users").where({ id }).first();
  }

  findTotpFlags(id: string) {
    return this.db("users").where({ id }).select("totp_required", "totp_enabled").first();
  }

  list(): Promise<UserListRow[]> {
    return this.db("users")
      .leftJoin("clients", "clients.id", "users.client_id")
      .select(LIST_COLUMNS)
      .orderBy("users.username", "asc");
  }

  async create(row: CreateUserRow): Promise<UserListRow> {
    const [created] = await this.db("users")
      .insert({
        id: this.db.raw("gen_random_uuid()"),
        username: row.username,
        password_hash: row.passwordHash,
        role: row.role,
        client_id: row.clientId,
        active: true,
        totp_required: row.totpRequired,
      })
      .returning(RETURNING_COLUMNS);
    return created;
  }

  async update(id: string, patch: UpdateUserRow): Promise<UserListRow | undefined> {
    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (patch.passwordHash !== undefined) updates.password_hash = patch.passwordHash;
    if (patch.role !== undefined) updates.role = patch.role;
    if (patch.clientId !== undefined) updates.client_id = patch.clientId;
    if (patch.active !== undefined) updates.active = patch.active;
    if (patch.totpRequired !== undefined) updates.totp_required = patch.totpRequired;

    const [updated] = await this.db("users").where({ id }).update(updates).returning(RETURNING_COLUMNS);
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.db("users").where({ id }).delete();
  }
}

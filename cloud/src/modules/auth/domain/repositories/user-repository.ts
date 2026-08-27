export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  role: string;
  active: boolean;
  client_id: string | null;
  totp_required: boolean;
  totp_enabled: boolean;
  totp_secret: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserListRow {
  id: string; username: string; role: string; active: boolean; client_id: string | null;
  client_name: string | null; totp_required: boolean; created_at: string; updated_at: string;
}

export interface CreateUserRow {
  username: string; passwordHash: string; role: string; clientId: string | null; totpRequired: boolean;
}

export interface UpdateUserRow {
  passwordHash?: string; role?: string; clientId?: string | null; active?: boolean; totpRequired?: boolean;
}

/** Puerto de persistencia de usuarios del portal — implementado sobre Knex en `infrastructure/database`. */
export interface UserRepository {
  findByUsername(username: string): Promise<UserRow | undefined>;
  findById(id: string): Promise<UserRow | undefined>;
  findTotpFlags(id: string): Promise<{ totp_required: boolean; totp_enabled: boolean } | undefined>;
  list(): Promise<UserListRow[]>;
  create(row: CreateUserRow): Promise<UserListRow>;
  update(id: string, patch: UpdateUserRow): Promise<UserListRow | undefined>;
  delete(id: string): Promise<void>;
}

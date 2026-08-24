import { randomBytes } from "node:crypto";
import type { Knex } from "knex";
import {
  formatRecoveryCode,
  hashRecoveryCode,
  RECOVERY_CODE_COUNT,
} from "../../domain/recovery-codes";

const TABLE = "user_recovery_codes";

export class KnexRecoveryCodeRepository {
  constructor(private readonly db: Knex) {}

  /** Reemplaza el juego completo y devuelve los códigos EN CLARO (se muestran una sola vez). */
  async regenerate(userId: string): Promise<string[]> {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => formatRecoveryCode(randomBytes(16)));
    await this.db.transaction(async (trx) => {
      await trx(TABLE).where({ user_id: userId }).delete();
      await trx(TABLE).insert(codes.map((code) => ({ user_id: userId, code_hash: hashRecoveryCode(code) })));
    });
    return codes;
  }

  async remaining(userId: string): Promise<number> {
    const [{ count }] = await this.db(TABLE).where({ user_id: userId }).whereNull("used_at").count("* as count");
    return Number(count);
  }

  /**
   * Consume un código: lo marca usado de forma atómica. Devuelve true solo
   * si estaba activo (un código ya quemado o inexistente → false).
   */
  async consume(userId: string, code: string): Promise<boolean> {
    const updated = await this.db(TABLE)
      .where({ user_id: userId, code_hash: hashRecoveryCode(code) })
      .whereNull("used_at")
      .update({ used_at: new Date() });
    return updated > 0;
  }

  async deleteAll(userId: string): Promise<void> {
    await this.db(TABLE).where({ user_id: userId }).delete();
  }
}

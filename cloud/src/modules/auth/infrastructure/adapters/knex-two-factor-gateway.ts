import type { Knex } from "knex";
import { consumeRecoveryCode } from "../../../two-factor";
import type { TwoFactorGateway } from "../../application/ports/two-factor-gateway";

export class KnexTwoFactorGateway implements TwoFactorGateway {
  constructor(private readonly db: Knex) {}

  consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
    return consumeRecoveryCode(this.db, userId, code);
  }
}

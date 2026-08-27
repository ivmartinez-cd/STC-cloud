import type { Knex } from "knex";
import { countOpenAlertsByClass } from "../../../alerts";
import type { AlertsByClassReader, AlertsByClassScope } from "../../application/ports/alerts-by-class-reader";

export class KnexAlertsByClassReader implements AlertsByClassReader {
  constructor(private readonly db: Knex) {}

  countOpenAlertsByClass(scope: AlertsByClassScope) {
    return countOpenAlertsByClass(this.db, scope);
  }
}

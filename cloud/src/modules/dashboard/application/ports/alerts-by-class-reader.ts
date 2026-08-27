import type { AlertClass } from "../../../alerts";

export type AlertsByClassScope = { kind: "all" } | { kind: "client"; id: string };

export interface AlertsByClassReader {
  countOpenAlertsByClass(scope: AlertsByClassScope): Promise<Array<{ alertClass: AlertClass | null; count: number }>>;
}

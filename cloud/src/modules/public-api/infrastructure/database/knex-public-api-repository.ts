import { Knex } from "knex";
import { onlyLiveDevices } from "../../../../api/utils/deviceFilters";
import type {
  PageParams, PublicApiAlertRow, PublicApiDeviceRow, PublicApiReadingRow,
  PublicApiReportClosureLineRow, PublicApiReportClosureRow, PublicApiRepository,
} from "../../domain/repositories/public-api-repository";

export class KnexPublicApiRepository implements PublicApiRepository {
  constructor(private readonly db: Knex) {}

  listDevices(clientId: string, page: PageParams): Promise<PublicApiDeviceRow[]> {
    return this.db("devices")
      .where("devices.client_id", clientId)
      .modify((q) => onlyLiveDevices(q, "devices"))
      .select("id", "name", "serial_number", "ip_address", "hostname", "location", "sku", "active", "last_seen")
      .orderBy("name")
      .limit(page.limit)
      .offset(page.offset);
  }

  findOwnedDevice(clientId: string, deviceId: string) {
    return this.db("devices").where({ id: deviceId, client_id: clientId }).select("id").first();
  }

  listDeviceReadings(deviceId: string, filters: { from?: Date; to?: Date; limit: number }): Promise<PublicApiReadingRow[]> {
    const query = this.db("readings")
      .where({ device_id: deviceId })
      .whereNotNull("total_pages")
      .orderBy("time", "desc")
      .limit(filters.limit);
    if (filters.from) query.where("time", ">=", filters.from);
    if (filters.to) query.where("time", "<=", filters.to);
    return query.select("time", "total_pages", "mono_pages", "color_pages", "offline");
  }

  listAlerts(clientId: string, filters: { resolved?: boolean }, page: PageParams): Promise<PublicApiAlertRow[]> {
    return this.db("alerts")
      .leftJoin("devices", "alerts.device_id", "devices.id")
      .leftJoin("agents", "agents.id", this.db.raw("COALESCE(devices.agent_id, alerts.agent_id)"))
      .where((b) => {
        b.where("devices.client_id", clientId).orWhere((b2) => {
          b2.whereNull("alerts.device_id").andWhere("agents.client_id", clientId);
        });
      })
      .modify((q) => {
        if (filters.resolved !== undefined) q.andWhere("alerts.resolved", filters.resolved);
      })
      .orderBy("alerts.created_at", "desc")
      .limit(page.limit)
      .offset(page.offset)
      .select(
        "alerts.id", "alerts.type", "alerts.severity", "alerts.message", "alerts.resolved",
        "alerts.created_at", "alerts.device_id", "devices.name as device_name"
      );
  }

  listReportClosures(clientId: string, page: PageParams): Promise<PublicApiReportClosureRow[]> {
    return this.db("report_closures")
      .where({ client_id: clientId })
      .orderBy("period", "desc")
      .limit(page.limit)
      .offset(page.offset)
      .select("id", "period", "status", "closed_at", "reopened_at", "superseded_by", "total_pages", "total_mono", "total_color");
  }

  findReportClosure(clientId: string, closureId: string): Promise<PublicApiReportClosureRow | undefined> {
    return this.db("report_closures").where({ id: closureId, client_id: clientId }).first();
  }

  listReportClosureLines(closureId: string): Promise<PublicApiReportClosureLineRow[]> {
    return this.db("report_closure_lines")
      .where({ closure_id: closureId })
      .orderBy("device_serial")
      .select(
        "device_id", "device_serial", "device_model", "device_brand",
        "first_reading_at", "first_total_pages", "first_mono_pages", "first_color_pages",
        "last_reading_at", "last_total_pages", "last_mono_pages", "last_color_pages",
        "delta_total", "delta_mono", "delta_color", "had_counter_reset"
      );
  }
}

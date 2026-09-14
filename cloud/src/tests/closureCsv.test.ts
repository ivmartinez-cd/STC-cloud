// CSV de cierres — inyección de fórmulas y celdas con separador (auditoría 14/09/2026).
// Run: npx tsx --test src/tests/closureCsv.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildClosureCsv, csvCell, type ExportLine } from "../modules/reports/domain/services/closure-csv";

const line = (over: Partial<ExportLine> = {}): ExportLine => ({
  device_serial: "ABC123", device_model: "M5370LX", device_brand: "samsung", agent_name: "Sede Central",
  first_total_pages: 100, first_reading_at: "2026-09-01T00:00:00.000Z", last_total_pages: 150, last_reading_at: "2026-09-30T00:00:00.000Z",
  delta_total: 50, delta_mono: 50, delta_color: 0, delta_other: 0, delta_estimated: null, source: "ews", had_counter_reset: false,
  ...over,
});

describe("csvCell", () => {
  test("una celda que empieza como fórmula sale como texto", () => {
    // Apóstrofo adelante; y como trae comillas, va entre comillas con las internas dobladas.
    assert.equal(csvCell('=HYPERLINK("http://evil")'), '"\'=HYPERLINK(""http://evil"")"');
    assert.equal(csvCell("+1"), "'+1");
    assert.equal(csvCell("-5"), "'-5");
    assert.equal(csvCell("@SUM"), "'@SUM");
  });

  test("un separador o salto de línea adentro del valor va entre comillas", () => {
    assert.equal(csvCell("HP;LaserJet"), "\"HP;LaserJet\"");
    assert.equal(csvCell("línea1\nlínea2"), "\"línea1\nlínea2\"");
  });

  test("los números y el texto normal no se tocan", () => {
    assert.equal(csvCell(42), "42");
    assert.equal(csvCell("M5370LX"), "M5370LX");
  });
});

describe("buildClosureCsv", () => {
  test("un serial malicioso reportado por el equipo no llega como fórmula", () => {
    const csv = buildClosureCsv({ period: "2026-09-01", status: "closed", closed_at: "2026-10-01T00:00:00.000Z" }, [line({ device_serial: "=cmd|' /C calc'!A0" })]);
    const dataRow = csv.split("\r\n").at(-1)!;
    assert.ok(dataRow.startsWith("'=cmd"), dataRow);
    assert.equal(dataRow.split(";").length, 15, "sigue habiendo 15 columnas");
  });
});

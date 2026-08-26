// `buildLogsReport`/`formatDateAR` — unitarios puros (sin DB). Hallazgo del
// 26/08/2026 (pasada de locale): el reporte exportado tenía
// `America/Argentina/Buenos_Aires` hardcodeado sin importar la TZ real del
// agente — un cliente en Chile/México veía sus propios horarios corridos.
// Ejecutar: npx tsx --test src/tests/agentLogsReport.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildLogsReport, formatDateAR } from '../modules/agents/domain/services/agent-logs';

describe('formatDateAR — usa la TZ que se le pasa, no una fija', () => {
  test('mismo instante, TZ distintas → horas distintas', () => {
    // 2026-08-26T23:00:00Z: 20:00 en Buenos Aires (-03:00), 19:00 en Santiago (-04:00 en invierno austral).
    const instant = new Date('2026-08-26T23:00:00Z');
    const ar = formatDateAR(instant, 'America/Argentina/Buenos_Aires');
    const cl = formatDateAR(instant, 'America/Santiago');
    assert.equal(ar, '26/08/2026 20:00:00');
    assert.equal(cl, '26/08/2026 19:00:00');
    assert.notEqual(ar, cl);
  });

  test('TZ inválida no tira — cae a ISO', () => {
    const instant = new Date('2026-08-26T23:00:00Z');
    const result = formatDateAR(instant, 'TZ/Que-No-Existe');
    assert.equal(result, instant.toISOString());
  });
});

describe('buildLogsReport — el encabezado y cada fila usan la TZ del agente', () => {
  test('reporte completo respeta la TZ pasada, no Buenos Aires a secas', () => {
    const logs = [{ timestamp: '2026-08-26T23:00:00Z', level: 'INFO', message: 'ping' }];
    const reportCL = buildLogsReport('agent-1', logs, 'America/Santiago');
    const reportAR = buildLogsReport('agent-1', logs, 'America/Argentina/Buenos_Aires');
    assert.match(reportCL, /19:00:00\s+INFO\s+ping/);
    assert.match(reportAR, /20:00:00\s+INFO\s+ping/);
    assert.notEqual(reportCL, reportAR);
  });

  test('timestamp inválido en una fila → "---", no rompe el resto del reporte', () => {
    const logs = [{ timestamp: 'no-es-una-fecha', level: 'ERROR', message: 'algo raro' }];
    const report = buildLogsReport('agent-1', logs, 'America/Argentina/Buenos_Aires');
    assert.match(report, /---\s+ERROR\s+algo raro/);
  });
});

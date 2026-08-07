import { type EwsData } from '../types';
import { fetchHttp } from '../../ews';

// ─── Helpers ────────────────────────────────────────────────

function extractValue(body: string, key: string): string | undefined {
  const m = body.match(new RegExp(
    `(?:^|[\\s,{])"?${key}"?\\s*:\\s*(?:"([^"]*)"|([\\w.\\-]+))`,
    'i'
  ));
  return m ? (m[1] ?? m[2])?.trim() : undefined;
}

function extractNumber(body: string, key: string): number | undefined {
  const v = extractValue(body, key);
  if (v === undefined) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

function extractBlock(body: string, blockName: string): string | null {
  const m = body.match(new RegExp(`${blockName}\\s*:\\s*\\{([^}]+)\\}`, 'i'));
  return m ? m[1] : null;
}

function getNumFromBlock(block: string, key: string): number | undefined {
  const m = block.match(new RegExp(`${key}\\s*:\\s*(\\d+)`, 'i'));
  return m ? parseInt(m[1], 10) : undefined;
}

function getStrFromBlock(block: string, key: string): string | undefined {
  const m = block.match(new RegExp(`${key}\\s*:\\s*"([^"]*)"`, 'i'));
  return m?.[1]?.trim();
}

function matchVal(body: string, key: string): number {
  return extractNumber(body, key) ?? 0;
}

function calcPct(curr: number, max: number): number | null {
  if (max <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((1 - curr / max) * 100)));
}

function statusFromPct(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return 'Unknown';
  if (pct <= 0) return 'Empty';
  if (pct <= 10) return 'Low';
  return 'Ready';
}

function mapSeverity(sev: number | string | null | undefined): string {
  const n = typeof sev === 'string' ? parseInt(sev, 10) : (sev ?? 0);
  if (n >= 4) return 'ERROR';
  if (n === 2 || n === 3) return 'WARNING';
  return 'INFO';
}

// ─── Main scanner ───────────────────────────────────────────

export async function scanSamsung4020(ip: string): Promise<Partial<EwsData> | null> {
  const [homeBody, counterBody, fwBody, suppliesBody, alertBody] = await Promise.all([
    fetchHttp(ip, '/sws/app/information/home/home.json', 'http'),
    fetchHttp(ip, '/sws/app/information/counters/counters.json', 'http'),
    fetchHttp(ip, '/sws/app/maintenance/fw/fwupgrade.json', 'http'),
    fetchHttp(ip, '/sws/app/information/supplies/supplies.json', 'http'),
    fetchHttp(ip, '/sws/app/information/activealert/activealert.json', 'http'),
  ]);

  if (!homeBody && !counterBody && !suppliesBody) return null;

  const result: Partial<EwsData> = { brand: 'samsung' };
  const suppliesDetails: NonNullable<EwsData['suppliesDetails']> = {};

  // 1. Identity from home.json
  if (homeBody) {
    result.model = extractValue(homeBody, 'model_name');
    result.serial = extractValue(homeBody, 'serial_num');
    result.mac = extractValue(homeBody, 'mac_addr');
    result.hostname = extractValue(homeBody, 'host_name');
    result.location = extractValue(homeBody, 'location');

    // Input trays
    const inputTrays: Array<{
      name: string;
      capacity: number;
      paperSize: string;
      paperType: string;
      status: string;
    }> = [];

    const trayMap: Record<string, string> = {
      tray1: 'Tray 1',
      tray2: 'Tray 2',
      tray3: 'Tray 3',
      tray4: 'Tray 4',
      tray5: 'Tray 5',
      mp: 'MP Tray (Bypass)',
    };

    for (const [key, name] of Object.entries(trayMap)) {
      const block = extractBlock(homeBody, key);
      if (!block) continue;
      const opt = getNumFromBlock(block, 'opt');
      if (opt === 1 || opt === 2) {
        inputTrays.push({
          name,
          capacity: getNumFromBlock(block, 'capa') ?? 0,
          paperSize: 'A4',
          paperType: 'Plain',
          status: 'Ready',
        });
      }
    }
    if (inputTrays.length) suppliesDetails.inputTrays = inputTrays;

    // Output tray
    const outputMatch = homeBody.match(/outputTray\s*:\s*\[\s*\[(\d+)\s*,\s*(\d+)/i);
    if (outputMatch) {
      suppliesDetails.outputTrays = [{
        name: 'Standard Bin',
        capacity: `${outputMatch[2]} hojas`,
        status: 'Ready',
      }];
    }
  }

  // 2. Page counters
  if (counterBody) {
    const totalImpressions = matchVal(counterBody, 'GXI_BILLING_TOTAL_IMP_CNT');
    const monoSimplexPrint = matchVal(counterBody, 'GXI_BILLING_SIMPLEX_BW_PRINT_CNT');
    const monoSimplexReport = matchVal(counterBody, 'GXI_BILLING_SIMPLEX_BW_REPORT_CNT');
    const monoSimplexTotal = matchVal(counterBody, 'GXI_BILLING_SIMPLEX_BW_TOTAL_CNT') || (monoSimplexPrint + monoSimplexReport);
    const duplexPrint = matchVal(counterBody, 'GXI_BILLING_DUPLEX_BW_PRINT_CNT');
    const duplexReport = matchVal(counterBody, 'GXI_BILLING_DUPLEX_BW_REPORT_CNT');
    const duplexTotal = matchVal(counterBody, 'GXI_BILLING_DUPLEX_BW_TOTAL_CNT') || (duplexPrint + duplexReport);
    const totalPrint = matchVal(counterBody, 'GXI_BILLING_PRINT_TOTAL_IMP_CNT') || (monoSimplexPrint + duplexPrint);
    const totalReport = matchVal(counterBody, 'GXI_BILLING_REPORT_TOTAL_IMP_CNT') || (monoSimplexReport + duplexReport);

    if (totalImpressions) result.totalPages = totalImpressions;
    if (monoSimplexTotal) result.monoPages = monoSimplexTotal;

    // Serial fallback
    const serial = extractValue(counterBody, 'GXI_SYS_SERIAL_NUM');
    if (serial && !result.serial) result.serial = serial;

    suppliesDetails.counters = {
      monoSimplex: { print: monoSimplexPrint, report: monoSimplexReport, total: monoSimplexTotal },
      duplex: { print: duplexPrint, report: duplexReport, total: duplexTotal },
      totalImpressions: { print: totalPrint, report: totalReport, total: totalImpressions },
    };
  }

  // 3. Firmware
  if (fwBody) {
    const mainFw = fwBody.match(/id\s*:\s*["']GXI_FW_MAIN_VER["']\s*,\s*version\s*:\s*["']([^"']+)["']/i)
      || fwBody.match(/version\s*:\s*["']([^"']+)["']/i);
    if (mainFw) result.firmware = mainFw[1].trim();
  }

  // 4. Supplies (toner + maintenance kits)
  if (suppliesBody) {
    // Toner black (all-in-one en 4020, no hay drum separado)
    const tonerBlock = extractBlock(suppliesBody, 'toner_black');
    if (tonerBlock) {
      const remaining = getNumFromBlock(tonerBlock, 'remaining');
      const code = getStrFromBlock(tonerBlock, 'id');
      const serial = getStrFromBlock(tonerBlock, 'serial');
      const capa = getNumFromBlock(tonerBlock, 'capa');

      if (remaining !== undefined) result.tonerBlack = remaining;
      if (code) result.cartridgeCodeBlack = code;
      if (serial) result.cartridgeSerialBlack = serial;
      if (capa) result.cartridgeCapacityBlack = capa;

      suppliesDetails.toners = {
        black: {
          percentage: remaining ?? 0,
          status: statusFromPct(remaining),
          code: code ?? undefined,
          serial: serial ?? undefined,
          capacity: capa ?? undefined,
        },
      };
    }

    // Drum solo si realmente está presente (opt === 1)
    const drumBlock = extractBlock(suppliesBody, 'drum_black');
    if (drumBlock) {
      const opt = getNumFromBlock(drumBlock, 'opt');
      if (opt === 1) {
        const remaining = getNumFromBlock(drumBlock, 'remaining');
        const code = getStrFromBlock(drumBlock, 'id');
        const serial = getStrFromBlock(drumBlock, 'serial');
        const capa = getNumFromBlock(drumBlock, 'capa');

        suppliesDetails.drums = {
          black: {
            percentage: remaining ?? 0,
            status: statusFromPct(remaining),
            code: code || undefined,
            serial: serial || undefined,
            capacity: capa,
          },
        };
      }
    }

    // Maintenance kits
    const fuserPct = calcPct(matchVal(suppliesBody, 'fuser_kit'), matchVal(suppliesBody, 'fuser_kit_max'));
    const transferRollerPct = calcPct(matchVal(suppliesBody, 'btr_kit'), matchVal(suppliesBody, 'btr_kit_max'));
    const tray1RollerPct = calcPct(matchVal(suppliesBody, 'roller_tray1'), matchVal(suppliesBody, 'roller_tray1_max'));
    const tray1RetardRollerPct = calcPct(matchVal(suppliesBody, 'torque_limiter_tray1'), matchVal(suppliesBody, 'torque_limiter_tray1_max'));
    const mpTrayRollerPct = calcPct(matchVal(suppliesBody, 'roller_bypass'), matchVal(suppliesBody, 'roller_bypass_max'));
    const mpTrayRetardRollerPct = calcPct(matchVal(suppliesBody, 'retard_roller_mp'), matchVal(suppliesBody, 'retard_roller_mp_max'));

    suppliesDetails.maintenance = {
      fuser: fuserPct !== null
        ? { percentage: fuserPct, status: statusFromPct(fuserPct) }
        : undefined,
      transferRoller: transferRollerPct !== null
        ? { percentage: transferRollerPct, status: statusFromPct(transferRollerPct) }
        : undefined,
      tray1Roller: tray1RollerPct !== null
        ? { percentage: tray1RollerPct, status: statusFromPct(tray1RollerPct) }
        : undefined,
      tray1RetardRoller: tray1RetardRollerPct !== null
        ? { percentage: tray1RetardRollerPct, status: statusFromPct(tray1RetardRollerPct) }
        : undefined,
      mpTrayRoller: mpTrayRollerPct !== null
        ? { percentage: mpTrayRollerPct, status: statusFromPct(mpTrayRollerPct) }
        : undefined,
      mpTrayRetardRoller: mpTrayRetardRollerPct !== null
        ? { percentage: mpTrayRetardRollerPct, status: statusFromPct(mpTrayRetardRollerPct) }
        : undefined,
    };
  }

  // 5. Active Alerts
  if (alertBody) {
    const alerts: Array<{ code?: string; description?: string; severity?: string; time?: string }> = [];
    const now = new Date().toISOString();

    let parsed: unknown = null;

    // Estrategia 1: JSON.parse directo (sin heurística agresiva)
    try {
      const jsonCandidate = alertBody
        .replace(/^[^{\[]*/, '')
        .replace(/[^}\]]*$/, '');

      if (jsonCandidate.trim().startsWith('{') || jsonCandidate.trim().startsWith('[')) {
        parsed = JSON.parse(jsonCandidate);
      }
    } catch {
      // no es JSON válido → fallback a regex
    }

    if (parsed !== null) {
      const obj = parsed as Record<string, unknown>;
      const arr: unknown[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(obj['recordData'])
          ? (obj['recordData'] as unknown[])
          : Array.isArray(obj['activeAlert'])
            ? (obj['activeAlert'] as unknown[])
            : Array.isArray(obj['alerts'])
              ? (obj['alerts'] as unknown[])
              : [parsed];

      for (const item of arr) {
        if (typeof item !== 'object' || item === null) continue;
        const rec = item as Record<string, unknown>;
        const code = rec['code'] != null ? String(rec['code']) : undefined;
        const desc = rec['desc'] != null
          ? String(rec['desc'])
          : rec['description'] != null
            ? String(rec['description'])
            : undefined;
        if (!code && !desc) continue;

        alerts.push({
          code,
          description: desc ?? code,
          severity: mapSeverity(rec['severity'] as string | number | null),
          time: now,
        });
      }
    }

    // Estrategia 2: regex de objetos
    if (alerts.length === 0) {
      const objPattern = /\{[^{}]*(?:"?severity"?\s*:|"?code"?\s*:|"?desc(?:ription)?"?\s*:)[^{}]*\}/gi;
      for (const objMatch of alertBody.matchAll(objPattern)) {
        const obj = objMatch[0];

        const getField = (f: string): string | null => {
          const m = obj.match(new RegExp(`"?${f}"?\\s*:\\s*(?:"([^"]*)"|(\\d+))`, 'i'));
          return m ? (m[1] ?? m[2] ?? '').trim() : null;
        };

        const codeStr = getField('code');
        const descStr = getField('desc') ?? getField('description');
        if (!codeStr && !descStr) continue;

        alerts.push({
          code: codeStr ?? undefined,
          description: descStr ?? codeStr ?? undefined,
          severity: mapSeverity(getField('severity')),
          time: now,
        });
      }
    }

    if (alerts.length > 0) {
      suppliesDetails.alerts = alerts;
    }
  }

  if (Object.keys(suppliesDetails).length > 0) {
    result.suppliesDetails = suppliesDetails;
  }

  return result;
}
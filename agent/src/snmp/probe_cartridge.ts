/**
 * Diagnóstico EWS — busca códigos de cartucho en todos los endpoints
 * Uso: npx tsx agent/src/snmp/probe_cartridge.ts 192.168.176.55
 */

import http  from 'http';
import https from 'https';

const ip       = process.argv[2] || '192.168.176.55';
const TIMEOUT  = 5000;

const ENDPOINTS = [
  // HP
  { proto: 'http',  path: '/hp/device/InternalPages/Index?id=SuppliesStatus' },
  { proto: 'http',  path: '/DevMgmt/ProductUsageDyn.xml' },
  { proto: 'http',  path: '/hp/device/InternalPages/Index?id=UsagePage' },
  { proto: 'http',  path: '/hp/device/InternalPages/Index?id=DeviceConfiguration' },
  // Samsung SyncThru JSON
  { proto: 'http',  path: '/sws/app/information/supplies/supplies.json' },
  { proto: 'http',  path: '/sws/app/information/home/home.json' },
  // Samsung Solution Web
  { proto: 'http',  path: '/sws.application/information/suppliesView.sws' },
  // Lexmark
  { proto: 'http',  path: '/cgi-bin/dynamic/printer/PrinterStatus.html' },
  { proto: 'http',  path: '/cgi-bin/dynamic/printer/config/reports/deviceinfo.html' },
  // Generic / otros
  { proto: 'http',  path: '/general/status.html' },
  { proto: 'http',  path: '/web/entry.cgi?func=STR_PRTCNT' },
  { proto: 'http',  path: '/PRESENTATION/HTML/TOP/PRTINFO.HTML' },
  { proto: 'http',  path: '/English/pages/cnc_status.html' },
];

// ─── Palabras clave que buscar en las respuestas ───────────────────────────────
const CARTRIDGE_PATTERNS = [
  /order\s*number/i,
  /part\s*no/i,
  /part\s*number/i,
  /part_num/i,
  /cartridge\s*number/i,
  /supply\s*number/i,
  /numero\s*de\s*pieza/i,
  /n[uú]mero\s*de\s*pedido/i,
  /[A-Z]{1,3}\d{3,4}[A-Z]?X/,      // HP part codes: CE285A, CF230A, etc.
  /[A-Z]{2,3}-\d{4,6}/,             // Lexmark: 56F4X00, etc.
  /CLT-[A-Z]\d{3,4}/i,              // Samsung: CLT-K503L, etc.
  /MLT-[A-Z]\d{3,4}/i,              // Samsung mono: MLT-D203L
  /"part_num"\s*:\s*"([^"]+)"/,
  /"model_num"\s*:\s*"([^"]+)"/,
  /"orderNumber"\s*:\s*"([^"]+)"/,
  /orderNumber/i,
];

function fetchHttp(proto: string, path: string): Promise<string | null> {
  return new Promise((resolve) => {
    const lib  = proto === 'https' ? https : http;
    const port = proto === 'https' ? 443   : 80;
    const req  = (lib as any).request(
      { hostname: ip, port, path, method: 'GET', timeout: TIMEOUT, rejectUnauthorized: false },
      (res: any) => {
        if (res.statusCode < 200 || res.statusCode >= 300) { resolve(null); return; }
        const parts: string[] = [];
        res.setEncoding('utf8');
        res.on('data', (c: string) => parts.push(c));
        res.on('end',  () => resolve(parts.join('')));
      },
    );
    req.on('error',   () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

function extractMatches(body: string): string[] {
  const hits: string[] = [];
  for (const pat of CARTRIDGE_PATTERNS) {
    const m = body.match(pat);
    if (m) hits.push(m[0].slice(0, 120));
  }
  return [...new Set(hits)];
}

async function main() {
  console.log(`\n🔍 Probando EWS en ${ip} — buscando códigos de cartucho\n`);

  for (const ep of ENDPOINTS) {
    const url = `${ep.proto}://${ip}${ep.path}`;
    process.stdout.write(`  ${url} ... `);

    const body = await fetchHttp(ep.proto, ep.path);
    if (!body) { console.log('❌ sin respuesta'); continue; }

    console.log(`✅ ${body.length} bytes`);
    const hits = extractMatches(body);
    if (hits.length > 0) {
      console.log('    🎯 Coincidencias de cartucho:');
      for (const h of hits) console.log(`       » ${h}`);
    } else {
      console.log('    — sin coincidencias de código de cartucho');
    }

    // Mostrar snippet de las primeras 600 chars si la respuesta es corta
    if (body.length < 2000) {
      console.log('    📄 Respuesta completa:');
      console.log(body.slice(0, 600).replace(/\n/g, '\n       '));
    }
    console.log('');
  }
  console.log('✔ Diagnóstico completo\n');
}

main();

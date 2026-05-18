import http from 'http';

const IPP_PORT    = 631;
const IPP_TIMEOUT = 3000;
const IPP_PATHS   = ['/ipp/print', '/ipp', '/printers/default', '/'];

export interface IppData {
  name:   string | null;
  model:  string | null;
  serial: string | null;
}

export async function readDeviceViaIPP(ip: string): Promise<IppData | null> {
  for (const path of IPP_PATHS) {
    try {
      const result = await attemptIPP(ip, path);
      if (result) return result;
    } catch { /* probar siguiente */ }
  }
  return null;
}

// ─── Construcción del request IPP/1.1 Get-Printer-Attributes ─────────────────

function buildIppRequest(printerUri: string): Buffer {
  const enc = (s: string) => Buffer.from(s, 'utf8');
  const u16 = (n: number) => Buffer.from([n >> 8, n & 0xff]);

  const charset  = enc('utf-8');
  const language = enc('en-us');
  const uri      = enc(printerUri);

  const attrName = (s: string) => { const b = enc(s); return [u16(b.length), b]; };
  const attrVal  = (b: Buffer)  => [u16(b.length), b];

  const requestedAttrs = [
    'printer-name',
    'printer-make-and-model',
    'printer-info',
    'printer-serial-number',
  ];

  const attrCharsetName  = enc('attributes-charset');
  const attrLangName     = enc('attributes-natural-language');
  const printerUriName   = enc('printer-uri');
  const reqAttrName      = enc('requested-attributes');

  const parts: Buffer[] = [
    // Cabecera IPP/1.1 + Get-Printer-Attributes (0x000B) + request-id 1
    Buffer.from([0x01, 0x01, 0x00, 0x0b, 0x00, 0x00, 0x00, 0x01]),
    Buffer.from([0x01]),                        // operation-attributes-tag
    Buffer.from([0x47]),                        // charset tag
    ...attrName('attributes-charset'), ...attrVal(charset),
    Buffer.from([0x48]),                        // naturalLanguage tag
    ...attrName('attributes-natural-language'), ...attrVal(language),
    Buffer.from([0x45]),                        // uri tag
    ...attrName('printer-uri'), ...attrVal(uri),
  ];

  // requested-attributes: primer ítem lleva nombre, los siguientes lo omiten
  requestedAttrs.forEach((attr, i) => {
    const v = enc(attr);
    parts.push(
      Buffer.from([0x44]),                      // keyword tag
      i === 0 ? u16(reqAttrName.length) : u16(0),
      i === 0 ? reqAttrName : Buffer.alloc(0),
      u16(v.length), v,
    );
  });

  parts.push(Buffer.from([0x03]));              // end-of-attributes
  return Buffer.concat(parts);
}

// ─── Parser de respuesta IPP ──────────────────────────────────────────────────

function parseIppAttr(buf: Buffer, attrName: string): string | null {
  let i = 8; // saltar cabecera de 8 bytes
  while (i < buf.length) {
    const tag = buf[i];
    // Group separators (0x01-0x05): avanzar 1 byte
    if (tag >= 0x01 && tag <= 0x05) { i++; continue; }
    // end-of-attributes
    if (tag === 0x03) break;
    if (i + 5 > buf.length) break;
    const nameLen  = buf.readUInt16BE(i + 1);
    const nameEnd  = i + 3 + nameLen;
    if (nameEnd + 2 > buf.length) break;
    const name     = buf.slice(i + 3, nameEnd).toString('utf8');
    const valueLen = buf.readUInt16BE(nameEnd);
    const valueEnd = nameEnd + 2 + valueLen;
    if (valueEnd > buf.length) break;
    if (name === attrName) return buf.slice(nameEnd + 2, valueEnd).toString('utf8');
    i = valueEnd;
  }
  return null;
}

function attemptIPP(ip: string, path: string): Promise<IppData | null> {
  return new Promise((resolve) => {
    const printerUri = `ipp://${ip}${path}`;
    const body       = buildIppRequest(printerUri);

    const req = http.request(
      {
        hostname: ip, port: IPP_PORT, path, method: 'POST',
        headers: { 'Content-Type': 'application/ipp', 'Content-Length': body.length },
        timeout: IPP_TIMEOUT,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          if (res.statusCode !== 200) { resolve(null); return; }
          const buf = Buffer.concat(chunks);
          if (buf.length < 8) { resolve(null); return; }
          // status-code (bytes 2-3): 0x0000-0x00FF = success class
          if (buf.readUInt16BE(2) > 0x00ff) { resolve(null); return; }

          const name   = parseIppAttr(buf, 'printer-name');
          const model  = parseIppAttr(buf, 'printer-make-and-model')
            ?? parseIppAttr(buf, 'printer-info');
          const serial = parseIppAttr(buf, 'printer-serial-number');

          if (!name && !model && !serial) { resolve(null); return; }
          resolve({ name, model, serial });
        });
      },
    );

    req.on('error',   () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

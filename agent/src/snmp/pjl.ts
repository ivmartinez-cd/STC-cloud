import net from 'net';

const PJL_PORT    = 9100;
const PJL_TIMEOUT = 3000;

export interface PjlData {
  totalPages: number | null;
  model:      string | null;
  serial:     string | null;
}

const UEL = '\x1b%-12345X';
const PJL_CMD =
  `${UEL}@PJL\r\n` +
  `@PJL INFO ID\r\n` +
  `@PJL INFO SERIALNUMBER\r\n` +
  `@PJL INFO PAGECOUNT\r\n` +
  `${UEL}`;

export function readDeviceViaPJL(ip: string): Promise<PjlData | null> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let raw = '';
    let settled = false;

    const finish = (result: PjlData | null) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(PJL_TIMEOUT);
    socket.once('connect', () => socket.write(PJL_CMD, 'binary'));
    socket.on('data', (chunk: Buffer) => { raw += chunk.toString('ascii'); });
    socket.once('timeout', () => finish(raw.length > 0 ? parsePjl(raw) : null));
    socket.once('close',   () => finish(raw.length > 0 ? parsePjl(raw) : null));
    socket.once('error',   () => finish(null));
    socket.connect(PJL_PORT, ip);
  });
}

function parsePjl(data: string): PjlData | null {
  if (!data.includes('@PJL')) return null;

  const modelMatch = data.match(/INFO\s+ID\s*=\s*"?([^\r\n"]+)"?/i) ?? 
                     data.match(/INFO\s+ID\s*[\r\n]+\s*"?([^\r\n"]+)"?/i);

  const pageMatch = data.match(/PAGECOUNT\s*=\s*(\d+)/i) ?? 
                    data.match(/PAGECOUNT\s*[\r\n]+\s*(\d+)/i);

  const serialMatch = data.match(/SERIALNUMBER\s*=\s*"?([^\s\r\n"]+)"?/i) ?? 
                      data.match(/SERIALNUMBER\s*[\r\n]+\s*"?([^\s\r\n"]+)"?/i);

  const totalPages = pageMatch ? parseInt(pageMatch[1], 10) : null;
  const model = modelMatch ? modelMatch[1].trim() : null;
  const serial = serialMatch ? serialMatch[1].trim() : null;

  if (totalPages === null && model === null && serial === null) return null;
  return { totalPages, model, serial };
}

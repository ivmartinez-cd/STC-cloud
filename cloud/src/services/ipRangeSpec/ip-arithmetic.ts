export function isValidOctet(s: string): boolean {
  if (!/^\d{1,3}$/.test(s)) return false;
  const n = Number(s);
  return n >= 0 && n <= 255;
}

export function isValidIpv4(ip: string): boolean {
  if (typeof ip !== "string") return false;
  const parts = ip.split(".");
  return parts.length === 4 && parts.every(isValidOctet);
}

/** Aritmética segura (multiplicación, no bitwise con signo) — a diferencia
 *  de `agent/src/core/NetworkUtils.ts:toN()`, que desborda a negativo para
 *  IPs con primer octeto ≥128 (bug latente preexistente, no se toca acá). */
export function ipToInt(ip: string): number {
  return ip.split(".").reduce((acc, o) => acc * 256 + Number(o), 0);
}

export function intToIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

export interface ParsedCidr {
  networkInt: number;
  broadcastInt: number;
  prefix: number;
}

/** Normaliza una IP de host dentro del bloque a la IP de red (ej.
 *  `192.168.1.5/24` se trata como `192.168.1.0/24`). */
export function parseCidr(cidr: string): ParsedCidr | null {
  const m = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/.exec(cidr.trim());
  if (!m) return null;
  const [, ip, prefixStr] = m;
  if (!isValidIpv4(ip)) return null;
  const prefix = Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  const hostBits = 32 - prefix;
  const blockSize = 2 ** hostBits;
  const networkInt = Math.floor(ipToInt(ip) / blockSize) * blockSize;
  const broadcastInt = networkInt + blockSize - 1;
  return { networkInt, broadcastInt, prefix };
}

const PRIVATE_BLOCKS: Array<[number, number]> = [
  [ipToInt("10.0.0.0"), ipToInt("10.255.255.255")],
  [ipToInt("172.16.0.0"), ipToInt("172.31.255.255")],
  [ipToInt("192.168.0.0"), ipToInt("192.168.255.255")],
  [ipToInt("127.0.0.0"), ipToInt("127.255.255.255")], // loopback
  [ipToInt("169.254.0.0"), ipToInt("169.254.255.255")], // link-local
];

export function isPrivateOrReserved(ipInt: number): boolean {
  return PRIVATE_BLOCKS.some(([s, e]) => ipInt >= s && ipInt <= e);
}

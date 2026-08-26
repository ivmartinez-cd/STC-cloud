import type {
  MaskedSnmpCredential, SnmpVersion,
  SnmpSecurityLevel, SnmpAuthProtocol, SnmpPrivProtocol,
} from '../../../shared/types/monitor';

export const AUTH_PROTOCOLS: SnmpAuthProtocol[] = ['md5', 'sha', 'sha224', 'sha256', 'sha384', 'sha512'];
export const PRIV_PROTOCOLS: SnmpPrivProtocol[] = ['des', 'aes', 'aes256b', 'aes256r'];
export const SECURITY_LEVELS: SnmpSecurityLevel[] = ['noAuthNoPriv', 'authNoPriv', 'authPriv'];

export const LABEL = 'block font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300';
export const INPUT = 'w-full rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-sans text-[12.5px] text-ink-900 outline-none focus:border-brand';

export interface Draft {
  version: SnmpVersion;
  label: string;
  community: string;
  username: string;
  security_level: SnmpSecurityLevel;
  auth_protocol: SnmpAuthProtocol;
  auth_key: string;
  priv_protocol: SnmpPrivProtocol;
  priv_key: string;
}

export function emptyDraft(): Draft {
  return {
    version: 'v2c', label: '', community: '',
    username: '', security_level: 'authPriv',
    // sha/aes por default — no aes256b/aes256r: son variantes no estándar,
    // mutuamente incompatibles entre sí, que casi ningún firmware de
    // impresora soporta. Un admin que necesite otra cosa la elige a mano.
    auth_protocol: 'sha', auth_key: '',
    priv_protocol: 'aes', priv_key: '',
  };
}

export type Row =
  | { kind: 'kept'; key: string; id: string; masked: MaskedSnmpCredential }
  | { kind: 'replace'; key: string; id: string; masked: MaskedSnmpCredential; draft: Draft }
  | { kind: 'new'; key: string; draft: Draft };

let keySeq = 0;
export const nextKey = () => `row-${++keySeq}`;

export function rowsFromMasked(list: MaskedSnmpCredential[]): Row[] {
  return list.map((masked) => ({ kind: 'kept' as const, key: nextKey(), id: masked.id, masked }));
}

export function versionLabel(v: SnmpVersion): string {
  return v === 'v1' ? 'v1' : v === 'v2c' ? 'v2c' : 'v3';
}

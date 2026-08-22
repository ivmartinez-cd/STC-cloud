declare module 'net-snmp' {
  export enum Version {
    Version1 = 0,
    Version2c = 1,
    Version3 = 2,
  }

  export interface SessionOptions {
    port?: number;
    retries?: number;
    timeout?: number;
    transport?: string;
    version?: Version;
    backoff?: number;
  }

  export interface Varbind {
    oid: string;
    type: number;
    value: string | number | Buffer | null;
  }

  export type FeedCallback = (varbinds: Varbind[]) => boolean | void;
  export type DoneCallback = (error: Error | null) => void;

  export interface Session {
    get(oids: string[], callback: (error: Error | null, varbinds: Varbind[]) => void): void;
    /** GETBULK iterativo sobre un subárbol (v2c). `feedCallback` recibe lotes de varbinds. */
    subtree(oid: string, maxRepetitions: number, feedCallback: FeedCallback, doneCallback: DoneCallback): void;
    walk(oid: string, maxRepetitions: number, feedCallback: FeedCallback, doneCallback: DoneCallback): void;
    close(): void;
  }

  export const Version1: Version;
  export const Version2c: Version;
  export const Version3: Version;

  export function createSession(target: string, community: string, options?: SessionOptions): Session;
  export function isVarbindError(varbind: Varbind): boolean;

  // ─── SNMPv3 ──────────────────────────────────────────────────────────────
  // Sólo se declara la dirección nombre→número que el código usa — los enums
  // reales son bidireccionales en runtime (`_expandConstantObject`), pero no
  // hace falta la inversa acá.

  export enum SecurityLevel {
    noAuthNoPriv = 1,
    authNoPriv = 2,
    authPriv = 3,
  }

  export enum AuthProtocols {
    none = 1,
    md5 = 2,
    sha = 3,
    sha224 = 4,
    sha256 = 5,
    sha384 = 6,
    sha512 = 7,
  }

  /** OJO: no contiguo — refleja los valores reales de net-snmp/index.js. */
  export enum PrivProtocols {
    none = 1,
    des = 2,
    aes = 4,
    aes256b = 6,
    aes256r = 8,
  }

  export interface V3User {
    name: string;
    level: SecurityLevel;
    authProtocol?: AuthProtocols;
    authKey?: string;
    privProtocol?: PrivProtocols;
    privKey?: string;
  }

  export interface V3SessionOptions extends SessionOptions {
    engineID?: string | Buffer;
    context?: string;
  }

  export function createV3Session(target: string, user: V3User, options?: V3SessionOptions): Session;

  // ─── Clasificación de errores (para distinguir credencial rechazada de host caído) ──

  export enum ResponseInvalidCode {
    EIp4AddressSize = 1,
    EUnknownObjectType = 2,
    EUnknownPduType = 3,
    ECouldNotDecrypt = 4,
    EAuthFailure = 5,
    EReqResOidNoMatch = 6,
    EOutOfOrder = 8,
    EVersionNoMatch = 9,
    ECommunityNoMatch = 10,
  }

  export class ResponseInvalidError extends Error {
    code: ResponseInvalidCode;
  }

  export class RequestTimedOutError extends Error {}

  // ─── Agent / Mib (sólo para el simulador de diagnóstico manual,
  // `tests/snmpSimulator.ts` — nunca se usa en el código productivo del
  // agente) ──────────────────────────────────────────────────────────────

  export enum AccessControlModelType {
    None = 0,
    Simple = 1,
  }

  export enum ObjectType {
    Boolean = 1,
    Integer = 2,
    BitString = 3,
    OctetString = 4,
    Null = 5,
    OID = 6,
  }

  export const MaxAccess: {
    'not-accessible': number;
    'accessible-for-notify': number;
    'read-only': number;
    'read-write': number;
    'read-create': number;
  };

  export enum MibProviderType {
    Scalar = 1,
    Table = 2,
  }

  export interface MibProvider {
    name: string;
    type: MibProviderType;
    oid: string;
    scalarType?: ObjectType;
    maxAccess?: number;
    handler?: (mibRequest: unknown) => void;
  }

  export interface Mib {
    registerProvider(provider: MibProvider): void;
    setScalarValue(name: string, value: string | number): void;
  }

  export interface Authorizer {
    addCommunity(community: string): void;
    addUser(user: V3User): void;
  }

  export interface Agent {
    getAuthorizer(): Authorizer;
    getMib(): Mib;
  }

  export interface AgentOptions {
    port?: number;
    disableAuthorization?: boolean;
    accessControlModelType?: AccessControlModelType;
    engineID?: string;
    address?: string | null;
    transport?: string;
  }

  export function createAgent(options: AgentOptions, callback: (error: Error | null, data?: unknown) => void): Agent;
}

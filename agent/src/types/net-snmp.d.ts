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
}

declare module 'net-snmp' {
  export function createSession(target: string, community: string, options?: any): any;
}

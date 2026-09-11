export interface IpRangeSpecInput {
  label?: string | null;
  start?: string;
  end?: string;
  cidr?: string;
  hostname?: string;
  exclude?: string[];
  credential_ids?: string[];
  /** Ausente o `true` = habilitado (toda la config ya guardada cae acá).
   *  `false` = se guarda pero NO se compila: el agente no lo ve nunca, ni
   *  siquiera sabe que este campo existe (ver `compile.ts`). */
  enabled?: boolean;
}

export interface CompiledRange {
  start: string;
  end: string;
  credential_ids?: string[];
}

export interface HostSpec {
  hostname: string;
  label: string | null;
  credential_ids?: string[];
}

export class IpRangeValidationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
  }
}

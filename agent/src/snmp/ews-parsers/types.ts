import { type Brand } from '../oids';

export interface SuppliesItem {
  percentage?: number | null;
  status?: string | null;
  /** Part number instalado (p. ej. "W2020A" / "414A (W2020A)" / "MLT-D201L"). */
  code?: string | null;
  /** Número de pedido recomendado por el EWS (p. ej. "W9090MC"), si difiere del instalado. */
  orderNumber?: string | null;
  serial?: string | null;
  capacity?: number | null;
  printed?: number | null;
  remainingPages?: number | null;
  /** Días restantes estimados (si la fuente los informa). */
  remainingDays?: number | null;
  /** Fechas en formato YYYYMMDD o ISO según la fuente. */
  firstInstallDate?: string | null;
  lastUseDate?: string | null;
}

export interface InputTrayInfo {
  name: string;
  paperType?: string | null;
  paperSize?: string | null;
  level?: number | null;
  capacity?: number | null;
  status?: string | null;
}

export interface OutputTrayInfo {
  name: string;
  capacity?: string | number | null;
  level?: number | null;
  status?: string | null;
}

export interface CounterRowDetail {
  print: number;
  report: number;
  total: number;
}

/** Trío mono/color/total (impresiones, equivalentes A4, dúplex…). */
export interface CounterTriple {
  mono?:  number | null;
  color?: number | null;
  total?: number | null;
}

export interface ScanCounters {
  copy?:  number | null;
  send?:  number | null;
  fax?:   number | null;
  total?: number | null;
}

export interface DetailedCounters {
  monoSimplex?: CounterRowDetail;
  duplex?: CounterRowDetail;
  colorSimplex?: CounterRowDetail;
  colorDuplex?: CounterRowDetail;
  totalImpressions?: CounterRowDetail;
  /** Desglose por función (HP UsagePage, Samsung counters.json). */
  print?:        CounterTriple;
  copy?:         CounterTriple;
  fax?:          CounterTriple;
  /** Impresiones equivalentes Carta/A4 (HP) — lo que SDS llama "equivalente a A4". */
  equivalentA4?: CounterTriple;
  /** Equivalentes dúplex (HP). */
  duplexEquivalent?: CounterTriple;
  scans?:        ScanCounters;
  /** Ciclos del motor (HP ConfigurationPage) — coincide con prtMarkerLifeCount. */
  engineCycles?:      number | null;
  colorEngineCycles?: number | null;
}

/** Datos del dispositivo que no tienen columna propia en el servidor (viajan en supplies_details.device). */
export interface DeviceExtraInfo {
  /** Número de producto / SKU (HP "Número de modelo", p. ej. 3QA75A). */
  sku?:              string | null;
  /** Alias configurado por el usuario en el panel/EWS (p. ej. TECNO-47528). */
  alias?:            string | null;
  /** Nombre DNS/sysName (p. ej. NPI3AE910). */
  dnsName?:          string | null;
  firmwarePackage?:  string | null;
  firmwareRevision?: string | null;
  firmwareDate?:     string | null;
  platform?:         string | null;
  formatterNumber?:  string | null;
  ramMb?:            number | null;
  manufacturer?:     string | null;
}

export interface SuppliesDetails {
  toners?: {
    black?: SuppliesItem;
    cyan?: SuppliesItem;
    magenta?: SuppliesItem;
    yellow?: SuppliesItem;
  };
  drums?: {
    black?: SuppliesItem;
    cyan?: SuppliesItem;
    magenta?: SuppliesItem;
    yellow?: SuppliesItem;
  };
  maintenance?: {
    fuser?: SuppliesItem;
    transferBelt?: SuppliesItem;
    transferRoller?: SuppliesItem;
    tray1Roller?: SuppliesItem;
    tray1RetardRoller?: SuppliesItem;
    mpTrayRoller?: SuppliesItem;
    mpTrayRetardRoller?: SuppliesItem;
    wasteToner?: SuppliesItem;
    other?: Array<{ name: string; percentage?: number | null; status?: string | null; maxCapacity?: number | null; currentCount?: number | null }>;
  };
  inputTrays?: InputTrayInfo[];
  outputTrays?: OutputTrayInfo[];
  alerts?: Array<{ code?: string; description?: string; severity?: string; time?: string }>;
  counters?: DetailedCounters;
  device?: DeviceExtraInfo;
}

export interface EwsData {
  brand:          Brand;
  model:          string | null;
  serial:         string | null;
  mac?:           string | null;
  hostname?:      string | null;
  location?:      string | null;
  totalPages:     number | null;
  monoPages:      number | null;
  colorPages:     number | null;
  tonerBlack?:    number | null;
  tonerCyan?:     number | null;
  tonerMagenta?:  number | null;
  tonerYellow?:   number | null;
  firmware?:      string | null;
  suppliesDetails?: SuppliesDetails | null;
  // Cartridge identity fields (from EWS supplies endpoint)
  cartridgeCodeBlack?:      string | null;
  cartridgeCodeCyan?:       string | null;
  cartridgeCodeMagenta?:    string | null;
  cartridgeCodeYellow?:     string | null;
  cartridgeSerialBlack?:    string | null;
  cartridgeSerialCyan?:     string | null;
  cartridgeSerialMagenta?:  string | null;
  cartridgeSerialYellow?:   string | null;
  cartridgeCapacityBlack?:  number | null;
  cartridgeCapacityCyan?:   number | null;
  cartridgeCapacityMagenta?: number | null;
  cartridgeCapacityYellow?: number | null;
  cartridgePrintedBlack?:   number | null;
  cartridgePrintedCyan?:    number | null;
  cartridgePrintedMagenta?: number | null;
  cartridgePrintedYellow?:  number | null;
  cartridgeEstimatedBlack?:   number | null;
  cartridgeEstimatedCyan?:    number | null;
  cartridgeEstimatedMagenta?: number | null;
  cartridgeEstimatedYellow?:  number | null;
}

export type Parser = (body: string) => Partial<EwsData>;

export interface EwsCandidate {
  path: string;
  protocol: 'http' | 'https';
  parse: Parser;
  brand?: Brand;
  produces?: 'meters' | 'supplies'; // undefined = identity-only or unknown; used by targeted loops
}

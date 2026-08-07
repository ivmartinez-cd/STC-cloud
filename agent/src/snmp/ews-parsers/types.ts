import { type Brand } from '../oids';

export interface SuppliesItem {
  percentage?: number | null;
  status?: string | null;
  code?: string | null;
  serial?: string | null;
  capacity?: number | null;
  printed?: number | null;
  remainingPages?: number | null;
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

export interface DetailedCounters {
  monoSimplex?: CounterRowDetail;
  duplex?: CounterRowDetail;
  colorSimplex?: CounterRowDetail;
  colorDuplex?: CounterRowDetail;
  totalImpressions?: CounterRowDetail;
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

export interface SuppliesItem {
  percentage?: number | null;
  status?: string | null;
  /** Part number instalado (p. ej. W2020A, MLT-D201L). */
  code?: string | null;
  /** Número de pedido recomendado por el equipo (si difiere del instalado). */
  orderNumber?: string | null;
  serial?: string | null;
  capacity?: number | null;
  printed?: number | null;
  remainingPages?: number | null;
  remainingDays?: number | null;
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
  print?:            CounterTriple;
  copy?:             CounterTriple;
  fax?:              CounterTriple;
  equivalentA4?:     CounterTriple;
  duplexEquivalent?: CounterTriple;
  scans?:            ScanCounters;
  engineCycles?:      number | null;
  colorEngineCycles?: number | null;
}

/** Datos del equipo sin columna propia (llegan en supplies_details.device). */
export interface DeviceExtraInfo {
  sku?:              string | null;
  alias?:            string | null;
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

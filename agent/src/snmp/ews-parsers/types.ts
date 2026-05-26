import { type Brand } from '../oids';

export interface EwsData {
  brand:          Brand;
  model:          string | null;
  serial:         string | null;
  totalPages:     number | null;
  monoPages:      number | null;
  colorPages:     number | null;
  tonerBlack?:    number | null;
  tonerCyan?:     number | null;
  tonerMagenta?:  number | null;
  tonerYellow?:   number | null;
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
}

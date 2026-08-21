/**
 * Contrato plano de lectura que viaja a la cola SQLite y al endpoint `/api/v1/devices/sync`.
 * NO cambiar nombres de campos sin migrar `readings_queue` y el schema Ajv del servidor.
 */
import type { Brand } from '../snmp/oids';
import type { SuppliesDetails } from '../snmp/ews-parsers/types';
import type { PollMethod } from './types';

export type { PollMethod };

export interface DeviceReading {
  ip:             string;
  brand:          Brand;
  model:          string;
  sysDescr:       string;
  sysName:        string;
  serial:         string | null;
  total_pages:    number | null;
  mono_pages:     number | null;
  color_pages:    number | null;
  toner_black?:   number | null;
  toner_cyan?:    number | null;
  toner_magenta?: number | null;
  toner_yellow?:  number | null;
  cartridge_code_black?:       string | null;
  cartridge_code_cyan?:        string | null;
  cartridge_code_magenta?:     string | null;
  cartridge_code_yellow?:      string | null;
  cartridge_serial_black?:     string | null;
  cartridge_serial_cyan?:      string | null;
  cartridge_serial_magenta?:   string | null;
  cartridge_serial_yellow?:    string | null;
  cartridge_capacity_black?:   number | null;
  cartridge_capacity_cyan?:    number | null;
  cartridge_capacity_magenta?: number | null;
  cartridge_capacity_yellow?:  number | null;
  cartridge_printed_black?:    number | null;
  cartridge_printed_cyan?:     number | null;
  cartridge_printed_magenta?:  number | null;
  cartridge_printed_yellow?:   number | null;
  cartridge_estimated_black?:    number | null;
  cartridge_estimated_cyan?:     number | null;
  cartridge_estimated_magenta?:  number | null;
  cartridge_estimated_yellow?:   number | null;
  supplies_details?:           SuppliesDetails | null;
  firmware?:                   string | null;
  mac?:                        string | null;
  hostname?:                   string | null;
  location?:                   string | null;
  time:           string;
  poll_method:    PollMethod;
}

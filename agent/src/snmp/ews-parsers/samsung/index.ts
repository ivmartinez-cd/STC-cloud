import { scanSamsung4020 } from './sl-m4020';
import { scanSamsung4072 } from './sl-m4072';
import { scanSamsungX4300 } from './x4300';
import { type EwsData } from '../types';

export async function scanSamsungDevice(ip: string, modelName?: string): Promise<Partial<EwsData> | null> {
  const model = modelName || '';

  if (/4020|3820|3320|M4020|SL-M4020/i.test(model)) {
    return scanSamsung4020(ip);
  }

  if (/4072|4070|3870|M4072|SL-M4072/i.test(model)) {
    return scanSamsung4072(ip);
  }

  if (/X4300|K4300|X4250|K4250|MultiXpress/i.test(model)) {
    return scanSamsungX4300(ip);
  }

  // Default strategy for standard Samsung SyncThru mono & color printers
  const result = await scanSamsung4020(ip);
  if (result && (result.model || result.serial)) return result;

  return null;
}

export * from './sl-m4020';
export * from './sl-m4072';
export * from './x4300';

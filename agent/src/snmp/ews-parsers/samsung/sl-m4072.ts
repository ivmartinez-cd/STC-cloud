import { type EwsData } from '../types';
import { scanSamsung4020 } from './sl-m4020';

export async function scanSamsung4072(ip: string): Promise<Partial<EwsData> | null> {
  // 4072/4070 series shares identical SyncThru JSON endpoints as 4020 with ADF scanner extras
  const data = await scanSamsung4020(ip);
  if (!data) return null;

  if (data.suppliesDetails?.inputTrays) {
    data.suppliesDetails.inputTrays.push({
      name: 'ADF Feeder',
      paperType: 'Plain',
      paperSize: 'A4',
      capacity: 50,
      level: 100,
      status: 'Ready'
    });
  }

  return data;
}

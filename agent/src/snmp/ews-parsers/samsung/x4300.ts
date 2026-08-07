import { type EwsData } from '../types';
import { fetchHttp } from '../../ews';

export async function scanSamsungX4300(ip: string): Promise<Partial<EwsData> | null> {
  const [swsInfoBody, countersBody, alertsBody] = await Promise.all([
    fetchHttp(ip, '/sws.application/home/homeDeviceInfo.sws', 'http'),
    fetchHttp(ip, '/sws/app/information/counters/counters.json', 'http'),
    fetchHttp(ip, '/sws/app/information/activealert/activealert.json', 'http'),
  ]);

  if (!swsInfoBody && !countersBody) return null;

  const result: Partial<EwsData> = { brand: 'samsung' };

  if (swsInfoBody) {
    const modelM  = swsInfoBody.match(/productName\s*:\s*"([^"]+)"/i);
    const serialM = swsInfoBody.match(/serialNumber\s*:\s*"([^"]+)"/i);
    const macM    = swsInfoBody.match(/macAddress\s*:\s*"([^"]+)"/i);
    const hostM   = swsInfoBody.match(/hostName\s*:\s*"([^"]+)"/i);

    if (modelM)  result.model    = modelM[1].trim();
    if (serialM) result.serial   = serialM[1].trim();
    if (macM)    result.mac      = macM[1].trim();
    if (hostM)   result.hostname = hostM[1].trim();
  }

  if (countersBody) {
    const totalM = countersBody.match(/GXI_BILLING_TOTAL_IMP_CNT\s*:\s*(\d+)/i);
    const monoM  = countersBody.match(/GXI_BILLING_SIMPLEX_BW_PRINT_CNT\s*:\s*(\d+)/i);
    const colorM = countersBody.match(/GXI_BILLING_SIMPLEX_COLOR_TOTAL_CNT\s*:\s*(\d+)/i);

    if (totalM) result.totalPages = parseInt(totalM[1], 10);
    if (monoM)  result.monoPages  = parseInt(monoM[1], 10);
    if (colorM) result.colorPages = parseInt(colorM[1], 10);
  }

  return result;
}

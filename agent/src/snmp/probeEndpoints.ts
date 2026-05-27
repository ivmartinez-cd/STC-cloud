import { fetchHttp } from './ews';

const devices = [
  { ip: '192.168.176.40', brand: 'Samsung SL-M4072FD' },
  { ip: '192.168.176.43', brand: 'Samsung X4300LX' },
  { ip: '192.168.176.51', brand: 'Samsung SCX-483x' },
  { ip: '192.168.176.46', brand: 'Samsung SL-M4020ND' },
  { ip: '192.168.176.55', brand: 'Samsung CLP-680' },
  { ip: '192.168.176.53', brand: 'Lexmark X656de' },
  { ip: '192.168.176.54', brand: 'Lexmark X656de' },
  { ip: '192.168.176.59', brand: 'Samsung SL-M4072FD' },
  { ip: '192.168.176.61', brand: 'Samsung M5370LX' },
  { ip: '192.168.176.62', brand: 'Samsung SL-M4020ND' },
  { ip: '192.168.176.203', brand: 'HP LaserJet E40040' },
];

const endpoints = [
  // Samsung
  '/sws/app/information/home/home.json',
  '/sws.application/home/homeDeviceInfo.sws',
  '/sws/app/information/status/status.json',
  '/Information/info_general.htm',
  '/Information/printer_status.htm',
  
  // Lexmark
  '/cgi-bin/dynamic/printer/PrinterStatus.html',
  '/cgi-bin/dynamic/printer/config/reports/deviceinfo.html',

  // HP
  '/DevMgmt/DeviceStatus.xml',
  '/DevMgmt/ProductStatusDyn.xml',
  '/hp/device/InternalPages/Index?id=DeviceStatus',
  '/hp/device/InternalPages/Index?id=SuppliesStatus',
];

async function scanStatusEndpoints() {
  console.log('Probing potential EWS status endpoints...');
  for (const { ip, brand } of devices) {
    console.log(`\n================================`);
    console.log(`IP: ${ip} (${brand})`);
    
    let found = false;
    for (const ep of endpoints) {
      try {
        const body = await fetchHttp(ip, ep, 'http');
        if (body) {
          // If body has more than 50 characters, it's likely a real response and not an empty page
          if (body.trim().length > 50) {
            const snippet = body.replace(/[\r\n\t]+/g, ' ').trim().substring(0, 100);
            console.log(`✅ FOUND: ${ep}`);
            console.log(`   Preview: ${snippet}...`);
            found = true;
          }
        }
      } catch (err) {
        // Suppress timeout errors
      }
    }
    if (!found) {
      console.log(`❌ No known status endpoint matched.`);
    }
  }
}

scanStatusEndpoints().catch(console.error);

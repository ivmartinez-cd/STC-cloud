import { readDevice } from './scanner';

const ips = [
  '192.168.176.40',
  '192.168.176.43',
  '192.168.176.51',
  '192.168.176.46',
  '192.168.176.55',
  '192.168.176.53',
  '192.168.176.54',
  '192.168.176.59',
  '192.168.176.61',
  '192.168.176.62',
  '192.168.176.203',
];

async function runTests() {
  console.log('Testing EWS on provided IPs...');
  for (const ip of ips) {
    try {
      console.log(`\n-----------------------------------`);
      console.log(`Testing ${ip}...`);
      const result = await readDevice(ip, 'public');
      if (result) {
        console.log(`✅ Success for ${ip}`);
        console.log(`   Brand: ${result.brand}, Model: ${result.model}`);
        console.log(`   Pages: ${result.total_pages}, Method: ${result.poll_method}`);
      } else {
        console.log(`❌ Failed for ${ip}`);
      }
    } catch (err) {
      console.error(`⚠️ Error testing ${ip}:`, err);
    }
  }
}

runTests().catch(console.error);

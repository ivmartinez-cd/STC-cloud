import { readDevice } from './scanner';

async function testIp() {
  const targetIp = process.argv[2] || '192.168.178.45';
  console.log(`=== Testing Printer Scanning for IP: ${targetIp} ===`);
  try {
    const result = await readDevice(targetIp, 'public');
    if (result) {
      console.log('\n✅ Scanner Result:');
      console.dir(result, { depth: null });
    } else {
      console.log('\n❌ Device did not respond or is not a printer.');
    }
  } catch (err) {
    console.error('\n⚠️ Error during scan test:', err);
  }
}

testIp().catch(console.error);

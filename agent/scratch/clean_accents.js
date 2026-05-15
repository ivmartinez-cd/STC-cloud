const fs = require('fs');
const path = require('path');

const replacements = {
  'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
  'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U',
  'ñ': 'n', 'Ñ': 'N', '¡': '', '¿': ''
};

function cleanContent(content) {
  let newContent = content;
  for (const [key, value] of Object.entries(replacements)) {
    newContent = newContent.split(key).join(value);
  }
  return newContent;
}

const files = [
  'agent/src/core/main.ts',
  'agent/src/core/config.ts',
  'agent/src/core/ConsoleConnector.ts',
  'agent/src/core/ConsoleEngine.ts',
  'agent/src/core/LogTailer.ts',
  'agent/src/core/security.ts',
  'agent/src/core/SocketManager.ts',
  'agent/src/snmp/scanner.ts',
  'agent/src/snmp/oids.ts',
  'agent/src/sync/database.ts',
  'agent/src/sync/uploader.ts'
];

for (const file of files) {
  const absPath = path.join('c:/Users/imartinez.CDSA/Desktop/Proyectos/STC cloud', file);
  if (fs.existsSync(absPath)) {
    console.log(`Cleaning ${file}...`);
    const content = fs.readFileSync(absPath, 'utf8');
    const cleaned = cleanContent(content);
    fs.writeFileSync(absPath, cleaned, 'utf8');
  } else {
    console.warn(`File not found: ${absPath}`);
  }
}

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Fase 4 (feature-slices): las páginas viven en src/features/<feature>/pages/.
// Se recorre features/ entero pero sólo se chequean los .tsx bajo un directorio
// `pages/` — mismo alcance que el `src/pages/` plano de antes.
const PAGES_DIR = path.join(__dirname, '../src/features');

const IGNORED_COMPONENTS = new Set([
  'Link', 'BarChart', 'Bar', 'XAxis', 'YAxis', 'Tooltip', 
  'ResponsiveContainer', 'CartesianGrid', 'Cell', 'ConfirmModal',
  'StatusBadge', 'StatCard', 'MonitorStatusBadge', 'MonitorDetail',
  'ClientDetail', 'Outlet', 'Navigate', 'Route', 'Routes', 'BrowserRouter',
  'Provider', 'AuthContext', 'ToastContext', 'MonitorForm', 'AgentForm',
  'DeviceDetail', 'Reports', 'Settings', 'Dashboard', 'Login', 'App',
  'Fragment', 'Suspense', 'Portal', 'AreaChart', 'Area', 'Line', 'LineChart',
  'RechartsTooltip', 'PieChart', 'Pie', 'ErrorBoundary', 'Terminal',
  'AgentTable', 'CreateAgentModal', 'ConfigAgentModal', 'RegenKeyModal',
  'AgentConfig', 'Agent', 'Client', 'DashboardData', 'MonitorData', 'MonitorConfig', 'Thresholds', 'Reading', 'Device', 'Icon', 'PieChartIcon', 'DBUser',
  'ClientUsageChart', 'CreateMonitorModal', 'Tab', 'DeviceSummaryCard', 'MonitorSpecsCard', 'LicenseCard', 'DeviceInventoryTable', 'RemoteToolsPanel', 'EditMonitorModal',
  'ConfigTabPanel', 'EditFormData', 'ReportsTabPanel'
]);

function checkIcons(dir) {
  let hasErrors = false;
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (checkIcons(fullPath)) hasErrors = true;
      continue;
    }

    if (!file.endsWith('.tsx')) continue;
    if (!fullPath.includes(`${path.sep}pages${path.sep}`)) continue;

    const content = fs.readFileSync(fullPath, 'utf8');
    
    // Find lucide-react imports
    const importMatch = content.match(/import \{([^}]+)\} from 'lucide-react'/);
    const importedIcons = importMatch 
      ? importMatch[1].split(',').map(i => {
          const parts = i.trim().split(' as ');
          return parts[parts.length - 1];
        }) 
      : [];

    // Find used icons in JSX (uppercase tags)
    // Regex for <IconName followed by space, /, or >
    const usedIcons = new Set([...content.matchAll(/<([A-Z][a-zA-Z0-9]+)(?:\s|\/|>)/g)].map(m => m[1]));

    // Cualquier identificador importado de otro módulo o declarado en el archivo (componentes locales,
    // tipos usados como genéricos `api.get<Foo>`) no es un ícono faltante.
    const knownLocal = new Set();
    for (const m of content.matchAll(/import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"][^'"]+['"]/g)) {
      for (const part of m[1].split(',')) { const n = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop(); if (n) knownLocal.add(n); }
    }
    for (const m of content.matchAll(/import\s+([A-Z][A-Za-z0-9]*)\s*(?:,|from)/g)) knownLocal.add(m[1]);
    for (const m of content.matchAll(/\b(?:const|let|function|interface|type|class)\s+([A-Z][A-Za-z0-9]*)/g)) knownLocal.add(m[1]);

    const missing = [...usedIcons].filter(icon => 
      !importedIcons.includes(icon) && !IGNORED_COMPONENTS.has(icon) && !knownLocal.has(icon)
    );

    if (missing.length > 0) {
      console.error(`\x1b[31mError in ${fullPath}:\x1b[0m`);
      console.error(`  Missing icon imports: ${missing.join(', ')}`);
      hasErrors = true;
    }
  }
  return hasErrors;
}

console.log('Checking for missing icon imports...');
if (checkIcons(PAGES_DIR)) {
  process.exit(1);
} else {
  console.log('\x1b[32mAll icons are properly imported.\x1b[0m');
}

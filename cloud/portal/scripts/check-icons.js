import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGES_DIR = path.join(__dirname, '../src/pages');

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
  'AgentConfig', 'Agent', 'Client', 'DashboardData', 'MonitorData', 'MonitorConfig', 'Thresholds', 'Reading', 'Device', 'Icon', 'PieChartIcon'
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

    const missing = [...usedIcons].filter(icon => 
      !importedIcons.includes(icon) && !IGNORED_COMPONENTS.has(icon)
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

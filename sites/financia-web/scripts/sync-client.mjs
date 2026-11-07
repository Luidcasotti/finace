import { cpSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const project = fileURLToPath(new URL('../', import.meta.url));
if (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name !== 'financia')
  throw new Error('Execute a sincronização a partir da cópia do projeto no repositório financia.');
cpSync(join(root, 'src'), join(project, 'client/src'), { recursive: true });
cpSync(join(root, 'public'), join(project, 'client/public'), { recursive: true });
cpSync(join(root, 'index.html'), join(project, 'client/index.html'));
cpSync(join(root, 'server/finance.js'), join(project, 'worker/finance.js'));
console.log('Frontend e cálculos compartilhados sincronizados.');

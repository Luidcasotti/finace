import { openDatabase } from './database.js';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const config = readConfig();
if (config.production && !existsSync(resolve('dist/index.html'))) {
  throw new Error('Execute npm run build antes de iniciar a aplicação em produção.');
}
const db = openDatabase(config.databasePath);
const server = createApp(db, config).listen(config.port, config.host, () =>
  console.log(`financia: http://${config.host}:${config.port}`),
);
function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

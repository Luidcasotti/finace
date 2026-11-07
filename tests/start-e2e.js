import { spawn } from 'node:child_process';
import { openDatabase } from '../server/database.js';
import { createApp } from '../server/app.js';

// Always separate from the real application's persistent database.
const db = openDatabase('./data/e2e.db');
const server = createApp(db, {
  origin: 'http://127.0.0.1:4173',
  authLimit: 1000,
  production: false,
}).listen(3101, '127.0.0.1');
const vite = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4173', '--strictPort'],
  { stdio: 'inherit', env: { ...process.env, API_PORT: '3101' } },
);
function stop() {
  vite.kill();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
vite.on('exit', stop);

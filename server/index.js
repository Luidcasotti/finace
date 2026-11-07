import { openDatabase } from './database.js';
import { createApp } from './app.js';

const port = Number(process.env.PORT || 3001);
const production = process.env.NODE_ENV === 'production';
if (production && !process.env.APP_ORIGIN?.startsWith('https://')) throw new Error('Configure APP_ORIGIN com o endereço HTTPS da aplicação em produção.');
const db = openDatabase(process.env.DATABASE_PATH || './data/financia.db');
const server = createApp(db).listen(port, '127.0.0.1', () => console.log(`financia API: http://127.0.0.1:${port}`));
function shutdown() { server.close(() => { db.close(); process.exit(0); }); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

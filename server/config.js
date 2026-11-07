export function readConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const port = Number(env.PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT deve ser uma porta entre 1 e 65535.');
  }

  const rawOrigin =
    env.APP_ORIGIN || env.RENDER_EXTERNAL_URL || (production ? '' : 'http://localhost:5173');
  let parsed;
  try {
    parsed = new URL(rawOrigin);
  } catch {
    throw new Error('Configure APP_ORIGIN com o endereço da aplicação.');
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      'APP_ORIGIN deve conter somente a origem, sem caminho, credenciais ou parâmetros.',
    );
  }
  if (production && parsed.protocol !== 'https:') {
    throw new Error('Configure APP_ORIGIN com HTTPS em produção.');
  }
  if (production && env.RENDER === 'true' && !env.DATABASE_PATH) {
    throw new Error('Configure DATABASE_PATH dentro do disco persistente do Render.');
  }
  const timeZone = env.APP_TIMEZONE || 'America/Rio_Branco';
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone }).format();
  } catch {
    throw new Error('APP_TIMEZONE deve ser um fuso horário válido.');
  }

  return {
    production,
    port,
    origin: parsed.origin,
    host: env.HOST || (production ? '0.0.0.0' : '127.0.0.1'),
    databasePath: env.DATABASE_PATH || './data/financia.db',
    timeZone,
  };
}

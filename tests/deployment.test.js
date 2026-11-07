import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readConfig } from '../server/config.js';
import { createApp } from '../server/app.js';
import { openDatabase } from '../server/database.js';

test('configuração local mantém origem e rede de desenvolvimento', () => {
  const config = readConfig({});
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 3001);
  assert.equal(config.origin, 'http://localhost:5173');
});

test('Render usa endereço HTTPS do provedor e disco explicitamente configurado', () => {
  const config = readConfig({
    NODE_ENV: 'production',
    RENDER: 'true',
    RENDER_EXTERNAL_URL: 'https://financia-test.onrender.com/',
    PORT: '10000',
    DATABASE_PATH: '/var/data/financia.db',
  });
  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.port, 10000);
  assert.equal(config.origin, 'https://financia-test.onrender.com');
  assert.equal(config.databasePath, '/var/data/financia.db');
  const custom = readConfig({
    NODE_ENV: 'production',
    APP_ORIGIN: 'https://financas.example.com',
    RENDER_EXTERNAL_URL: 'https://financia-test.onrender.com',
  });
  assert.equal(custom.origin, 'https://financas.example.com');
});

test('configuração rejeita origem insegura, porta inválida e Render sem disco configurado', () => {
  for (const APP_ORIGIN of [
    'http://financia.example.com',
    'https://financia.example.com/caminho',
    'https://user:pass@financia.example.com',
    'https://financia.example.com?teste=1',
    'https://financia.example.com#abc',
    'não-é-uma-url',
  ]) {
    assert.throws(() => readConfig({ NODE_ENV: 'production', APP_ORIGIN }));
  }
  for (const PORT of ['0', '-1', '65536', '3001.2', 'inválida'])
    assert.throws(() => readConfig({ PORT }));
  assert.throws(
    () =>
      readConfig({
        NODE_ENV: 'production',
        RENDER: 'true',
        RENDER_EXTERNAL_URL: 'https://financia-test.onrender.com',
      }),
    /disco persistente/,
  );
  assert.throws(() => readConfig({ APP_TIMEZONE: 'Fuso/inexistente' }));
});

test('health check é público; cadastro em produção exige origem correta e emite cookie Secure', async (t) => {
  const db = openDatabase(':memory:');
  const origin = 'https://financia-test.onrender.com';
  const server = createApp(db, { production: true, origin }).listen(0, '0.0.0.0');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await fetch(`${base}/healthz`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });
  assert.equal(health.headers.get('cache-control'), 'no-store');
  const body = JSON.stringify({
    name: 'Teste produção',
    email: 'production@example.com',
    password: 'senha-de-teste-segura',
  });
  const send = (requestOrigin) =>
    fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: requestOrigin },
      body,
    });
  assert.equal((await send('https://outro.example.com')).status, 403);
  const result = await send(origin);
  assert.equal(result.status, 201);
  assert.match(result.headers.get('set-cookie'), /Secure/);
  assert.match(result.headers.get('set-cookie'), /HttpOnly/);
  const cookie = result.headers.get('set-cookie').split(';')[0];
  const me = await fetch(`${base}/api/auth/me`, { headers: { Cookie: cookie } });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.email, 'production@example.com');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../server/database.js';
import { createApp } from '../server/app.js';

async function fixture(t, db = openDatabase(':memory:')) {
  const server = createApp(db, { origin: 'http://localhost:5173', authLimit: 1000 }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, { method = 'GET', body, cookie, origin = 'http://localhost:5173' } = {}) {
    const response = await fetch(`${base}/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0], headers: response.headers };
  }
  async function register(email) {
    const response = await request('/auth/register', { method: 'POST', body: { name: 'Pessoa teste', email, password: 'senha-segura-123' } });
    assert.equal(response.status, 201);
    return response.cookie;
  }
  return { request, register, db };
}
const income = { kind: 'income', title: 'Salário', category: 'Salário', amount: 500000, due_date: '2026-01-05', settled_on: '2026-01-05', recurring: false };

test('autenticação real: hash, cookie protegido, login, expiração e logout', async t => {
  const { request, register, db } = await fixture(t);
  assert.equal((await request('/dashboard')).status, 401);
  const cookie = await register('pessoa@example.com');
  assert.notEqual(db.prepare('SELECT password_hash FROM users').get().password_hash, 'senha-segura-123');
  assert.equal((await request('/auth/me', { cookie })).status, 200);
  assert.equal((await request('/auth/login', { method: 'POST', body: { email: 'pessoa@example.com', password: 'errada' } })).status, 401);
  const login = await request('/auth/login', { method: 'POST', body: { email: 'PESSOA@example.com', password: 'senha-segura-123' } });
  assert.equal(login.status, 200);
  assert.match(login.headers.get('set-cookie'), /HttpOnly/);
  assert.match(login.headers.get('set-cookie'), /SameSite=Strict/);
  assert.equal((await request('/auth/logout', { method: 'POST', body: {}, cookie: login.cookie })).status, 200);
  assert.equal((await request('/auth/me', { cookie: login.cookie })).status, 401);
  db.prepare('UPDATE sessions SET expires_at=0').run();
  assert.equal((await request('/auth/me', { cookie })).status, 401);
});

test('isolamento impede leitura e alteração de receitas, parcelas e reservas de outro usuário', async t => {
  const { request, register, db } = await fixture(t);
  const alice = await register('alice@example.com');
  const bob = await register('bob@example.com');
  const created = await request('/entries', { method: 'POST', cookie: alice, body: income });
  const reserve = await request('/reserves', { method: 'POST', cookie: alice, body: { title: 'Emergência', target: 1000000, deadline: null } });
  const plan = await request('/installments', { method: 'POST', cookie: alice, body: { title: 'Notebook', category: 'Compras', total: 10000, count: 3, first_due: '2026-01-31' } });
  assert.equal(plan.status, 201);
  const dashboard = await request('/dashboard?month=2026-01', { cookie: bob });
  assert.equal(dashboard.data.entries.length, 0);
  assert.equal(dashboard.data.reserves.length, 0);
  assert.equal(dashboard.data.installments.length, 0);
  const { recurring: _recurring, ...edit } = income;
  assert.equal((await request(`/entries/${created.data.id}`, { method: 'PATCH', cookie: bob, body: edit })).status, 404);
  assert.equal((await request(`/entries/${created.data.id}/settlement`, { method: 'PATCH', cookie: bob, body: { settled_on: null } })).status, 404);
  assert.equal((await request(`/entries/${created.data.id}`, { method: 'DELETE', cookie: bob, body: {} })).status, 404);
  assert.equal((await request(`/reserves/${reserve.data.id}/transfers`, { method: 'POST', cookie: bob, body: { amount: 100, direction: 'withdraw', date: '2026-01-10' } })).status, 404);
  assert.equal((await request(`/reserves/${reserve.data.id}`, { method: 'PATCH', cookie: bob, body: { title: 'Alterada', target: 100, deadline: null } })).status, 404);
  const bobId = db.prepare("SELECT id FROM users WHERE email='bob@example.com'").get().id;
  assert.throws(() => db.prepare('INSERT INTO transfers(id,user_id,reserve_id,amount,date) VALUES (?,?,?,?,?)').run('bad', bobId, reserve.data.id, 100, '2026-01-10'), /FOREIGN KEY/);
});

test('validação rejeita centavos fracionários, campos extras, datas impossíveis e CSRF', async t => {
  const { request, register } = await fixture(t);
  const cookie = await register('validacao@example.com');
  for (const extra of [{ amount: 12.5 }, { due_date: '2026-02-30' }, { settled_on: '2099-01-01' }, { user_id: 'outra-pessoa' }, { amount: -100 }]) {
    assert.equal((await request('/entries', { method: 'POST', cookie, body: { ...income, ...extra } })).status, 400);
  }
  assert.equal((await request('/entries', { method: 'POST', cookie, body: income, origin: 'https://malicioso.example' })).status, 403);
  assert.equal((await request('/entries', { method: 'POST', cookie, body: income, origin: '' })).status, 403);
  assert.equal((await request('/dashboard?month=2026-13', { cookie })).status, 400);
});

test('parcelamento integra despesas uma vez, arredonda e aceita pagamento idempotente', async t => {
  const { request, register } = await fixture(t);
  const cookie = await register('parcelas@example.com');
  await request('/entries', { method: 'POST', cookie, body: income });
  await request('/installments', { method: 'POST', cookie, body: { title: 'Celular', category: 'Compras', total: 10000, count: 3, first_due: '2026-01-31' } });
  const get = () => request('/dashboard?month=2026-01', { cookie });
  let { data } = await get();
  const part = data.entries.find(e => e.installment_id);
  assert.equal(data.summary.expectedExpense, 3334);
  assert.deepEqual(data.installments[0].entries.map(e => e.due_date), ['2026-01-31', '2026-02-28', '2026-03-31']);
  for (let i = 0; i < 2; i++) assert.equal((await request(`/entries/${part.id}/settlement`, { method: 'PATCH', cookie, body: { settled_on: '2026-01-31' } })).status, 200);
  ({ data } = await get());
  assert.equal(data.summary.available, 500000 - 3334);
  assert.equal(data.summary.projected, 500000 - 3334);
  assert.equal(data.installments[0].remaining, 2);
  assert.equal(data.installments[0].outstanding, 6666);
  assert.equal((await get()).data.entries.filter(e => e.installment_id).length, 1);
});

test('reservas transferem dinheiro sem inflar receitas e protegem saldo e histórico', async t => {
  const { request, register } = await fixture(t);
  const cookie = await register('reservas@example.com');
  await request('/entries', { method: 'POST', cookie, body: income });
  const { data: reserve } = await request('/reserves', { method: 'POST', cookie, body: { title: 'Viagem', target: 1000000, deadline: null } });
  const transfer = (amount, direction, date = '2026-01-10') => request(`/reserves/${reserve.id}/transfers`, { method: 'POST', cookie, body: { amount, direction, date } });
  assert.equal((await transfer(100, 'deposit', '2026-01-01')).status, 400);
  assert.equal((await transfer(600000, 'deposit')).status, 400);
  assert.equal((await transfer(200000, 'deposit')).status, 201);
  assert.equal((await transfer(300000, 'withdraw')).status, 400);
  assert.equal((await transfer(50000, 'withdraw', '2026-01-12')).status, 201);
  assert.equal((await transfer(160000, 'withdraw', '2026-01-11')).status, 400);
  const { data } = await request('/dashboard?month=2026-01', { cookie });
  assert.equal(data.summary.available, 350000);
  assert.equal(data.summary.reserved, 150000);
  assert.equal(data.summary.receivedIncome, 500000);
  assert.equal(data.summary.paidExpense, 0);
  assert.equal(data.reserves[0].history.length, 2);
});

test('edição mensal de recorrência e cancelamento futuro preservam meses anteriores', async t => {
  const { request, register } = await fixture(t);
  const cookie = await register('recorrente@example.com');
  await request('/entries', { method: 'POST', cookie, body: { ...income, kind: 'expense', title: 'Energia', category: 'Moradia', amount: 10000, settled_on: null, recurring: true, due_date: '2026-01-31' } });
  const { data: feb } = await request('/dashboard?month=2026-02', { cookie });
  const e = feb.entries[0];
  assert.equal((await request(`/entries/${e.id}`, { method: 'PATCH', cookie, body: { kind: e.kind, title: e.title, category: e.category, amount: 15000, due_date: e.due_date, settled_on: null } })).status, 200);
  assert.equal((await request('/dashboard?month=2026-01', { cookie })).data.entries[0].amount, 10000);
  assert.equal((await request('/dashboard?month=2026-02', { cookie })).data.entries[0].amount, 15000);
  assert.equal((await request('/dashboard?month=2026-03', { cookie })).data.entries[0].amount, 10000);
  await request(`/entries/${e.id}`, { method: 'DELETE', cookie, body: { future: true } });
  assert.equal((await request('/dashboard?month=2026-04', { cookie })).data.entries.length, 0);
  assert.equal((await request('/dashboard?month=2026-01', { cookie })).data.entries.length, 1);
});

test('dados e sessões persistem após reabrir o banco em disco', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'financia-test-'));
  const path = join(directory, 'test.db');
  let db = openDatabase(path);
  db.prepare('INSERT INTO users(id,name,email,password_hash) VALUES (?,?,?,?)').run('u', 'Persistente', 'persist@example.com', 'hash');
  db.prepare('INSERT INTO entries(id,user_id,kind,title,category,amount,due_date) VALUES (?,?,?,?,?,?,?)').run('e', 'u', 'income', 'Salário', 'Salário', 10000, '2026-01-01');
  db.close();
  db = openDatabase(path);
  t.after(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });
  assert.equal(db.prepare('SELECT amount FROM entries WHERE id=?').get('e').amount, 10000);
});

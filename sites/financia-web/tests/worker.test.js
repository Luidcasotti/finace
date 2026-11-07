import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { handleApi } from '../worker/api.js';

function fixture(t) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url))
    .filter((f) => f.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  t.after(() => sqlite.close());
  let maxBatch = 0;
  function statement(sql, values = []) {
    return {
      bind: (...args) => statement(sql, args),
      first: async () => sqlite.prepare(sql).get(...values) || null,
      all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
      run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }),
      execute: () => ({ results: sqlite.prepare(sql).all(...values) }),
    };
  }
  const DB = {
    prepare: statement,
    batch: async (commands) => {
      maxBatch = Math.max(maxBatch, commands.length);
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = commands.map((c) => c.execute());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  const request = async (
    path,
    { user = 'alice', method = 'GET', body, origin = 'https://financia.example' } = {},
  ) => {
    const headers = { 'content-type': 'application/json', origin };
    if (user) {
      headers['oai-authenticated-user-id'] = user;
      headers['oai-authenticated-user-email'] = `${user}@example.com`;
    }
    const result = await handleApi(
      new Request(`https://financia.example${path}`, {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      { DB },
    );
    return { status: result.status, data: await result.json() };
  };
  return { request, sqlite, getMaxBatch: () => maxBatch };
}
const income = {
  kind: 'income',
  title: 'Salário',
  category: 'Salário',
  amount: 500000,
  due_date: '2026-01-05',
  settled_on: '2026-01-05',
  recurring: false,
};

test('identidade vem do Sites; requisições anônimas e de outra origem não acessam os dados', async (t) => {
  const { request } = fixture(t);
  assert.equal((await request('/api/auth/me', { user: null })).data.auth_mode, 'chatgpt');
  assert.equal((await request('/api/auth/me', { user: null })).data.user, null);
  assert.equal((await request('/api/dashboard', { user: null })).status, 401);
  assert.equal(
    (
      await request('/api/entries', {
        method: 'POST',
        body: income,
        origin: 'https://outro.example',
      })
    ).status,
    403,
  );
  assert.equal(
    (await request('/api/entries', { method: 'POST', body: { ...income, user_id: 'bob' } })).status,
    400,
  );
  assert.equal(
    (await request('/api/entries', { method: 'POST', body: { ...income, amount: 123.45 } })).status,
    400,
  );
});

test('usuários não leem ou alteram lançamentos, parcelas e reservas uns dos outros', async (t) => {
  const { request } = fixture(t);
  const e = await request('/api/entries', { method: 'POST', body: income });
  const r = await request('/api/reserves', {
    method: 'POST',
    body: { title: 'Emergência', target: 1000000, deadline: null },
  });
  await request('/api/installments', {
    method: 'POST',
    body: { title: 'Compra', category: 'Compras', total: 10000, count: 3, first_due: '2026-01-31' },
  });
  const bob = await request('/api/dashboard?month=2026-01', { user: 'bob' });
  assert.deepEqual(bob.data.entries, []);
  assert.deepEqual(bob.data.reserves, []);
  assert.deepEqual(bob.data.installments, []);
  for (const [path, method, body] of [
    [`/api/entries/${e.data.id}/settlement`, 'PATCH', { settled_on: null }],
    [`/api/entries/${e.data.id}`, 'DELETE', {}],
    [`/api/reserves/${r.data.id}`, 'PATCH', { title: 'Alterada', target: 100, deadline: null }],
    [
      `/api/reserves/${r.data.id}/transfers`,
      'POST',
      { amount: 100, direction: 'withdraw', date: '2026-01-10' },
    ],
  ])
    assert.equal((await request(path, { method, body, user: 'bob' })).status, 404);
});

test('parcelas arredondadas entram uma vez e pagamento repetido não duplica despesa', async (t) => {
  const { request } = fixture(t);
  await request('/api/entries', { method: 'POST', body: income });
  assert.equal(
    (
      await request('/api/installments', {
        method: 'POST',
        body: {
          title: 'Notebook',
          category: 'Compras',
          total: 10000,
          count: 3,
          first_due: '2026-01-31',
        },
      })
    ).status,
    201,
  );
  let d = (await request('/api/dashboard?month=2026-01')).data;
  assert.equal(d.summary.expectedExpense, 3334);
  assert.deepEqual(
    d.installments[0].entries.map((e) => e.due_date),
    ['2026-01-31', '2026-02-28', '2026-03-31'],
  );
  const part = d.entries.find((e) => e.installment_id);
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await request(`/api/entries/${part.id}/settlement`, {
          method: 'PATCH',
          body: { settled_on: '2026-01-31' },
        })
      ).status,
      200,
    );
  d = (await request('/api/dashboard?month=2026-01')).data;
  assert.equal(d.summary.available, 496666);
  assert.equal(d.summary.projected, 496666);
  assert.equal(d.installments[0].outstanding, 6666);
  assert.equal(d.installments[0].remaining, 2);
});

test('120 parcelas usam somente duas instruções no batch, abaixo dos limites de consultas por invocação', async (t) => {
  const { request, getMaxBatch } = fixture(t);
  const result = await request('/api/installments', {
    method: 'POST',
    body: {
      title: 'Compra longa',
      category: 'Compras',
      total: 1000001,
      count: 120,
      first_due: '2026-01-31',
    },
  });
  assert.equal(result.status, 201);
  assert.equal(getMaxBatch(), 2);
  const d = (await request('/api/dashboard?month=2026-01')).data;
  assert.equal(d.installments[0].entries.length, 120);
  assert.equal(
    d.installments[0].entries.reduce((s, e) => s + e.amount, 0),
    1000001,
  );
});

test('SQL de recorrência preserva meses curtos, alterações e exclusões', async (t) => {
  const { request } = fixture(t);
  await request('/api/entries', {
    method: 'POST',
    body: {
      ...income,
      kind: 'expense',
      title: 'Energia',
      category: 'Moradia',
      amount: 10000,
      due_date: '2024-01-31',
      settled_on: null,
      recurring: true,
    },
  });
  let d = (await request('/api/dashboard?month=2024-02')).data;
  const e = d.entries[0];
  assert.equal(e.due_date, '2024-02-29');
  assert.equal(
    (
      await request(`/api/entries/${e.id}`, {
        method: 'PATCH',
        body: {
          kind: e.kind,
          title: e.title,
          category: e.category,
          amount: 12000,
          due_date: '2024-02-25',
          settled_on: null,
        },
      })
    ).status,
    200,
  );
  d = (await request('/api/dashboard?month=2024-02')).data;
  assert.equal(d.entries.length, 1);
  assert.equal(d.entries[0].amount, 12000);
  assert.equal(
    (await request('/api/dashboard?month=2024-03')).data.entries[0].due_date,
    '2024-03-31',
  );
  await request(`/api/entries/${e.id}`, { method: 'DELETE', body: { future: true } });
  assert.equal((await request('/api/dashboard?month=2024-05')).data.entries.length, 0);
  assert.equal((await request('/api/dashboard?month=2024-01')).data.entries.length, 1);
});

test('transferências guardam saldos de forma atômica e protegem datas históricas', async (t) => {
  const { request } = fixture(t);
  await request('/api/entries', { method: 'POST', body: income });
  const r = (
    await request('/api/reserves', {
      method: 'POST',
      body: { title: 'Viagem', target: 1000000, deadline: null },
    })
  ).data;
  const transfer = (amount, direction, date = '2026-01-10') =>
    request(`/api/reserves/${r.id}/transfers`, {
      method: 'POST',
      body: { amount, direction, date },
    });
  assert.equal((await transfer(100, 'deposit', '2026-01-01')).status, 400);
  assert.equal((await transfer(350000, 'deposit')).status, 201);
  assert.equal((await transfer(350000, 'deposit')).status, 400);
  assert.equal((await transfer(100000, 'withdraw', '2026-01-12')).status, 201);
  assert.equal((await transfer(260000, 'withdraw', '2026-01-11')).status, 400);
  const d = (await request('/api/dashboard?month=2026-01')).data;
  assert.equal(d.summary.available, 250000);
  assert.equal(d.summary.reserved, 250000);
  assert.equal(d.summary.receivedIncome, 500000);
  assert.equal(d.summary.paidExpense, 0);
});

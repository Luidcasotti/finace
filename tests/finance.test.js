import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonths,
  validDate,
  splitInstallments,
  summarize,
  materializeRecurring,
} from '../server/finance.js';
import { openDatabase } from '../server/database.js';

test('parcelas somam o total exato, incluindo os centavos restantes', () => {
  assert.deepEqual(splitInstallments(10000, 3), [3334, 3333, 3333]);
  for (let count = 2; count <= 120; count++) {
    const parts = splitInstallments(1234567, count);
    assert.equal(
      parts.reduce((a, b) => a + b, 0),
      1234567,
    );
    assert.ok(Math.max(...parts) - Math.min(...parts) <= 1);
  }
  assert.throws(() => splitInstallments(1, 2));
  assert.throws(() => splitInstallments(10.5, 2));
});

test('vencimentos preservam o dia original após fevereiro e a virada do ano', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2026-01-31', 2), '2026-03-31');
  assert.equal(addMonths('2024-01-30', 1), '2024-02-29');
  assert.equal(addMonths('2024-01-29', 1), '2024-02-29');
  assert.equal(addMonths('2026-12-31', 1), '2027-01-31');
  assert.equal(validDate('2026-02-29'), false);
  assert.equal(validDate('2024-02-29'), true);
});

const entry = (kind, amount, due_date, settled_on = null) => ({
  kind,
  amount,
  due_date,
  settled_on,
});

test('receita prevista não é dinheiro disponível; reservas são transferências', () => {
  const rows = [
    entry('income', 500000, '2026-01-05', '2026-01-05'),
    entry('income', 100000, '2026-01-20'),
    entry('expense', 100000, '2026-01-10', '2026-01-10'),
    entry('expense', 50000, '2026-01-25'),
  ];
  const transfers = [
    { amount: 80000, date: '2026-01-12' },
    { amount: -30000, date: '2026-01-13' },
  ];
  const summary = summarize(rows, transfers, '2026-01');
  assert.equal(summary.available, 350000);
  assert.equal(summary.reserved, 50000);
  assert.equal(summary.projected, 400000);
  assert.equal(summary.receivedIncome, 500000);
  assert.equal(summary.paidExpense, 100000);
});

test('marcar uma despesa paga altera o disponível uma vez e preserva a projeção', () => {
  const rows = [
    entry('income', 10000, '2026-01-01', '2026-01-01'),
    entry('expense', 2500, '2026-01-10'),
  ];
  const before = summarize(rows, [], '2026-01');
  rows[1].settled_on = '2026-01-10';
  const after = summarize(rows, [], '2026-01');
  assert.equal(after.available, before.available - 2500);
  assert.equal(after.projected, before.projected);
  assert.equal(summarize(rows, [], '2026-01').available, 7500);
});

test('saldo acumula meses anteriores, pendências e ignora liquidações futuras ao mês', () => {
  const rows = [
    entry('income', 50000, '2025-12-01', '2025-12-01'),
    entry('expense', 10000, '2025-12-20'),
    entry('expense', 15000, '2026-01-25', '2026-02-01'),
    entry('income', 80000, '2026-02-05', '2026-02-05'),
  ];
  const result = summarize(rows, [{ amount: 5000, date: '2026-02-01' }], '2026-01');
  assert.equal(result.available, 50000);
  assert.equal(result.projected, 25000);
  assert.equal(result.reserved, 0);
});

test('recorrências são idempotentes e exclusão ou edição não recriam o mês', () => {
  const db = openDatabase(':memory:');
  try {
    db.prepare('INSERT INTO users(id,name,email,password_hash) VALUES (?,?,?,?)').run(
      'u',
      'Usuário',
      'u@test.com',
      'hash',
    );
    db.prepare(
      'INSERT INTO recurring(id,user_id,kind,title,category,amount,start_date) VALUES (?,?,?,?,?,?,?)',
    ).run('r', 'u', 'expense', 'Internet', 'Serviços', 10000, '2026-01-31');
    materializeRecurring(db, 'u', '2026-03');
    materializeRecurring(db, 'u', '2026-03');
    assert.equal(db.prepare('SELECT count(*) as n FROM entries').get().n, 3);
    assert.equal(
      db.prepare("SELECT due_date FROM entries WHERE occurrence_month='2026-02'").get().due_date,
      '2026-02-28',
    );
    db.prepare(
      "UPDATE entries SET due_date='2026-02-25',amount=12000 WHERE occurrence_month='2026-02'",
    ).run();
    db.prepare("UPDATE entries SET deleted=1 WHERE occurrence_month='2026-01'").run();
    materializeRecurring(db, 'u', '2026-03');
    assert.equal(db.prepare('SELECT count(*) as n FROM entries').get().n, 3);
    assert.equal(
      db.prepare("SELECT amount FROM entries WHERE occurrence_month='2026-02'").get().amount,
      12000,
    );
  } finally {
    db.close();
  }
});

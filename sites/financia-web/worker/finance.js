import { randomUUID } from 'node:crypto';

export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function today(timeZone = 'America/Rio_Branco') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  return `${parts.find((p) => p.type === 'year').value}-${parts.find((p) => p.type === 'month').value}-${parts.find((p) => p.type === 'day').value}`;
}

export function addMonths(date, offset) {
  const [year, month, day] = date.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + offset, 1, 12));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}

export function monthEnd(month) {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number, 0, 12)).toISOString().slice(0, 10);
}

export function splitInstallments(total, count) {
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(count) || count < 1 || total < count)
    throw new AppError('Valor ou quantidade de parcelas inválidos.');
  const base = Math.floor(total / count);
  return Array.from({ length: count }, (_, i) => base + (i < total % count ? 1 : 0));
}

export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function materializeRecurring(db, userId, month) {
  return transaction(db, () => {
    const rules = db
      .prepare('SELECT * FROM recurring WHERE user_id = ? AND substr(start_date,1,7) <= ?')
      .all(userId, month);
    const insert = db.prepare(`INSERT OR IGNORE INTO entries
      (id,user_id,kind,title,category,amount,due_date,recurring_id,occurrence_month)
      VALUES (?,?,?,?,?,?,?,?,?)`);
    for (const rule of rules) {
      const end = rule.end_month && rule.end_month < month ? rule.end_month : month;
      for (let offset = 0; offset <= 1212; offset++) {
        const date = addMonths(rule.start_date, offset);
        if (date.slice(0, 7) > end) break;
        insert.run(
          randomUUID(),
          userId,
          rule.kind,
          rule.title,
          rule.category,
          rule.amount,
          date,
          rule.id,
          date.slice(0, 7),
        );
      }
    }
  });
}

export function summarize(entries, transfers, month) {
  const cutoff = monthEnd(month);
  const active = entries.filter((e) => !e.deleted);
  const received = active.filter(
    (e) => e.kind === 'income' && e.settled_on && e.settled_on <= cutoff,
  );
  const paid = active.filter((e) => e.kind === 'expense' && e.settled_on && e.settled_on <= cutoff);
  const sum = (rows) => rows.reduce((total, row) => total + row.amount, 0);
  const reserved = sum(transfers.filter((t) => t.date <= cutoff));
  const available = sum(received) - sum(paid) - reserved;
  const pending = active.filter(
    (e) => e.due_date <= cutoff && (!e.settled_on || e.settled_on > cutoff),
  );
  return {
    available,
    reserved,
    projected:
      available +
      sum(pending.filter((e) => e.kind === 'income')) -
      sum(pending.filter((e) => e.kind === 'expense')),
    expectedIncome: sum(active.filter((e) => e.kind === 'income' && e.due_date.startsWith(month))),
    expectedExpense: sum(
      active.filter((e) => e.kind === 'expense' && e.due_date.startsWith(month)),
    ),
    receivedIncome: sum(received.filter((e) => e.settled_on.startsWith(month))),
    paidExpense: sum(paid.filter((e) => e.settled_on.startsWith(month))),
    pendingIncome: sum(pending.filter((e) => e.kind === 'income')),
    pendingExpense: sum(pending.filter((e) => e.kind === 'expense')),
  };
}

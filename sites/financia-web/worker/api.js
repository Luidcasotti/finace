import { z } from 'zod';
import {
  AppError,
  validDate,
  today,
  addMonths,
  monthEnd,
  splitInstallments,
  summarize,
} from './finance.js';
import { recurringSQL, transferSQL } from './sql.js';

z.config(z.locales.pt());
const money = z.number().int().positive().max(10_000_000_000);
const date = z
  .string()
  .refine(
    (v) => validDate(v) && v >= '2000-01-01' && v <= '2100-12-31',
    'Informe uma data válida entre 2000 e 2100.',
  );
const monthSchema = z.string().regex(/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/, 'Informe um mês válido.');
const title = z.string().trim().min(2).max(100);
const category = z.enum([
  'Salário',
  'Trabalho extra',
  'Investimentos',
  'Moradia',
  'Alimentação',
  'Transporte',
  'Saúde',
  'Educação',
  'Lazer',
  'Serviços',
  'Compras',
  'Outros',
]);
const entrySchema = z
  .object({
    kind: z.enum(['income', 'expense']),
    title,
    category,
    amount: money,
    due_date: date,
    settled_on: date.nullable(),
    recurring: z.boolean().default(false),
  })
  .strict();
const reserveSchema = z.object({ title, target: money, deadline: date.nullable() }).strict();
const uuid = () => crypto.randomUUID();
const response = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });

export function requestIdentity(request) {
  const id = request.headers.get('oai-authenticated-user-id');
  const email = request.headers.get('oai-authenticated-user-email');
  if (!id || !email) return null;
  let name = request.headers.get('oai-authenticated-user-full-name');
  if (
    name &&
    request.headers.get('oai-authenticated-user-full-name-encoding') === 'percent-encoded-utf-8'
  ) {
    try {
      name = decodeURIComponent(name);
    } catch {
      name = null;
    }
  }
  return { id, email, name: name || email.split('@')[0] };
}

async function readBody(request) {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
    throw new AppError('Envie os dados em JSON.', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError('Informe os dados da operação.');
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 24576) {
      await reader.cancel();
      throw new AppError('Os dados enviados ultrapassam o tamanho permitido.', 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AppError('Os dados enviados não são válidos.');
  }
}

export async function materialize(db, userId, month) {
  await db.prepare(recurringSQL).bind(userId, month, month).run();
}

export async function dashboard(db, userId, month, currentDate) {
  await materialize(db, userId, month);
  const results = await db.batch([
    db
      .prepare('SELECT * FROM entries WHERE user_id=? AND deleted=0 ORDER BY due_date,id')
      .bind(userId),
    db
      .prepare('SELECT * FROM transfers WHERE user_id=? ORDER BY date DESC,rowid DESC')
      .bind(userId),
    db.prepare('SELECT * FROM reserves WHERE user_id=? ORDER BY rowid').bind(userId),
    db
      .prepare('SELECT * FROM installments WHERE user_id=? ORDER BY first_due DESC,rowid DESC')
      .bind(userId),
  ]);
  const [allEntries, transfers, reserveRows, planRows] = results.map((r) => r.results);
  const cutoff = monthEnd(month);
  const reserves = reserveRows.map((r) => ({
    ...r,
    balance: transfers
      .filter((t) => t.reserve_id === r.id && t.date <= cutoff)
      .reduce((s, t) => s + t.amount, 0),
    current_balance: transfers
      .filter((t) => t.reserve_id === r.id)
      .reduce((s, t) => s + t.amount, 0),
    history: transfers.filter((t) => t.reserve_id === r.id && t.date <= cutoff),
  }));
  const installments = planRows.map((p) => {
    const parts = allEntries.filter((e) => e.installment_id === p.id);
    const paid = parts.filter((e) => e.settled_on && e.settled_on <= cutoff);
    const current = parts.find((e) => e.due_date.startsWith(month));
    return {
      ...p,
      paid: paid.length,
      remaining: parts.length - paid.length,
      outstanding: parts
        .filter((e) => !e.settled_on || e.settled_on > cutoff)
        .reduce((s, e) => s + e.amount, 0),
      current: current?.installment_number ?? null,
      entries: parts,
    };
  });
  return {
    month,
    today: currentDate,
    entries: allEntries.filter((e) => e.due_date.startsWith(month)),
    reserves,
    installments,
    summary: summarize(allEntries, transfers, month),
    upcoming: allEntries
      .filter(
        (e) =>
          e.kind === 'expense' && e.due_date <= cutoff && (!e.settled_on || e.settled_on > cutoff),
      )
      .slice(0, 6),
  };
}

async function ownedEntry(db, id, userId) {
  const row = await db
    .prepare('SELECT * FROM entries WHERE id=? AND user_id=? AND deleted=0')
    .bind(id, userId)
    .first();
  if (!row) throw new AppError('Lançamento não encontrado.', 404);
  return row;
}
async function ownedReserve(db, id, userId) {
  const row = await db
    .prepare('SELECT * FROM reserves WHERE id=? AND user_id=?')
    .bind(id, userId)
    .first();
  if (!row) throw new AppError('Reserva não encontrada.', 404);
  return row;
}

export async function handleApi(request, env) {
  try {
    const url = new URL(request.url),
      path = url.pathname,
      method = request.method;
    const currentDate = today(env.APP_TIMEZONE || 'America/Rio_Branco');
    if (path === '/healthz') {
      await env.DB.prepare('SELECT 1').first();
      return response({ status: 'ok' });
    }
    const user = requestIdentity(request);
    if (path === '/api/auth/me' && method === 'GET')
      return response({ user, today: currentDate, auth_mode: 'chatgpt' });
    if (!user) throw new AppError('Entre com sua conta ChatGPT para continuar.', 401);
    if (!env.DB) throw new Error('Database binding missing');
    const write = ['POST', 'PATCH', 'DELETE', 'PUT'].includes(method);
    if (write && request.headers.get('origin') !== (env.APP_ORIGIN || url.origin))
      throw new AppError('Origem da solicitação não permitida.', 403);
    const body = write ? await readBody(request) : null;
    await env.DB.prepare(
      'INSERT INTO users(id,name,email) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email WHERE name!=excluded.name OR email!=excluded.email',
    )
      .bind(user.id, user.name, user.email)
      .run();
    const db = env.DB,
      userId = user.id;
    if (write) {
      const window = Math.floor(Date.now() / 60000);
      const limit = await db
        .prepare(
          'INSERT INTO rate_limits(user_id,window,counter) VALUES (?,?,1) ON CONFLICT(user_id) DO UPDATE SET counter=CASE WHEN window=excluded.window THEN counter+1 ELSE 1 END,window=excluded.window RETURNING counter',
        )
        .bind(userId, window)
        .first();
      if (limit.counter > 120) throw new AppError('Muitas solicitações. Aguarde um minuto.', 429);
    }
    const ensureSettlement = (value) => {
      if (value && value > currentDate)
        throw new AppError('A data de recebimento ou pagamento não pode estar no futuro.');
    };

    if (path === '/api/dashboard' && method === 'GET')
      return response(
        await dashboard(
          db,
          userId,
          monthSchema.parse(url.searchParams.get('month') || currentDate.slice(0, 7)),
          currentDate,
        ),
      );
    if (path === '/api/entries' && method === 'POST') {
      const data = entrySchema.parse(body);
      ensureSettlement(data.settled_on);
      const id = uuid(),
        recurringId = data.recurring ? uuid() : null,
        commands = [];
      if (recurringId)
        commands.push(
          db
            .prepare(
              'INSERT INTO recurring(id,user_id,kind,title,category,amount,start_date) VALUES (?,?,?,?,?,?,?)',
            )
            .bind(
              recurringId,
              userId,
              data.kind,
              data.title,
              data.category,
              data.amount,
              data.due_date,
            ),
        );
      commands.push(
        db
          .prepare(
            'INSERT INTO entries(id,user_id,kind,title,category,amount,due_date,settled_on,recurring_id,occurrence_month) VALUES (?,?,?,?,?,?,?,?,?,?)',
          )
          .bind(
            id,
            userId,
            data.kind,
            data.title,
            data.category,
            data.amount,
            data.due_date,
            data.settled_on,
            recurringId,
            recurringId ? data.due_date.slice(0, 7) : null,
          ),
      );
      await db.batch(commands);
      return response({ id }, 201);
    }
    const entryMatch = path.match(/^\/api\/entries\/([^/]+)(?:\/(settlement))?$/);
    if (entryMatch) {
      const e = await ownedEntry(db, entryMatch[1], userId);
      if (method === 'PATCH' && entryMatch[2]) {
        const data = z.object({ settled_on: date.nullable() }).strict().parse(body);
        ensureSettlement(data.settled_on);
        await db
          .prepare('UPDATE entries SET settled_on=? WHERE id=? AND user_id=?')
          .bind(data.settled_on, e.id, userId)
          .run();
        return response({ ok: true });
      }
      if (method === 'PATCH' && !entryMatch[2]) {
        const data = entrySchema.omit({ recurring: true }).parse(body);
        ensureSettlement(data.settled_on);
        if (data.kind !== e.kind) throw new AppError('O tipo do lançamento não pode ser alterado.');
        if (e.installment_id && (e.amount !== data.amount || e.due_date !== data.due_date))
          throw new AppError('O valor e vencimento pertencem ao parcelamento original.');
        await db
          .prepare(
            'UPDATE entries SET title=?,category=?,amount=?,due_date=?,settled_on=? WHERE id=? AND user_id=?',
          )
          .bind(
            data.title,
            data.category,
            data.amount,
            data.due_date,
            data.settled_on,
            e.id,
            userId,
          )
          .run();
        return response({ ok: true });
      }
      if (method === 'DELETE' && !entryMatch[2]) {
        if (e.installment_id) throw new AppError('Uma parcela não pode ser excluída isoladamente.');
        const data = z
          .object({ future: z.boolean().default(false) })
          .strict()
          .parse(body);
        const commands = [
          db.prepare('UPDATE entries SET deleted=1 WHERE id=? AND user_id=?').bind(e.id, userId),
        ];
        if (data.future && e.recurring_id) {
          const end = addMonths(`${e.occurrence_month}-01`, -1).slice(0, 7);
          commands.push(
            db
              .prepare(
                'UPDATE recurring SET end_month=CASE WHEN end_month IS NULL OR end_month>? THEN ? ELSE end_month END WHERE id=? AND user_id=?',
              )
              .bind(end, end, e.recurring_id, userId),
            db
              .prepare(
                'UPDATE entries SET deleted=1 WHERE recurring_id=? AND user_id=? AND occurrence_month>=? AND settled_on IS NULL',
              )
              .bind(e.recurring_id, userId, e.occurrence_month),
          );
        }
        await db.batch(commands);
        return response({ ok: true });
      }
    }
    if (path === '/api/installments' && method === 'POST') {
      const data = z
        .object({
          title,
          category,
          total: money,
          count: z.number().int().min(2).max(120),
          first_due: date,
        })
        .strict()
        .parse(body);
      const amounts = splitInstallments(data.total, data.count);
      if (addMonths(data.first_due, data.count - 1) > '2100-12-31')
        throw new AppError('A última parcela deve vencer até 2100.');
      const id = uuid();
      const commands = [
        db
          .prepare(
            'INSERT INTO installments(id,user_id,title,category,total,count,first_due) VALUES (?,?,?,?,?,?,?)',
          )
          .bind(id, userId, data.title, data.category, data.total, data.count, data.first_due),
      ];
      const parts = amounts.map((amount, i) => ({
        amount,
        date: addMonths(data.first_due, i),
        number: i + 1,
      }));
      commands.push(
        db
          .prepare(
            "INSERT INTO entries(id,user_id,kind,title,category,amount,due_date,installment_id,installment_number) SELECT lower(hex(randomblob(16))),?,'expense',?,?,json_extract(value,'$.amount'),json_extract(value,'$.date'),?,json_extract(value,'$.number') FROM json_each(?)",
          )
          .bind(userId, data.title, data.category, id, JSON.stringify(parts)),
      );
      await db.batch(commands);
      return response({ id }, 201);
    }
    if (path === '/api/reserves' && method === 'POST') {
      const data = reserveSchema.parse(body),
        id = uuid();
      await db
        .prepare('INSERT INTO reserves(id,user_id,title,target,deadline) VALUES (?,?,?,?,?)')
        .bind(id, userId, data.title, data.target, data.deadline)
        .run();
      return response({ id }, 201);
    }
    const reserveMatch = path.match(/^\/api\/reserves\/([^/]+)(?:\/(transfers))?$/);
    if (reserveMatch) {
      await ownedReserve(db, reserveMatch[1], userId);
      if (method === 'PATCH' && !reserveMatch[2]) {
        const data = reserveSchema.parse(body);
        await db
          .prepare('UPDATE reserves SET title=?,target=?,deadline=? WHERE id=? AND user_id=?')
          .bind(data.title, data.target, data.deadline, reserveMatch[1], userId)
          .run();
        return response({ ok: true });
      }
      if (method === 'POST' && reserveMatch[2]) {
        const data = z
          .object({
            amount: money,
            direction: z.enum(['deposit', 'withdraw']),
            date,
            note: z.string().trim().max(200).default(''),
          })
          .strict()
          .parse(body);
        if (data.date > currentDate)
          throw new AppError('Uma movimentação não pode ter data futura.');
        const result = await db
          .prepare(transferSQL)
          .bind(
            data.date,
            currentDate,
            userId,
            data.date,
            userId,
            data.date,
            uuid(),
            userId,
            reserveMatch[1],
            data.direction === 'deposit' ? data.amount : -data.amount,
            data.date,
            data.note,
            data.direction,
            userId,
            reserveMatch[1],
            data.amount,
            userId,
            userId,
            data.amount,
          )
          .run();
        if (!result.meta.changes)
          throw new AppError(
            data.direction === 'deposit'
              ? 'O aporte supera o disponível nesta data ou em movimentações posteriores.'
              : 'A retirada supera o saldo da reserva nesta data ou em movimentações posteriores.',
          );
        return response({ ok: true }, 201);
      }
    }
    throw new AppError('Rota não encontrada.', 404);
  } catch (error) {
    if (error instanceof z.ZodError)
      return response(
        { error: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · ') },
        400,
      );
    if (error instanceof AppError) return response({ error: error.message }, error.status);
    console.error('Falha no financia:', error.message);
    return response({ error: 'Não foi possível concluir a ação. Tente novamente.' }, 500);
  }
}

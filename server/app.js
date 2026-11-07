import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { hashPassword, verifyPassword, createSession, sessionToken, tokenHash } from './auth.js';
import {
  AppError,
  validDate,
  today,
  addMonths,
  monthEnd,
  splitInstallments,
  transaction,
  materializeRecurring,
  summarize,
} from './finance.js';

z.config(z.locales.pt());

const money = z.number().int().positive().max(10_000_000_000);
const date = z
  .string()
  .refine(
    (v) => validDate(v) && v >= '2000-01-01' && v <= '2100-12-31',
    'Informe uma data válida entre 2000 e 2100.',
  );
const month = z.string().regex(/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/, 'Informe um mês válido.');
const title = z.string().trim().min(2, 'Use pelo menos 2 caracteres.').max(100);
const categories = [
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
];
const entrySchema = z
  .object({
    kind: z.enum(['income', 'expense']),
    title,
    category: z.enum(categories),
    amount: money,
    due_date: date,
    settled_on: date.nullable(),
    recurring: z.boolean().default(false),
  })
  .strict();
const reserveSchema = z.object({ title, target: money, deadline: date.nullable() }).strict();

export function createApp(db, options = {}) {
  const app = express();
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const origin = options.origin ?? process.env.APP_ORIGIN ?? 'http://localhost:5173';
  const timeZone = options.timeZone ?? process.env.APP_TIMEZONE ?? 'America/Rio_Branco';
  const currentDate = () => today(timeZone);
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: production ? undefined : false }));
  app.get('/healthz', (_req, res) => {
    db.prepare('SELECT 1').get();
    res.set('Cache-Control', 'no-store').json({ status: 'ok' });
  });
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(req.method)) {
      // The app and API share an origin. Cookie authentication never accepts cross-origin writes.
      if (req.headers.origin !== origin)
        return res.status(403).json({
          error: 'Origem da solicitação não permitida. Atualize a página e tente novamente.',
        });
      if (!req.is('application/json'))
        return res.status(415).json({ error: 'Envie os dados em JSON.' });
    }
    next();
  });
  app.use(express.json({ limit: '24kb' }));
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: 240,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Muitas solicitações. Aguarde um minuto.' },
    }),
  );
  const authLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: options.authLimit ?? 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Muitas tentativas. Tente novamente em 15 minutos.' },
  });
  const userJson = (row) => ({ id: row.id, name: row.name, email: row.email });
  const ensureSettlement = (settled) => {
    if (settled && settled > currentDate())
      throw new AppError('A data de recebimento ou pagamento não pode estar no futuro.');
  };

  app.post('/api/auth/register', authLimiter, async (req, res) => {
    const data = z
      .object({
        name: title,
        email: z
          .email()
          .max(254)
          .transform((v) => v.toLowerCase()),
        password: z.string().min(10, 'A senha precisa ter pelo menos 10 caracteres.').max(128),
      })
      .strict()
      .parse(req.body);
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(data.email))
      throw new AppError('Não foi possível criar a conta com este e-mail.', 409);
    const passwordHash = await hashPassword(data.password);
    const id = randomUUID();
    // Recheck the unique constraint after asynchronous password derivation.
    try {
      db.prepare('INSERT INTO users(id,name,email,password_hash) VALUES (?,?,?,?)').run(
        id,
        data.name,
        data.email,
        passwordHash,
      );
    } catch (error) {
      if (String(error.message).includes('UNIQUE'))
        throw new AppError('Não foi possível criar a conta com este e-mail.', 409);
      throw error;
    }
    createSession(db, id, res, production);
    res
      .status(201)
      .json({ user: { id, name: data.name, email: data.email }, today: currentDate() });
  });

  // A dummy hash keeps unknown-user login attempts on the same expensive password path.
  const dummyHash = hashPassword(randomUUID());
  app.post('/api/auth/login', authLimiter, async (req, res) => {
    const data = z
      .object({
        email: z
          .email()
          .max(254)
          .transform((v) => v.toLowerCase()),
        password: z.string().min(1).max(128),
      })
      .strict()
      .parse(req.body);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(data.email);
    const valid = await verifyPassword(data.password, user?.password_hash ?? (await dummyHash));
    if (!user || !valid) throw new AppError('E-mail ou senha incorretos.', 401);
    const oldToken = sessionToken(req);
    if (oldToken) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(oldToken));
    createSession(db, user.id, res, production);
    res.json({ user: userJson(user), today: currentDate() });
  });

  app.use('/api', (req, res, next) => {
    const token = sessionToken(req);
    const session =
      token &&
      db
        .prepare(
          'SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?',
        )
        .get(tokenHash(token), Date.now());
    if (!session) return res.status(401).json({ error: 'Entre na sua conta para continuar.' });
    req.user = session;
    next();
  });
  app.get('/api/auth/me', (req, res) =>
    res.json({ user: userJson(req.user), today: currentDate() }),
  );
  app.post('/api/auth/logout', (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(sessionToken(req)));
    res.clearCookie('financia_session', {
      httpOnly: true,
      sameSite: 'strict',
      secure: production,
      path: '/',
    });
    res.json({ ok: true });
  });

  app.get('/api/dashboard', (req, res) => {
    const selected = month.parse(req.query.month ?? currentDate().slice(0, 7));
    const userId = req.user.id;
    materializeRecurring(db, userId, selected);
    const allEntries = db
      .prepare('SELECT * FROM entries WHERE user_id=? AND deleted=0 ORDER BY due_date,id')
      .all(userId);
    const transfers = db
      .prepare('SELECT * FROM transfers WHERE user_id=? ORDER BY date DESC,rowid DESC')
      .all(userId);
    const cutoff = monthEnd(selected);
    const entries = allEntries.filter((e) => e.due_date.startsWith(selected));
    const reserves = db
      .prepare('SELECT * FROM reserves WHERE user_id=? ORDER BY rowid')
      .all(userId)
      .map((r) => ({
        ...r,
        balance: transfers
          .filter((t) => t.reserve_id === r.id && t.date <= cutoff)
          .reduce((s, t) => s + t.amount, 0),
        current_balance: transfers
          .filter((t) => t.reserve_id === r.id)
          .reduce((s, t) => s + t.amount, 0),
        history: transfers.filter((t) => t.reserve_id === r.id && t.date <= cutoff),
      }));
    const plans = db
      .prepare('SELECT * FROM installments WHERE user_id=? ORDER BY first_due DESC,rowid DESC')
      .all(userId)
      .map((p) => {
        const parts = allEntries.filter((e) => e.installment_id === p.id);
        const paid = parts.filter((e) => e.settled_on && e.settled_on <= cutoff);
        const current = parts.find((e) => e.due_date.startsWith(selected));
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
    res.json({
      month: selected,
      today: currentDate(),
      entries,
      reserves,
      installments: plans,
      summary: summarize(allEntries, transfers, selected),
      upcoming: allEntries
        .filter(
          (e) =>
            e.kind === 'expense' &&
            e.due_date <= cutoff &&
            (!e.settled_on || e.settled_on > cutoff),
        )
        .slice(0, 6),
    });
  });

  app.post('/api/entries', (req, res) => {
    const data = entrySchema.parse(req.body);
    ensureSettlement(data.settled_on);
    const id = randomUUID();
    transaction(db, () => {
      const recurringId = data.recurring ? randomUUID() : null;
      if (recurringId)
        db.prepare(
          'INSERT INTO recurring(id,user_id,kind,title,category,amount,start_date) VALUES (?,?,?,?,?,?,?)',
        ).run(
          recurringId,
          req.user.id,
          data.kind,
          data.title,
          data.category,
          data.amount,
          data.due_date,
        );
      db.prepare(
        `INSERT INTO entries(id,user_id,kind,title,category,amount,due_date,settled_on,recurring_id,occurrence_month) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        id,
        req.user.id,
        data.kind,
        data.title,
        data.category,
        data.amount,
        data.due_date,
        data.settled_on,
        recurringId,
        recurringId ? data.due_date.slice(0, 7) : null,
      );
    });
    res.status(201).json({ id });
  });
  const ownedEntry = (id, userId) => {
    const row = db
      .prepare('SELECT * FROM entries WHERE id=? AND user_id=? AND deleted=0')
      .get(id, userId);
    if (!row) throw new AppError('Lançamento não encontrado.', 404);
    return row;
  };
  app.patch('/api/entries/:id', (req, res) => {
    const existing = ownedEntry(req.params.id, req.user.id);
    const data = entrySchema.omit({ recurring: true }).parse(req.body);
    ensureSettlement(data.settled_on);
    if (data.kind !== existing.kind)
      throw new AppError('O tipo do lançamento não pode ser alterado.');
    if (
      existing.installment_id &&
      (data.amount !== existing.amount || data.due_date !== existing.due_date)
    )
      throw new AppError('O valor e vencimento de uma parcela pertencem ao parcelamento original.');
    db.prepare(
      'UPDATE entries SET title=?,category=?,amount=?,due_date=?,settled_on=? WHERE id=? AND user_id=?',
    ).run(
      data.title,
      data.category,
      data.amount,
      data.due_date,
      data.settled_on,
      existing.id,
      req.user.id,
    );
    res.json({ ok: true });
  });
  app.patch('/api/entries/:id/settlement', (req, res) => {
    const entry = ownedEntry(req.params.id, req.user.id);
    const data = z.object({ settled_on: date.nullable() }).strict().parse(req.body);
    ensureSettlement(data.settled_on);
    db.prepare('UPDATE entries SET settled_on=? WHERE id=? AND user_id=?').run(
      data.settled_on,
      entry.id,
      req.user.id,
    );
    res.json({ ok: true });
  });
  app.delete('/api/entries/:id', (req, res) => {
    const entry = ownedEntry(req.params.id, req.user.id);
    if (entry.installment_id) throw new AppError('Uma parcela não pode ser excluída isoladamente.');
    const data = z
      .object({ future: z.boolean().default(false) })
      .strict()
      .parse(req.body);
    transaction(db, () => {
      db.prepare('UPDATE entries SET deleted=1 WHERE id=? AND user_id=?').run(
        entry.id,
        req.user.id,
      );
      if (data.future && entry.recurring_id) {
        const end = addMonths(`${entry.occurrence_month}-01`, -1).slice(0, 7);
        db.prepare(
          'UPDATE recurring SET end_month=CASE WHEN end_month IS NULL OR end_month>? THEN ? ELSE end_month END WHERE id=? AND user_id=?',
        ).run(end, end, entry.recurring_id, req.user.id);
        db.prepare(
          'UPDATE entries SET deleted=1 WHERE recurring_id=? AND user_id=? AND occurrence_month>=? AND settled_on IS NULL',
        ).run(entry.recurring_id, req.user.id, entry.occurrence_month);
      }
    });
    res.json({ ok: true });
  });

  app.post('/api/installments', (req, res) => {
    const data = z
      .object({
        title,
        category: z.enum(categories),
        total: money,
        count: z.number().int().min(2).max(120),
        first_due: date,
      })
      .strict()
      .parse(req.body);
    const amounts = splitInstallments(data.total, data.count);
    if (addMonths(data.first_due, data.count - 1) > '2100-12-31')
      throw new AppError('A última parcela deve vencer até 2100.');
    const id = randomUUID();
    transaction(db, () => {
      db.prepare(
        'INSERT INTO installments(id,user_id,title,category,total,count,first_due) VALUES (?,?,?,?,?,?,?)',
      ).run(id, req.user.id, data.title, data.category, data.total, data.count, data.first_due);
      const insert = db.prepare(
        'INSERT INTO entries(id,user_id,kind,title,category,amount,due_date,installment_id,installment_number) VALUES (?,?,?,?,?,?,?,?,?)',
      );
      amounts.forEach((amount, i) =>
        insert.run(
          randomUUID(),
          req.user.id,
          'expense',
          data.title,
          data.category,
          amount,
          addMonths(data.first_due, i),
          id,
          i + 1,
        ),
      );
    });
    res.status(201).json({ id });
  });

  app.post('/api/reserves', (req, res) => {
    const data = reserveSchema.parse(req.body);
    const id = randomUUID();
    db.prepare('INSERT INTO reserves(id,user_id,title,target,deadline) VALUES (?,?,?,?,?)').run(
      id,
      req.user.id,
      data.title,
      data.target,
      data.deadline,
    );
    res.status(201).json({ id });
  });
  app.patch('/api/reserves/:id', (req, res) => {
    const data = reserveSchema.parse(req.body);
    if (
      !db
        .prepare('SELECT id FROM reserves WHERE id=? AND user_id=?')
        .get(req.params.id, req.user.id)
    )
      throw new AppError('Reserva não encontrada.', 404);
    db.prepare('UPDATE reserves SET title=?,target=?,deadline=? WHERE id=? AND user_id=?').run(
      data.title,
      data.target,
      data.deadline,
      req.params.id,
      req.user.id,
    );
    res.json({ ok: true });
  });
  app.post('/api/reserves/:id/transfers', (req, res) => {
    const data = z
      .object({
        amount: money,
        direction: z.enum(['deposit', 'withdraw']),
        date,
        note: z.string().trim().max(200).default(''),
      })
      .strict()
      .parse(req.body);
    if (data.date > currentDate()) throw new AppError('Uma movimentação não pode ter data futura.');
    const userId = req.user.id;
    if (!db.prepare('SELECT id FROM reserves WHERE id=? AND user_id=?').get(req.params.id, userId))
      throw new AppError('Reserva não encontrada.', 404);
    materializeRecurring(db, userId, currentDate().slice(0, 7));
    transaction(db, () => {
      const rows = db.prepare('SELECT * FROM entries WHERE user_id=? AND deleted=0').all(userId);
      const transfers = db.prepare('SELECT * FROM transfers WHERE user_id=?').all(userId);
      // Check every affected date, so backdated transfers cannot create a negative historical reserve/cash balance.
      const affectedDates = [
        ...new Set([
          data.date,
          currentDate(),
          ...rows.map((e) => e.settled_on).filter((d) => d && d >= data.date),
          ...transfers.filter((t) => t.date >= data.date).map((t) => t.date),
        ]),
      ].sort();
      for (const cutoff of affectedDates) {
        const balance = transfers
          .filter((t) => t.reserve_id === req.params.id && t.date <= cutoff)
          .reduce((s, t) => s + t.amount, 0);
        if (data.direction === 'withdraw' && data.amount > balance)
          throw new AppError(
            'A retirada supera o saldo da reserva nesta data ou em uma movimentação posterior.',
          );
        const available =
          rows
            .filter((e) => e.settled_on && e.settled_on <= cutoff)
            .reduce((s, e) => s + (e.kind === 'income' ? e.amount : -e.amount), 0) -
          transfers.filter((t) => t.date <= cutoff).reduce((s, t) => s + t.amount, 0);
        if (data.direction === 'deposit' && data.amount > available)
          throw new AppError(
            'O aporte supera o dinheiro disponível nesta data ou em uma movimentação posterior.',
          );
      }
      db.prepare(
        'INSERT INTO transfers(id,user_id,reserve_id,amount,date,note) VALUES (?,?,?,?,?,?)',
      ).run(
        randomUUID(),
        userId,
        req.params.id,
        data.direction === 'deposit' ? data.amount : -data.amount,
        data.date,
        data.note,
      );
    });
    res.status(201).json({ ok: true });
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  const staticPath = resolve('dist');
  if (existsSync(resolve(staticPath, 'index.html'))) {
    app.use(express.static(staticPath));
    app.get('/{*path}', (_req, res) => res.sendFile(resolve(staticPath, 'index.html')));
  }
  app.use((error, _req, res, _next) => {
    if (error instanceof z.ZodError)
      return res
        .status(400)
        .json({ error: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · ') });
    if (error instanceof AppError) return res.status(error.status).json({ error: error.message });
    if (error.type === 'entity.parse.failed')
      return res.status(400).json({ error: 'Os dados enviados não são válidos.' });
    if (error.type === 'entity.too.large')
      return res.status(413).json({ error: 'Os dados enviados ultrapassam o tamanho permitido.' });
    console.error('Falha interna:', error.message);
    res.status(500).json({ error: 'Não foi possível concluir a ação. Tente novamente.' });
  });
  return app;
}

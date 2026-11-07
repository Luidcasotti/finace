import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  unique,
  index,
  check,
  foreignKey,
} from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
});
export const rateLimits = sqliteTable('rate_limits', {
  user_id: text('user_id')
    .primaryKey()
    .references(() => users.id),
  window: integer('window').notNull(),
  counter: integer('counter').notNull(),
});
const owned = () => ({
  id: text('id').primaryKey(),
  user_id: text('user_id')
    .notNull()
    .references(() => users.id),
});
export const recurring = sqliteTable(
  'recurring',
  {
    ...owned(),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    category: text('category').notNull(),
    amount: integer('amount').notNull(),
    start_date: text('start_date').notNull(),
    end_month: text('end_month'),
  },
  (t) => [
    unique('recurring_owner').on(t.id, t.user_id),
    check('recurring_kind', sql`${t.kind} IN ('income','expense')`),
    check('recurring_positive', sql`${t.amount}>0`),
  ],
);
export const installments = sqliteTable(
  'installments',
  {
    ...owned(),
    title: text('title').notNull(),
    category: text('category').notNull(),
    total: integer('total').notNull(),
    count: integer('count').notNull(),
    first_due: text('first_due').notNull(),
  },
  (t) => [
    unique('installments_owner').on(t.id, t.user_id),
    check('installments_total', sql`${t.total}>0`),
    check('installments_count', sql`${t.count} BETWEEN 2 AND 120`),
  ],
);
export const entries = sqliteTable(
  'entries',
  {
    ...owned(),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    category: text('category').notNull(),
    amount: integer('amount').notNull(),
    due_date: text('due_date').notNull(),
    settled_on: text('settled_on'),
    recurring_id: text('recurring_id'),
    occurrence_month: text('occurrence_month'),
    installment_id: text('installment_id'),
    installment_number: integer('installment_number'),
    deleted: integer('deleted').notNull().default(0),
  },
  (t) => [
    unique('recurring_month').on(t.recurring_id, t.occurrence_month),
    unique('installment_part').on(t.installment_id, t.installment_number),
    index('entries_user_date').on(t.user_id, t.due_date),
    check('entries_kind', sql`${t.kind} IN ('income','expense')`),
    check('entries_amount', sql`${t.amount}>0`),
    check('entries_deleted', sql`${t.deleted} IN (0,1)`),
    foreignKey({
      columns: [t.recurring_id, t.user_id],
      foreignColumns: [recurring.id, recurring.user_id],
    }),
    foreignKey({
      columns: [t.installment_id, t.user_id],
      foreignColumns: [installments.id, installments.user_id],
    }),
  ],
);
export const reserves = sqliteTable(
  'reserves',
  {
    ...owned(),
    title: text('title').notNull(),
    target: integer('target').notNull(),
    deadline: text('deadline'),
  },
  (t) => [
    unique('reserves_owner').on(t.id, t.user_id),
    check('reserve_target', sql`${t.target}>0`),
  ],
);
export const transfers = sqliteTable(
  'transfers',
  {
    ...owned(),
    reserve_id: text('reserve_id').notNull(),
    amount: integer('amount').notNull(),
    date: text('date').notNull(),
    note: text('note').notNull().default(''),
  },
  (t) => [
    foreignKey({
      columns: [t.reserve_id, t.user_id],
      foreignColumns: [reserves.id, reserves.user_id],
    }),
    check('transfer_amount', sql`${t.amount}!=0`),
    index('transfers_user').on(t.user_id, t.reserve_id, t.date),
  ],
);

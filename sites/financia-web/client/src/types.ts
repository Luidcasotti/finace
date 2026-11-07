export type Kind = 'income' | 'expense';
export type Page = 'overview' | 'income' | 'expense' | 'installments' | 'reserves';
export type User = { id: string; name: string; email: string };
export type Entry = {
  id: string;
  kind: Kind;
  title: string;
  category: string;
  amount: number;
  due_date: string;
  settled_on: string | null;
  recurring_id: string | null;
  installment_id: string | null;
  installment_number: number | null;
};
export type Transfer = { id: string; amount: number; date: string; note: string };
export type Reserve = {
  id: string;
  title: string;
  target: number;
  deadline: string | null;
  balance: number;
  current_balance: number;
  history: Transfer[];
};
export type Installment = {
  id: string;
  title: string;
  category: string;
  total: number;
  count: number;
  first_due: string;
  paid: number;
  remaining: number;
  outstanding: number;
  current: number | null;
  entries: Entry[];
};
export type Dashboard = {
  month: string;
  today: string;
  entries: Entry[];
  reserves: Reserve[];
  installments: Installment[];
  upcoming: Entry[];
  summary: {
    available: number;
    reserved: number;
    projected: number;
    expectedIncome: number;
    expectedExpense: number;
    receivedIncome: number;
    paidExpense: number;
    pendingIncome: number;
    pendingExpense: number;
  };
};
export type Modal =
  | { type: 'entry'; kind: Kind; entry?: Entry }
  | { type: 'installment' }
  | { type: 'reserve'; reserve?: Reserve }
  | { type: 'transfer'; reserve: Reserve }
  | { type: 'history'; reserve: Reserve }
  | { type: 'parts'; plan: Installment }
  | { type: 'settle'; entry: Entry }
  | { type: 'delete'; entry: Entry }
  | { type: 'new' };

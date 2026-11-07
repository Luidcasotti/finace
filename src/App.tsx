import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  History,
  LayoutDashboard,
  Layers3,
  Leaf,
  LogOut,
  Menu,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Sprout,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Auth from './Auth';
import Dialogs from './Dialogs';
import EntryTable from './EntryTable';
import { api, dateLabel, monthLabel, money, shiftMonth } from './lib';
import type { Dashboard, Modal, Page, Reserve, User } from './types';

const navigation: { id: Page; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'income', label: 'Receitas', icon: ArrowDownLeft },
  { id: 'expense', label: 'Despesas', icon: ArrowUpRight },
  { id: 'installments', label: 'Parcelas', icon: Layers3 },
  { id: 'reserves', label: 'Reservas', icon: Sprout },
];
const pageText: Record<Page, { title: string; description: string; action: string }> = {
  overview: {
    title: 'Seu dinheiro, com clareza.',
    description: 'Um olhar tranquilo para suas finanças. Um passo de cada vez.',
    action: 'Novo lançamento',
  },
  income: {
    title: 'Cada entrada, no seu lugar.',
    description: 'Acompanhe o que está por vir e o que já chegou.',
    action: 'Nova receita',
  },
  expense: {
    title: 'Contas em dia. Mente leve.',
    description: 'Organize seus gastos e saiba o que ainda precisa pagar.',
    action: 'Nova despesa',
  },
  installments: {
    title: 'Planeje hoje. Pague com calma.',
    description: 'Suas compras parceladas, sem perder o próximo vencimento.',
    action: 'Nova compra',
  },
  reserves: {
    title: 'Espaço para seus próximos planos.',
    description: 'Separe um pouco de hoje para o que importa amanhã.',
    action: 'Nova reserva',
  },
};

function ReserveProgress({ reserve, hideValues }: { reserve: Reserve; hideValues: boolean }) {
  const percent = Math.min(100, Math.round((reserve.balance / reserve.target) * 100));
  return (
    <>
      <div className="reserve-values">
        <strong>{hideValues ? '•••••' : money(reserve.balance)}</strong>
        <span>{hideValues ? '•••••' : `de ${money(reserve.target)}`}</span>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label={`Progresso de ${reserve.title}`}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <div className="progress-caption">
        <span>{percent}% do objetivo</span>
        <span>{reserve.deadline ? `Até ${dateLabel(reserve.deadline)}` : 'No seu tempo'}</span>
      </div>
    </>
  );
}

function Overview({
  data,
  open,
  navigate,
  hideValues,
}: {
  data: Dashboard;
  open: (modal: Modal) => void;
  navigate: (page: Page) => void;
  hideValues: boolean;
}) {
  const [tab, setTab] = useState('all');
  const format = (n: number) => (hideValues ? '•••••' : money(n));
  const cutoff = `${data.month}-31`;
  const recent = data.entries
    .filter((e) => tab === 'all' || e.kind === tab)
    .slice()
    .sort((a, b) => b.due_date.localeCompare(a.due_date))
    .slice(0, 5);
  return (
    <>
      <div className="metrics-grid">
        <article className="metric featured">
          <div className="metric-heading">
            <span>Saldo disponível</span>
            <Wallet size={18} strokeWidth={1.5} />
          </div>
          <strong className="metric-value">{format(data.summary.available)}</strong>
          <p>Recebido − pago − reservado, até este mês.</p>
          <div className="featured-footer">
            <span className="tiny-dot" /> Dinheiro livre para usar
          </div>
        </article>
        <article className="metric">
          <div className="metric-heading">
            <span>Receitas do mês</span>
            <span className="metric-symbol">
              <ArrowDownLeft size={19} />
            </span>
          </div>
          <strong className="metric-value">{format(data.summary.receivedIncome)}</strong>
          <p>Recebido neste mês</p>
          <div className="metric-footer">
            <span>Previsto para o mês</span>
            <strong>{format(data.summary.expectedIncome)}</strong>
          </div>
        </article>
        <article className="metric">
          <div className="metric-heading">
            <span>Despesas do mês</span>
            <span className="metric-symbol expense">
              <ArrowUpRight size={19} />
            </span>
          </div>
          <strong className="metric-value">{format(data.summary.paidExpense)}</strong>
          <p>Pago neste mês</p>
          <div className="metric-footer">
            <span>Previsto para o mês</span>
            <strong>{format(data.summary.expectedExpense)}</strong>
          </div>
        </article>
        <article className="metric">
          <div className="metric-heading">
            <span>Projeção de fechamento</span>
            <TrendingUp size={19} strokeWidth={1.6} />
          </div>
          <strong className={`metric-value ${data.summary.projected < 0 ? 'negative' : ''}`}>
            {format(data.summary.projected)}
          </strong>
          <p>Disponível + entradas − saídas pendentes.</p>
          <div className="metric-footer projection-note">
            <span>Inclui pendências de meses anteriores.</span>
          </div>
        </article>
      </div>
      <div className="overview-columns">
        <section className="panel movements">
          <div className="panel-heading">
            <div>
              <h2>Movimentações do mês</h2>
              <p>Pequenos detalhes, uma visão completa.</p>
            </div>
            <button className="text-button arrow-link" onClick={() => navigate('expense')}>
              Ver despesas <ArrowRight size={15} />
            </button>
          </div>
          <div className="table-tabs" aria-label="Filtrar movimentações">
            {[
              { id: 'all', text: 'Todas' },
              { id: 'income', text: 'Receitas' },
              { id: 'expense', text: 'Despesas' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={tab === t.id ? 'active' : ''}
              >
                {t.text}
              </button>
            ))}
          </div>
          <EntryTable
            entries={recent}
            today={data.today}
            cutoff={cutoff}
            open={open}
            hideValues={hideValues}
            compact
          />
          <div className="table-footnote">
            <span className="tiny-dot" />
            {data.entries.length
              ? `${data.entries.length} lançamento${data.entries.length === 1 ? '' : 's'} no mês selecionado`
              : 'Tudo começa com o primeiro lançamento.'}
          </div>
        </section>
        <section className="panel upcoming">
          <div className="panel-heading">
            <div>
              <h2>Próximos pagamentos</h2>
              <p>Para se antecipar, sem se preocupar.</p>
            </div>
            <CalendarDays size={19} strokeWidth={1.5} />
          </div>
          {data.upcoming.length ? (
            <ul className="upcoming-list">
              {data.upcoming.map((e) => (
                <li key={e.id}>
                  <span className={`date-tile ${e.due_date < data.today ? 'late' : ''}`}>
                    <strong>{e.due_date.slice(8)}</strong>
                    <small>
                      {new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' })
                        .format(new Date(`${e.due_date}T12:00:00Z`))
                        .replace('.', '')}
                    </small>
                  </span>
                  <div className="upcoming-description">
                    <strong>{e.title}</strong>
                    <small>
                      {e.due_date < data.today ? 'Em atraso' : e.category}
                      {e.installment_number ? ` · ${e.installment_number}ª parcela` : ''}
                    </small>
                  </div>
                  <button
                    className="upcoming-value"
                    onClick={() => open({ type: 'settle', entry: e })}
                    aria-label={`Pagar ${e.title}`}
                  >
                    {format(e.amount)}
                    <ChevronRight size={13} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="upcoming-empty">
              <span>
                <Check size={24} />
              </span>
              <h3>Nenhuma conta pendente</h3>
              <p>Os vencimentos deste mês e as contas em atraso aparecerão aqui.</p>
            </div>
          )}
          <div className="upcoming-footer">
            <ShieldCheck size={15} />
            <span>Um pouco de organização, mais tranquilidade.</span>
          </div>
        </section>
      </div>
      <section className="panel reserve-overview">
        <div className="panel-heading">
          <div className="section-title-icon">
            <span className="reserve-section-icon">
              <Sprout size={22} strokeWidth={1.5} />
            </span>
            <div>
              <h2>Guardado para o que importa</h2>
              <p>
                {hideValues
                  ? 'Seus objetivos, no seu ritmo.'
                  : `${money(data.summary.reserved)} separados do seu saldo disponível.`}
              </p>
            </div>
          </div>
          <button className="text-button arrow-link" onClick={() => navigate('reserves')}>
            Ver reservas <ArrowRight size={15} />
          </button>
        </div>
        {data.reserves.length ? (
          <div className="reserve-mini-grid">
            {data.reserves.slice(0, 3).map((r) => (
              <button className="reserve-mini" key={r.id} onClick={() => navigate('reserves')}>
                <h3>{r.title}</h3>
                <ReserveProgress reserve={r} hideValues={hideValues} />
              </button>
            ))}
          </div>
        ) : (
          <div className="reserve-empty-inline">
            <p>
              Uma viagem, uma emergência ou um novo começo.
              <br />
              <span>Crie uma reserva e dê um destino aos seus planos.</span>
            </p>
            <button className="button secondary" onClick={() => open({ type: 'reserve' })}>
              <Plus size={16} /> Criar primeira reserva
            </button>
          </div>
        )}
      </section>
      <div className="quiet-footer">
        <Leaf size={15} strokeWidth={1.4} /> Cuidar do seu dinheiro também é cuidar de você.
      </div>
    </>
  );
}

function EntriesPage({
  data,
  kind,
  open,
  hideValues,
}: {
  data: Dashboard;
  kind: 'income' | 'expense';
  open: (modal: Modal) => void;
  hideValues: boolean;
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const rows = data.entries.filter((e) => e.kind === kind);
  const cutoff = `${data.month}-31`;
  const filtered = rows.filter(
    (e) =>
      e.title.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')) &&
      (!category || e.category === category) &&
      (!status ||
        (status === 'settled'
          ? !!e.settled_on && e.settled_on <= cutoff
          : !e.settled_on || e.settled_on > cutoff)),
  );
  const expected = rows.reduce((s, e) => s + e.amount, 0);
  const paid = rows
    .filter((e) => e.settled_on && e.settled_on <= cutoff)
    .reduce((s, e) => s + e.amount, 0);
  const format = (n: number) => (hideValues ? '•••••' : money(n));
  return (
    <>
      <div className="list-summary">
        <div>
          <span>Total previsto</span>
          <strong>{format(expected)}</strong>
        </div>
        <div>
          <span>
            {kind === 'income' ? 'Recebido destes lançamentos' : 'Pago destes lançamentos'}
          </span>
          <strong className="positive">{format(paid)}</strong>
        </div>
        <div>
          <span>{kind === 'income' ? 'Ainda a receber' : 'Ainda a pagar'}</span>
          <strong>{format(expected - paid)}</strong>
        </div>
      </div>
      <section className="panel">
        <div className="list-toolbar">
          <div className="search-input">
            <Search size={17} />
            <input
              aria-label="Buscar lançamento"
              placeholder="Buscar por descrição…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            aria-label="Filtrar categoria"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Todas as categorias</option>
            {[...new Set(rows.map((e) => e.category))].sort().map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            aria-label="Filtrar situação"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Todas as situações</option>
            <option value="settled">{kind === 'income' ? 'Recebidas' : 'Pagas'}</option>
            <option value="pending">{kind === 'income' ? 'A receber' : 'A pagar'}</option>
          </select>
        </div>
        {rows.length ? (
          <>
            <EntryTable
              entries={filtered}
              today={data.today}
              cutoff={cutoff}
              open={open}
              hideValues={hideValues}
            />
            <div className="table-footnote">
              {filtered.length} de {rows.length} lançamentos · Valores previstos por vencimento
            </div>
          </>
        ) : (
          <EmptyState
            icon={kind === 'income' ? ArrowDownLeft : ArrowUpRight}
            title={
              kind === 'income'
                ? 'Dê boas-vindas à sua primeira receita.'
                : 'Organize sua primeira despesa.'
            }
            description={
              kind === 'income'
                ? 'Adicione seu salário ou outra entrada. Você pode repetir o lançamento todo mês.'
                : 'Cadastre uma conta fixa ou um gasto do dia a dia e acompanhe o pagamento.'
            }
            action={kind === 'income' ? 'Adicionar receita' : 'Adicionar despesa'}
            onClick={() => open({ type: 'entry', kind })}
          />
        )}
      </section>
      <p className="page-note">
        {kind === 'income'
          ? 'Receitas previstas entram na projeção. O disponível só aumenta quando você confirma o recebimento.'
          : 'Compras parceladas aparecem aqui automaticamente. A confirmação de pagamento atualiza o saldo uma única vez.'}
      </p>
    </>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">
        <Icon size={29} strokeWidth={1.4} />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      <button className="button primary" onClick={onClick}>
        <Plus size={16} />
        {action}
      </button>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [today, setToday] = useState('');
  const [month, setMonth] = useState('');
  const [page, setPage] = useState<Page>('overview');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);
  const [modal, setModal] = useState<Modal | null>(null);
  const [modalKey, setModalKey] = useState(0);
  const [toast, setToast] = useState('');
  const [hideValues, setHideValues] = useState(false);
  useEffect(() => {
    let active = true;
    api<{ user: User; today: string }>('/auth/me')
      .then((result) => {
        if (active) {
          setUser(result.user);
          setToday(result.today);
          setMonth(result.today.slice(0, 7));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setAuthLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!user || !month) return;
    const controller = new AbortController();
    api<Dashboard>(`/dashboard?month=${month}`, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setToday(result.today);
          setLoadError('');
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLoadError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [user, month, revision]);
  useEffect(() => {
    const expired = () => {
      setUser(null);
      setData(null);
      setModal(null);
      setToast('Sua sessão terminou. Entre novamente.');
    };
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(timeout);
  }, [toast]);
  const open = useCallback((next: Modal) => {
    setModal(next);
    setModalKey((k) => k + 1);
  }, []);
  function navigate(next: Page) {
    setPage(next);
    setMobileMenu(false);
  }
  function selectMonth(next: string) {
    if (/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(next)) {
      setMonth(next);
      setLoading(true);
      setLoadError('');
    }
  }
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST', body: '{}' });
      setUser(null);
      setData(null);
      setModal(null);
      setMobileMenu(false);
      setPage('overview');
    } catch (error) {
      setToast((error as Error).message);
    }
  }
  function primaryAction() {
    open(
      page === 'overview'
        ? { type: 'new' }
        : page === 'income' || page === 'expense'
          ? { type: 'entry', kind: page }
          : page === 'installments'
            ? { type: 'installment' }
            : { type: 'reserve' },
    );
  }
  if (authLoading)
    return (
      <div className="boot-screen">
        <span className="brand-mark">
          f<span>•</span>
        </span>
        <p>Preparando seu espaço…</p>
      </div>
    );
  if (!user)
    return (
      <>
        <Auth
          onLogin={(next, date) => {
            setUser(next);
            setToday(date);
            setMonth(date.slice(0, 7));
            setLoading(true);
            setLoadError('');
          }}
        />
        {toast && (
          <div className="toast" role="status">
            {toast}
            <button onClick={() => setToast('')} aria-label="Fechar mensagem">
              <X size={16} />
            </button>
          </div>
        )}
      </>
    );
  const text = pageText[page];
  const currentData = data?.month === month ? data : null;
  return (
    <div className="app-shell">
      {mobileMenu && (
        <button
          className="sidebar-scrim"
          aria-label="Fechar menu"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <aside className={`sidebar ${mobileMenu ? 'is-open' : ''}`}>
        <a
          className="brand"
          href="/"
          onClick={(event) => {
            event.preventDefault();
            navigate('overview');
          }}
          aria-label="financia, visão geral"
        >
          <span className="brand-mark">
            f<span>•</span>
          </span>
          financia<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">SEU ESPAÇO FINANCEIRO</div>
        <nav aria-label="Menu principal">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={page === item.id ? 'active' : ''}
              onClick={() => navigate(item.id)}
              aria-current={page === item.id ? 'page' : undefined}
            >
              <item.icon size={19} strokeWidth={1.65} />
              <span>{item.label}</span>
              {page === item.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Leaf size={24} strokeWidth={1.3} />
            <h3>Um passo de cada vez.</h3>
            <p>
              Pequenos cuidados hoje.
              <br />
              Mais liberdade amanhã.
            </p>
          </div>
          <div className="sidebar-user">
            <span className="avatar">{user.name.charAt(0).toUpperCase()}</span>
            <div>
              <strong>{user.name}</strong>
              <small>Minha conta pessoal</small>
            </div>
            <button
              className="icon-button"
              onClick={logout}
              title="Sair da conta"
              aria-label="Sair da conta"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu-button"
              onClick={() => setMobileMenu(true)}
              aria-label="Abrir menu"
            >
              <Menu size={22} />
            </button>
            <span className="breadcrumb">
              Meu espaço <ChevronRight size={13} />
              <strong>{navigation.find((item) => item.id === page)?.label}</strong>
            </span>
          </div>
          <div className="topbar-right">
            <span className="today-label">{dateLabel(today)}</span>
            <span className="topbar-divider" />
            <button
              className="icon-button"
              onClick={() => setHideValues(!hideValues)}
              aria-label={hideValues ? 'Mostrar valores' : 'Ocultar valores'}
              title={hideValues ? 'Mostrar valores' : 'Ocultar valores'}
            >
              {hideValues ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
            <span className="avatar small-avatar" title={user.name}>
              {user.name.charAt(0).toUpperCase()}
            </span>
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {page === 'overview'
                  ? `OLÁ, ${user.name.split(' ')[0].toLocaleUpperCase('pt-BR')}`
                  : 'SUA VIDA FINANCEIRA'}
                <span className="eyebrow-line" />
              </span>
              <h1>{text.title}</h1>
              <p>{text.description}</p>
            </div>
            <button className="button primary" onClick={primaryAction}>
              <Plus size={18} />
              {text.action}
            </button>
          </div>
          <div className="month-bar">
            <div className="month-picker">
              <button
                className="icon-button"
                onClick={() => selectMonth(shiftMonth(month, -1))}
                disabled={month <= '2000-01'}
                aria-label="Mês anterior"
              >
                <ChevronLeft size={18} />
              </button>
              <label className="month-input-label">
                <CalendarDays size={17} />
                <span>{monthLabel(month)}</span>
                <input
                  type="month"
                  value={month}
                  min="2000-01"
                  max="2100-12"
                  onChange={(e) => selectMonth(e.target.value)}
                  aria-label="Selecionar mês e ano"
                />
              </label>
              <button
                className="icon-button"
                onClick={() => selectMonth(shiftMonth(month, 1))}
                disabled={month >= '2100-12'}
                aria-label="Próximo mês"
              >
                <ChevronRight size={18} />
              </button>
            </div>
            {month !== today.slice(0, 7) ? (
              <button className="text-button" onClick={() => selectMonth(today.slice(0, 7))}>
                Voltar ao mês atual
              </button>
            ) : (
              <span className="month-status">
                <span className="tiny-dot" /> Mês atual
              </span>
            )}
          </div>
          {loadError ? (
            <div className="error-panel" role="alert">
              <h2>Não foi possível carregar suas informações.</h2>
              <p>{loadError}</p>
              <button
                className="button secondary"
                onClick={() => {
                  setRevision((r) => r + 1);
                  setLoading(true);
                }}
              >
                Tentar novamente
              </button>
            </div>
          ) : loading || !currentData ? (
            <div className="loading-state" role="status">
              <div className="loader" />
              <p>Organizando seus números…</p>
            </div>
          ) : (
            <>
              {page === 'overview' && (
                <Overview
                  data={currentData}
                  open={open}
                  navigate={navigate}
                  hideValues={hideValues}
                />
              )}
              {(page === 'income' || page === 'expense') && (
                <EntriesPage
                  key={page}
                  data={currentData}
                  kind={page}
                  open={open}
                  hideValues={hideValues}
                />
              )}
              {page === 'installments' && (
                <>
                  <div className="list-summary">
                    <div>
                      <span>Saldo devedor no fim do mês</span>
                      <strong>
                        {hideValues
                          ? '•••••'
                          : money(currentData.installments.reduce((s, p) => s + p.outstanding, 0))}
                      </strong>
                    </div>
                    <div>
                      <span>Compras parceladas</span>
                      <strong>{currentData.installments.length}</strong>
                    </div>
                    <div>
                      <span>Parcelas restantes</span>
                      <strong>
                        {currentData.installments.reduce((s, p) => s + p.remaining, 0)}
                      </strong>
                    </div>
                  </div>
                  {currentData.installments.length ? (
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Seus parcelamentos</h2>
                          <p>Os pagamentos são compartilhados com suas despesas.</p>
                        </div>
                      </div>
                      <div className="purchase-list">
                        {currentData.installments.map((plan) => (
                          <article key={plan.id}>
                            <span className="purchase-icon">
                              <Layers3 size={22} strokeWidth={1.5} />
                            </span>
                            <div className="purchase-info">
                              <h3>{plan.title}</h3>
                              <p>
                                {plan.category} · {hideValues ? '•••••' : money(plan.total)} em{' '}
                                {plan.count} vezes
                              </p>
                              <div className="purchase-progress">
                                <div className="progress-track">
                                  <span style={{ width: `${(plan.paid / plan.count) * 100}%` }} />
                                </div>
                                <span>
                                  {plan.paid} de {plan.count} pagas
                                </span>
                              </div>
                            </div>
                            <div className="purchase-balance">
                              <small>
                                {plan.current
                                  ? `Parcela ${plan.current} de ${plan.count} neste mês`
                                  : 'Sem parcela neste mês'}
                              </small>
                              <strong>{hideValues ? '•••••' : money(plan.outstanding)}</strong>
                              <small>{plan.remaining} restantes</small>
                            </div>
                            <button
                              className="button secondary small"
                              onClick={() => open({ type: 'parts', plan })}
                            >
                              Ver parcelas <ChevronRight size={15} />
                            </button>
                          </article>
                        ))}
                      </div>
                    </section>
                  ) : (
                    <section className="panel">
                      <EmptyState
                        icon={Layers3}
                        title="Compras de hoje, bem planejadas."
                        description="Adicione uma compra parcelada. Os vencimentos e os valores de cada parcela são calculados para você."
                        action="Adicionar compra parcelada"
                        onClick={() => open({ type: 'installment' })}
                      />
                    </section>
                  )}
                  <p className="page-note">
                    Saldo devedor e parcelas restantes consideram pagamentos até o fim do mês
                    selecionado. O detalhamento mostra o histórico atual.
                  </p>
                </>
              )}
              {page === 'reserves' && (
                <>
                  <div className="reserve-page-banner">
                    <span className="reserve-banner-icon">
                      <Sprout size={28} strokeWidth={1.4} />
                    </span>
                    <div>
                      <span>Total reservado no mês</span>
                      <strong>{hideValues ? '•••••' : money(currentData.summary.reserved)}</strong>
                    </div>
                    <p>
                      Dinheiro com um propósito.
                      <br />
                      Separado do seu saldo disponível.
                    </p>
                  </div>
                  {currentData.reserves.length ? (
                    <div className="reserve-card-grid">
                      {currentData.reserves.map((reserve, index) => (
                        <article className="panel reserve-card" key={reserve.id}>
                          <div className="reserve-card-heading">
                            <span className={`goal-number goal-${index % 3}`}>
                              <Sprout size={22} strokeWidth={1.5} />
                            </span>
                            <button
                              className="icon-button"
                              aria-label={`Editar ${reserve.title}`}
                              onClick={() => open({ type: 'reserve', reserve })}
                            >
                              <Pencil size={16} />
                            </button>
                          </div>
                          <h2>{reserve.title}</h2>
                          <ReserveProgress reserve={reserve} hideValues={hideValues} />
                          <div className="reserve-card-actions">
                            <button
                              className="text-button history-button"
                              onClick={() => open({ type: 'history', reserve })}
                            >
                              <History size={15} /> Histórico
                            </button>
                            <button
                              className="button secondary small"
                              onClick={() => open({ type: 'transfer', reserve })}
                            >
                              <ArrowDownRight size={15} /> Movimentar
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <section className="panel">
                      <EmptyState
                        icon={Sprout}
                        title="Todo objetivo merece um começo."
                        description="Uma reserva de emergência, aquela viagem ou um período sem salário. Dê um nome ao seu próximo plano."
                        action="Criar minha primeira reserva"
                        onClick={() => open({ type: 'reserve' })}
                      />
                    </section>
                  )}
                  <p className="page-note">
                    Aportes e retiradas são transferências internas. Seu dinheiro muda de lugar, sem
                    criar receitas ou despesas.
                  </p>
                </>
              )}
            </>
          )}
        </main>
      </div>
      {modal && (
        <Dialogs
          key={modalKey}
          modal={modal}
          close={() => setModal(null)}
          open={open}
          today={today}
          month={month}
          onSaved={async (message) => {
            setToast(message);
            setRevision((r) => r + 1);
            setLoading(true);
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <span className="toast-check">
            <Check size={16} />
          </span>
          {toast}
          <button onClick={() => setToast('')} aria-label="Fechar mensagem">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

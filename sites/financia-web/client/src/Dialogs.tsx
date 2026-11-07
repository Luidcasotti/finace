import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Info,
  Layers3,
  Plus,
  Repeat2,
  Sprout,
  X,
} from 'lucide-react';
import { api, categories, dateLabel, inputMoney, money, parseMoney } from './lib';
import type { Modal } from './types';

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label>
      {label}
      {children}
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
}

export default function Dialogs({
  modal,
  close,
  open,
  today,
  month,
  onSaved,
}: {
  modal: Modal;
  close: () => void;
  open: (modal: Modal) => void;
  today: string;
  month: string;
  onSaved: (message: string) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [kind, setKind] = useState(modal.type === 'entry' ? modal.kind : 'expense');
  const [settled, setSettled] = useState(modal.type === 'entry' && !!modal.entry?.settled_on);
  const [direction, setDirection] = useState('deposit');
  const [undoSettlement, setUndoSettlement] = useState(false);
  const entry = modal.type === 'entry' ? modal.entry : undefined;
  const reserve = modal.type === 'reserve' ? modal.reserve : undefined;
  const defaultDate = month === today.slice(0, 7) ? today : `${month}-01`;
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  const title =
    modal.type === 'new'
      ? 'O que vamos organizar?'
      : modal.type === 'entry'
        ? `${entry ? 'Editar' : 'Nova'} ${kind === 'income' ? 'receita' : 'despesa'}`
        : modal.type === 'installment'
          ? 'Nova compra parcelada'
          : modal.type === 'reserve'
            ? reserve
              ? 'Editar reserva'
              : 'Um novo objetivo'
            : modal.type === 'transfer'
              ? 'Movimentar reserva'
              : modal.type === 'history'
                ? 'Histórico da reserva'
                : modal.type === 'parts'
                  ? 'Detalhes do parcelamento'
                  : modal.type === 'delete'
                    ? 'Excluir lançamento?'
                    : modal.entry.kind === 'income'
                      ? 'Recebimento da receita'
                      : 'Pagamento da despesa';
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? '');
    try {
      let path = '';
      let method = 'POST';
      let body: unknown = {};
      let message = 'Alterações salvas.';
      if (modal.type === 'entry') {
        path = `/entries${entry ? `/${entry.id}` : ''}`;
        method = entry ? 'PATCH' : 'POST';
        body = {
          kind,
          title: text('title'),
          category: text('category'),
          amount: entry?.installment_id ? entry.amount : parseMoney(text('amount')),
          due_date: entry?.installment_id ? entry.due_date : text('due_date'),
          settled_on: settled ? text('settled_on') : null,
          ...(!entry ? { recurring: form.has('recurring') } : {}),
        };
        message = entry
          ? 'Lançamento atualizado.'
          : kind === 'income'
            ? 'Receita adicionada.'
            : 'Despesa adicionada.';
      } else if (modal.type === 'installment') {
        path = '/installments';
        body = {
          title: text('title'),
          category: text('category'),
          total: parseMoney(text('total')),
          count: Number(text('count')),
          first_due: text('first_due'),
        };
        message = 'Compra e parcelas adicionadas às despesas.';
      } else if (modal.type === 'reserve') {
        path = `/reserves${reserve ? `/${reserve.id}` : ''}`;
        method = reserve ? 'PATCH' : 'POST';
        body = {
          title: text('title'),
          target: parseMoney(text('target')),
          deadline: text('deadline') || null,
        };
        message = reserve
          ? 'Reserva atualizada.'
          : 'Reserva criada. Seu próximo objetivo começa aqui.';
      } else if (modal.type === 'transfer') {
        path = `/reserves/${modal.reserve.id}/transfers`;
        body = {
          amount: parseMoney(text('amount')),
          direction,
          date: text('date'),
          note: text('note'),
        };
        message =
          direction === 'deposit'
            ? 'Aporte registrado na reserva.'
            : 'Retirada devolvida ao saldo disponível.';
      } else if (modal.type === 'settle') {
        path = `/entries/${modal.entry.id}/settlement`;
        method = 'PATCH';
        body = { settled_on: undoSettlement ? null : text('settled_on') };
        message = undoSettlement
          ? 'Lançamento voltou a ficar pendente.'
          : modal.entry.kind === 'income'
            ? 'Recebimento confirmado.'
            : 'Pagamento confirmado.';
      } else if (modal.type === 'delete') {
        path = `/entries/${modal.entry.id}`;
        method = 'DELETE';
        body = { future: form.has('future') };
        message = 'Lançamento excluído.';
      }
      await api(path, { method, body: JSON.stringify(body) });
      await onSaved(message);
      close();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const dateProps = { min: '2000-01-01', max: '2100-12-31' };
  const moneyInput = (name: string, initial?: number, disabled = false) => (
    <div className="money-input">
      <span>R$</span>
      <input
        name={name}
        inputMode="decimal"
        placeholder="0,00"
        defaultValue={initial ? inputMoney(initial) : ''}
        required
        disabled={disabled}
        aria-label={
          name === 'target'
            ? 'Meta financeira em reais'
            : name === 'total'
              ? 'Valor total em reais'
              : 'Valor em reais'
        }
      />
    </div>
  );
  const categoryField = (initial?: string) => (
    <Field label="Categoria">
      <select name="category" defaultValue={initial ?? (kind === 'income' ? 'Salário' : 'Outros')}>
        {categories.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
    </Field>
  );
  return (
    <dialog
      ref={dialog}
      aria-labelledby="dialog-title"
      className={`modal ${modal.type === 'parts' ? 'wide-modal' : ''}`}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close();
      }}
      onClick={(event) => {
        if (event.target === dialog.current && !busy) close();
      }}
    >
      <div className="modal-heading">
        <div>
          <span className="eyebrow">UM PASSO PARA MAIS CLAREZA</span>
          <h2 id="dialog-title">{title}</h2>
        </div>
        <button className="icon-button" onClick={close} disabled={busy} aria-label="Fechar janela">
          <X size={21} />
        </button>
      </div>
      {modal.type === 'new' ? (
        <div className="new-options">
          {[
            {
              label: 'Receita',
              text: 'Salários e outras entradas',
              icon: ArrowDownLeft,
              modal: { type: 'entry', kind: 'income' },
            },
            {
              label: 'Despesa',
              text: 'Contas fixas e gastos do dia a dia',
              icon: ArrowUpRight,
              modal: { type: 'entry', kind: 'expense' },
            },
            {
              label: 'Compra parcelada',
              text: 'Organize seus próximos pagamentos',
              icon: Layers3,
              modal: { type: 'installment' },
            },
            {
              label: 'Reserva financeira',
              text: 'Guarde para o que importa',
              icon: Sprout,
              modal: { type: 'reserve' },
            },
          ].map((item) => (
            <button key={item.label} onClick={() => open(item.modal as Modal)}>
              <span className="option-icon">
                <item.icon size={21} />
              </span>
              <span>
                <strong>{item.label}</strong>
                <small>{item.text}</small>
              </span>
              <Plus size={18} />
            </button>
          ))}
        </div>
      ) : modal.type === 'history' ? (
        <div>
          <p className="muted">
            {modal.reserve.title} · Saldo no mês: <strong>{money(modal.reserve.balance)}</strong>
          </p>
          {!modal.reserve.history.length ? (
            <div className="mini-empty">Sua reserva ainda não tem movimentações neste período.</div>
          ) : (
            <ul className="history-list">
              {modal.reserve.history.map((t) => (
                <li key={t.id}>
                  <span className={`entry-icon ${t.amount > 0 ? 'income' : 'expense'}`}>
                    {t.amount > 0 ? <Plus size={18} /> : <ArrowUpRight size={18} />}
                  </span>
                  <div>
                    <strong>{t.amount > 0 ? 'Aporte' : 'Retirada'}</strong>
                    <small>
                      {dateLabel(t.date)}
                      {t.note && ` · ${t.note}`}
                    </small>
                  </div>
                  <strong className={t.amount > 0 ? 'positive' : ''}>
                    {t.amount > 0 ? '+' : '−'} {money(Math.abs(t.amount))}
                  </strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : modal.type === 'parts' ? (
        <div>
          <p className="muted">
            {modal.plan.title} · {money(modal.plan.total)} em {modal.plan.count} parcelas
          </p>
          <div className="part-list">
            {modal.plan.entries.map((e) => (
              <div key={e.id}>
                <span className="part-circle">{e.installment_number}</span>
                <div>
                  <strong>{dateLabel(e.due_date)}</strong>
                  <small>
                    {e.settled_on ? `Pago em ${dateLabel(e.settled_on)}` : 'Pagamento pendente'}
                  </small>
                </div>
                <strong>{money(e.amount)}</strong>
                <button
                  className={`button small ${e.settled_on ? 'secondary' : 'primary'}`}
                  onClick={() => open({ type: 'settle', entry: e })}
                >
                  {e.settled_on ? 'Alterar' : 'Pagar'}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <form className="modal-form" onSubmit={submit}>
          {modal.type === 'entry' && (
            <>
              {!entry && (
                <div className="segmented">
                  <button
                    type="button"
                    className={kind === 'income' ? 'active' : ''}
                    onClick={() => setKind('income')}
                  >
                    <ArrowDownLeft size={16} /> Receita
                  </button>
                  <button
                    type="button"
                    className={kind === 'expense' ? 'active' : ''}
                    onClick={() => setKind('expense')}
                  >
                    <ArrowUpRight size={16} /> Despesa
                  </button>
                </div>
              )}
              <Field label="Descrição">
                <input
                  name="title"
                  placeholder={kind === 'income' ? 'Ex.: Salário' : 'Ex.: Conta de energia'}
                  defaultValue={entry?.title}
                  required
                  minLength={2}
                  maxLength={100}
                  autoFocus
                />
              </Field>
              <div className="form-grid">
                <Field label="Valor">
                  {moneyInput('amount', entry?.amount, !!entry?.installment_id)}
                </Field>
                {categoryField(entry?.category)}
              </div>
              <Field label={kind === 'income' ? 'Data prevista' : 'Vencimento'}>
                <input
                  name="due_date"
                  type="date"
                  defaultValue={entry?.due_date ?? defaultDate}
                  required
                  {...dateProps}
                  disabled={!!entry?.installment_id}
                />
              </Field>
              {!entry && (
                <label className="checkbox-label">
                  <input type="checkbox" name="recurring" />
                  <span>
                    <Repeat2 size={16} /> Repetir todo mês
                    <small>O valor poderá ser ajustado em cada mês.</small>
                  </span>
                </label>
              )}
              {entry?.recurring_id && (
                <p className="form-note">
                  <Info size={16} /> A edição vale apenas para este mês. Os próximos mantêm o valor
                  original.
                </p>
              )}
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={settled}
                  onChange={(e) => setSettled(e.target.checked)}
                />
                <span>{kind === 'income' ? 'Já recebi este valor' : 'Já paguei esta despesa'}</span>
              </label>
              {settled && (
                <Field label={kind === 'income' ? 'Data do recebimento' : 'Data do pagamento'}>
                  <input
                    name="settled_on"
                    type="date"
                    defaultValue={entry?.settled_on ?? today}
                    min="2000-01-01"
                    max={today}
                    required
                  />
                </Field>
              )}
            </>
          )}
          {modal.type === 'installment' && (
            <>
              <p className="muted">As parcelas entram automaticamente nas despesas de cada mês.</p>
              <Field label="Descrição da compra">
                <input
                  name="title"
                  placeholder="Ex.: Notebook novo"
                  minLength={2}
                  maxLength={100}
                  required
                  autoFocus
                />
              </Field>
              <div className="form-grid">
                <Field label="Valor total da compra">{moneyInput('total')}</Field>
                <Field label="Quantidade de parcelas">
                  <input name="count" type="number" min={2} max={120} defaultValue={3} required />
                </Field>
              </div>
              <div className="form-grid">
                {categoryField('Compras')}
                <Field label="Primeiro vencimento">
                  <input
                    name="first_due"
                    type="date"
                    defaultValue={defaultDate}
                    required
                    {...dateProps}
                  />
                </Field>
              </div>
              <p className="form-note">
                <Info size={16} /> Os centavos são distribuídos para manter o total exato. Em meses
                curtos, o vencimento vai para o último dia.
              </p>
            </>
          )}
          {modal.type === 'reserve' && (
            <>
              <p className="muted">Dê um nome ao seu plano. Cada aporte aproxima você dele.</p>
              <Field label="Nome do objetivo">
                <input
                  name="title"
                  defaultValue={reserve?.title}
                  placeholder="Ex.: Reserva de emergência"
                  minLength={2}
                  maxLength={100}
                  required
                  autoFocus
                />
              </Field>
              <Field label="Meta financeira">{moneyInput('target', reserve?.target)}</Field>
              <Field label="Prazo (opcional)">
                <input
                  name="deadline"
                  type="date"
                  defaultValue={reserve?.deadline ?? ''}
                  {...dateProps}
                />
              </Field>
            </>
          )}
          {modal.type === 'transfer' && (
            <>
              <div className="transfer-summary">
                <Sprout size={22} />
                <div>
                  <strong>{modal.reserve.title}</strong>
                  <small>Saldo atual: {money(modal.reserve.current_balance)}</small>
                </div>
              </div>
              <div className="segmented">
                <button
                  type="button"
                  className={direction === 'deposit' ? 'active' : ''}
                  onClick={() => setDirection('deposit')}
                >
                  Fazer aporte
                </button>
                <button
                  type="button"
                  className={direction === 'withdraw' ? 'active' : ''}
                  onClick={() => setDirection('withdraw')}
                >
                  Retirar valor
                </button>
              </div>
              <Field label="Valor da movimentação">{moneyInput('amount')}</Field>
              <Field label="Data">
                <input
                  name="date"
                  type="date"
                  defaultValue={today}
                  min="2000-01-01"
                  max={today}
                  required
                />
              </Field>
              <Field label="Observação (opcional)">
                <input name="note" maxLength={200} placeholder="Ex.: Guardado este mês" />
              </Field>
              <p className="form-note">
                <Info size={16} />
                {direction === 'deposit'
                  ? 'O valor sai do disponível e vai para a reserva.'
                  : 'O valor volta da reserva para o disponível.'}{' '}
                Isso não cria receita nem despesa.
              </p>
            </>
          )}
          {modal.type === 'settle' && (
            <>
              <div className="settlement-summary">
                <strong>{modal.entry.title}</strong>
                <span>{money(modal.entry.amount)}</span>
              </div>
              <Field
                label={modal.entry.kind === 'income' ? 'Data do recebimento' : 'Data do pagamento'}
              >
                <input
                  name="settled_on"
                  type="date"
                  defaultValue={modal.entry.settled_on ?? today}
                  min="2000-01-01"
                  max={today}
                  required
                  disabled={undoSettlement}
                />
              </Field>
              {modal.entry.settled_on && (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={undoSettlement}
                    onChange={(e) => setUndoSettlement(e.target.checked)}
                  />
                  <span>Desfazer e deixar como pendente</span>
                </label>
              )}
              <p className="form-note">
                <Info size={16} /> O saldo é recalculado a partir dos lançamentos. Confirmar
                novamente não desconta o valor duas vezes.
              </p>
            </>
          )}
          {modal.type === 'delete' && (
            <>
              <p>
                O lançamento <strong>{modal.entry.title}</strong>, de{' '}
                <strong>{money(modal.entry.amount)}</strong>, será excluído e os saldos serão
                recalculados.
              </p>
              {modal.entry.recurring_id && (
                <label className="checkbox-label">
                  <input name="future" type="checkbox" />
                  <span>
                    Encerrar também as próximas repetições
                    <small>Os outros meses já pagos ou recebidos serão preservados.</small>
                  </span>
                </label>
              )}
              <p className="muted">Esta ação não pode ser desfeita.</p>
            </>
          )}
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <div className="modal-footer">
            <button type="button" className="button secondary" onClick={close} disabled={busy}>
              Cancelar
            </button>
            <button
              className={`button ${modal.type === 'delete' ? 'danger' : 'primary'}`}
              disabled={busy}
            >
              {busy ? (
                'Salvando…'
              ) : modal.type === 'delete' ? (
                'Excluir lançamento'
              ) : modal.type === 'settle' ? (
                <>
                  <Check size={16} /> Confirmar
                </>
              ) : (
                'Salvar'
              )}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}

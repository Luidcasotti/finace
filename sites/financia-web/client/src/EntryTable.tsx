import { ArrowDownLeft, ArrowUpRight, Check, Pencil, Repeat2, Trash2, Layers3 } from 'lucide-react';
import { dateLabel, money } from './lib';
import type { Entry, Modal } from './types';

export default function EntryTable({
  entries,
  today,
  cutoff,
  open,
  hideValues,
  compact = false,
}: {
  entries: Entry[];
  today: string;
  cutoff: string;
  open: (modal: Modal) => void;
  hideValues: boolean;
  compact?: boolean;
}) {
  if (!entries.length)
    return (
      <div className="table-empty">
        <span className="empty-line-icon">
          <ArrowDownLeft size={24} />
        </span>
        <h3>Nenhuma movimentação por aqui</h3>
        <p>Seus lançamentos aparecerão aqui para você acompanhar tudo com clareza.</p>
      </div>
    );
  return (
    <div className="table-scroll">
      <table className="entry-table">
        <thead>
          <tr>
            <th>Descrição</th>
            {!compact && <th>Categoria</th>}
            <th>Vencimento</th>
            <th>Situação</th>
            <th className="align-right">Valor</th>
            <th>
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const settled = !!entry.settled_on && entry.settled_on <= cutoff;
            const overdue = !settled && entry.due_date < today && entry.due_date <= cutoff;
            return (
              <tr key={entry.id}>
                <td>
                  <div className="description-cell">
                    <span className={`entry-icon ${entry.kind}`}>
                      {entry.kind === 'income' ? (
                        <ArrowDownLeft size={18} />
                      ) : (
                        <ArrowUpRight size={18} />
                      )}
                    </span>
                    <div>
                      <strong>
                        {entry.title}
                        {entry.installment_number && (
                          <span className="part-number"> {entry.installment_number}ª parcela</span>
                        )}
                      </strong>
                      <small>
                        {entry.recurring_id ? (
                          <>
                            <Repeat2 size={12} /> Mensal
                          </>
                        ) : entry.installment_id ? (
                          <>
                            <Layers3 size={12} /> Compra parcelada
                          </>
                        ) : compact ? (
                          entry.category
                        ) : (
                          'Lançamento único'
                        )}
                      </small>
                    </div>
                  </div>
                </td>
                {!compact && <td className="category-cell">{entry.category}</td>}
                <td className="date-cell">
                  {dateLabel(entry.due_date)}
                  {entry.settled_on && (
                    <small>
                      {entry.kind === 'income' ? 'Recebido' : 'Pago'} em{' '}
                      {dateLabel(entry.settled_on)}
                    </small>
                  )}
                </td>
                <td>
                  <span
                    className={`badge ${settled ? 'success' : overdue ? 'overdue' : 'pending'}`}
                  >
                    {settled && <Check size={11} />}
                    {settled
                      ? entry.kind === 'income'
                        ? 'Recebido'
                        : 'Pago'
                      : overdue
                        ? 'Em atraso'
                        : entry.kind === 'income'
                          ? 'A receber'
                          : 'A pagar'}
                  </span>
                </td>
                <td className={`amount-cell ${entry.kind === 'income' ? 'positive' : ''}`}>
                  {hideValues
                    ? '•••••'
                    : `${entry.kind === 'income' ? '+' : '−'} ${money(entry.amount)}`}
                </td>
                <td>
                  <div className="row-actions">
                    <button
                      className={`icon-button ${settled ? 'is-settled' : ''}`}
                      onClick={() => open({ type: 'settle', entry })}
                      title={
                        settled
                          ? 'Alterar pagamento'
                          : entry.kind === 'income'
                            ? 'Receber receita'
                            : 'Pagar despesa'
                      }
                      aria-label={`${settled ? 'Alterar pagamento de' : entry.kind === 'income' ? 'Receber' : 'Pagar'} ${entry.title}`}
                    >
                      <Check size={16} />
                    </button>
                    {!compact && (
                      <>
                        <button
                          className="icon-button"
                          aria-label={`Editar ${entry.title}`}
                          onClick={() => open({ type: 'entry', kind: entry.kind, entry })}
                        >
                          <Pencil size={15} />
                        </button>
                        {!entry.installment_id && (
                          <button
                            className="icon-button danger-icon"
                            aria-label={`Excluir ${entry.title}`}
                            onClick={() => open({ type: 'delete', entry })}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

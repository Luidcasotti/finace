export const categories = [
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
export const money = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
export const dateLabel = (value: string) => value.split('-').reverse().join('/');
export const monthLabel = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${value}-15T12:00:00Z`),
  );
export function parseMoney(value: string) {
  if (!/^\d{1,9}(,\d{1,2})?$/.test(value.trim()))
    throw new Error('Informe o valor em reais, como 1500,50, sem pontos.');
  const [whole, fraction = ''] = value.trim().split(',');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 10_000_000_000)
    throw new Error('Informe um valor maior que zero e de até R$ 100.000.000,00.');
  return cents;
}
export const inputMoney = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
export function shiftMonth(value: string, delta: number) {
  const [year, month] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + delta, 15)).toISOString().slice(0, 7);
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new Error('Não foi possível conectar. Confira sua conexão e tente novamente.');
  }
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new Error('O serviço está indisponível. Tente novamente em instantes.');
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/'))
      window.dispatchEvent(new Event('session-expired'));
    throw new Error(data.error || 'Não foi possível concluir a ação.');
  }
  return data as T;
}

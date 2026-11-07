import { test, expect } from '@playwright/test';

test('fluxo financeiro com autenticação Sites e D1 real no runtime local', async ({
  page,
  context,
}, testInfo) => {
  // These headers emulate the trusted Sites dispatch ONLY against local Wrangler.
  // The hosted app never implements a development login or identity override.
  const identity = `qa-${testInfo.project.name}-${Date.now()}`;
  await context.setExtraHTTPHeaders({
    'oai-authenticated-user-id': identity,
    'oai-authenticated-user-email': `${identity}@example.com`,
    'oai-authenticated-user-full-name': 'Mariana Silva',
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const mobile = testInfo.project.name === 'mobile';
  async function navigate(name) {
    if (mobile) await page.getByRole('button', { name: 'Abrir menu' }).click();
    await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
  }
  async function save() {
    await page.getByRole('dialog').getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByText('Organizando seus números…')).not.toBeVisible();
  }
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Seu dinheiro, com clareza.' })).toBeVisible();
  await navigate('Receitas');
  await page.getByRole('button', { name: 'Nova receita', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Descrição', { exact: true }).fill('Salário mensal');
  await dialog.getByRole('textbox', { name: 'Valor em reais' }).fill('5000,00');
  await dialog.getByLabel('Já recebi este valor').check();
  await dialog.getByLabel('Repetir todo mês').check();
  await save();
  await navigate('Despesas');
  await page.getByRole('button', { name: 'Nova despesa', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Descrição', { exact: true }).fill('Aluguel');
  await dialog.getByRole('textbox', { name: 'Valor em reais' }).fill('1000,00');
  await save();
  await page.getByRole('button', { name: 'Pagar Aluguel', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('cell', { name: 'Pago', exact: true })).toBeVisible();
  await navigate('Parcelas');
  await page.getByRole('button', { name: 'Nova compra', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Descrição da compra').fill('Compra parcelada');
  await dialog.getByRole('textbox', { name: 'Valor total em reais' }).fill('100,01');
  await dialog.getByLabel('Quantidade de parcelas').fill('3');
  await save();
  await navigate('Reservas');
  await page.getByRole('button', { name: 'Nova reserva', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome do objetivo').fill('Emergência');
  await dialog.getByRole('textbox', { name: 'Meta financeira em reais' }).fill('10000,00');
  await save();
  await page.getByRole('button', { name: 'Movimentar', exact: true }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: 'Valor em reais' }).fill('500,00');
  await save();
  await page.getByRole('button', { name: 'Movimentar', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Retirar valor' }).click();
  await dialog.getByRole('textbox', { name: 'Valor em reais' }).fill('100,00');
  await save();
  await navigate('Visão geral');
  await expect(page.locator('.metric.featured .metric-value')).toHaveText(/3\.600,00/);
  await expect(page.locator('.metric').last().locator('.metric-value')).toHaveText(/3\.566,66/);
  if (await page.getByRole('button', { name: 'Fechar mensagem' }).isVisible())
    await page.getByRole('button', { name: 'Fechar mensagem' }).click();
  await page.screenshot({
    path: testInfo.outputPath('financia-hosted.png'),
    fullPage: true,
    animations: 'disabled',
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBeTruthy();
  await page.reload();
  await expect(page.locator('.metric.featured .metric-value')).toHaveText(/3\.600,00/);
  if (mobile) await page.getByRole('button', { name: 'Abrir menu' }).click();
  await expect(page.getByRole('link', { name: 'Sair da conta' })).toHaveAttribute(
    'href',
    '/signout-with-chatgpt?return_to=%2F',
  );
  expect(errors).toEqual([]);
});

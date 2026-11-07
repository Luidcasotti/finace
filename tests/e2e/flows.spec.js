import { test, expect } from '@playwright/test';

async function navigate(page, name, mobile) {
  if (mobile) await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page
    .getByRole('navigation', { name: 'Menu principal' })
    .getByRole('button', { name, exact: true })
    .click();
}
async function save(page) {
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByText('Organizando seus números…')).not.toBeVisible();
}

test('cadastro e ciclo financeiro completo no computador e no celular', async ({
  page,
}, testInfo) => {
  const mobile = testInfo.project.name === 'mobile';
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Bom ter você por aqui.' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('01-login.png'), fullPage: true });
  await page.getByRole('button', { name: 'Criar conta grátis' }).click();
  await page.getByLabel('Seu nome').fill('Mariana Silva');
  const email = `mariana-${Date.now()}-${testInfo.project.name}@example.com`;
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('uma-senha-segura-123');
  await page.getByRole('button', { name: 'Criar minha conta' }).click();
  await expect(page.getByRole('heading', { name: 'Seu dinheiro, com clareza.' })).toBeVisible();
  await expect(page.getByText('Organizando seus números…')).not.toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('02-vazio.png'), fullPage: true });
  const auth = await (await page.request.get('/api/auth/me')).json();
  const today = auth.today;
  const selected = today.slice(0, 7);
  // Income is received today; expected income remains outside the available balance.
  await navigate(page, 'Receitas', mobile);
  await page.getByRole('button', { name: 'Nova receita', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Descrição', { exact: true }).fill('Salário mensal');
  await dialog.getByRole('textbox', { name: 'Valor em reais' }).fill('6500,00');
  await dialog.getByLabel('Repetir todo mês').check();
  await dialog.getByLabel('Já recebi este valor').check();
  await save(page);
  await expect(page.getByText('Salário mensal', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Nova receita', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Descrição', { exact: true }).fill('Projeto extra');
  await dialog.getByRole('textbox', { name: 'Valor em reais' }).fill('800,00');
  await dialog.getByLabel('Categoria').selectOption('Trabalho extra');
  await save(page);
  await navigate(page, 'Despesas', mobile);
  await page.getByRole('button', { name: 'Nova despesa', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Descrição', { exact: true }).fill('Aluguel');
  await dialog.getByRole('textbox', { name: 'Valor em reais' }).fill('1500,00');
  await dialog.getByLabel('Categoria').selectOption('Moradia');
  await dialog.getByLabel('Repetir todo mês').check();
  await save(page);
  await page.getByRole('button', { name: 'Pagar Aluguel', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('cell', { name: 'Pago', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Nova despesa', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Descrição', { exact: true }).fill('Internet');
  await dialog.getByRole('textbox', { name: 'Valor em reais' }).fill('120,00');
  await dialog.getByLabel('Categoria').selectOption('Serviços');
  await save(page);
  await page.getByRole('button', { name: 'Editar Internet', exact: true }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: 'Valor em reais' }).fill('129,90');
  await save(page);
  await page.getByLabel('Buscar lançamento').fill('Internet');
  await expect(page.getByText('Aluguel', { exact: true })).not.toBeVisible();
  await expect(page.getByRole('cell', { name: /129,90/ })).toBeVisible();
  await page.getByLabel('Buscar lançamento').fill('');
  await navigate(page, 'Parcelas', mobile);
  await page.getByRole('button', { name: 'Nova compra', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Descrição da compra').fill('Notebook');
  await dialog.getByRole('textbox', { name: 'Valor total em reais' }).fill('3000,01');
  await dialog.getByLabel('Quantidade de parcelas').fill('3');
  await save(page);
  await page.getByRole('button', { name: 'Ver parcelas' }).click();
  await expect(page.getByRole('dialog').getByText('R$ 1.000,01', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar janela' }).click();
  await navigate(page, 'Reservas', mobile);
  await page.getByRole('button', { name: 'Nova reserva', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome do objetivo').fill('Reserva de emergência');
  await dialog.getByRole('textbox', { name: 'Meta financeira em reais' }).fill('15000,00');
  await save(page);
  await page.getByRole('button', { name: 'Movimentar', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Valor em reais' }).fill('1000,00');
  await save(page);
  await page.getByRole('button', { name: 'Movimentar', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Retirar valor' }).click();
  await dialog.getByRole('textbox', { name: 'Valor em reais' }).fill('100,00');
  await save(page);
  await page.getByRole('button', { name: 'Histórico', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('Aporte', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Retirada', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar janela' }).click();
  await navigate(page, 'Visão geral', mobile);
  await expect(page.locator('.metric.featured .metric-value')).toHaveText(/4\.100,00/);
  await expect(page.locator('.metric').last().locator('.metric-value')).toHaveText(/3\.770,09/);
  await page.screenshot({
    path: testInfo.outputPath('03-painel.png'),
    fullPage: true,
    animations: 'disabled',
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page.getByRole('button', { name: 'Ocultar valores', exact: true }).click();
  await expect(page.locator('.metric.featured .metric-value')).toHaveText('•••••');
  await page.getByRole('button', { name: 'Mostrar valores', exact: true }).click();
  await page.reload();
  await expect(page.locator('.metric.featured .metric-value')).toHaveText(/4\.100,00/);
  await page.getByLabel('Selecionar mês e ano').fill(`${Number(selected.slice(0, 4)) + 1}-01`);
  await expect(page.getByText('Organizando seus números…')).not.toBeVisible();
  await page.getByRole('button', { name: 'Voltar ao mês atual' }).click();
  await expect(page.locator('.metric.featured .metric-value')).toHaveText(/4\.100,00/);
  await navigate(page, 'Despesas', mobile);
  await page.getByRole('button', { name: 'Excluir Internet', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Excluir lançamento', exact: true })
    .click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('table').getByText('Internet', { exact: true })).not.toBeVisible();
  if (mobile) await page.getByRole('button', { name: 'Abrir menu' }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBeTruthy();
  await page.getByRole('button', { name: 'Sair da conta' }).click({ timeout: 5000 });
  await expect(page.getByRole('heading', { name: 'Bom ter você por aqui.' })).toBeVisible();
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('uma-senha-segura-123');
  await page.getByRole('button', { name: 'Entrar na minha conta' }).click();
  await expect(page.locator('.metric.featured .metric-value')).toHaveText(/4\.100,00/);
  expect(errors).toEqual([]);
});

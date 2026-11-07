# financia

Primeira versão funcional de um SaaS de finanças pessoais, em português brasileiro. React 19 + TypeScript + Vite no navegador; Express 5 e SQLite no servidor. Requer **Node.js 24 ou superior**.

## Executar localmente

No PowerShell, dentro de `C:\meus projetos\financia`:

```powershell
npm.cmd ci
Copy-Item .env.example .env
npm.cmd run dev
```

Abra **http://localhost:5173** e escolha **Criar conta grátis**. Não há conta padrão nem dados de demonstração. O primeiro cadastro cria seu usuário e inicia uma sessão real.

`npm.cmd` evita a restrição de execução de scripts `.ps1` do PowerShell. Em outros terminais, `npm` funciona normalmente. O comando de desenvolvimento inicia a API na porta 3001 e o Vite na 5173. Se alterar a porta da API, configure também `API_PORT` para o proxy do Vite. Se alterar o endereço do navegador, ajuste `APP_ORIGIN` para a origem exata, incluindo a porta.

Os dados são gravados automaticamente em `data/financia.db`. Reiniciar a aplicação preserva contas, sessões e lançamentos. O banco, arquivos temporários e `.env` são ignorados pelo Git.

## Funcionalidades

- **Visão geral:** mês/ano, receitas e despesas previstas/realizadas, saldo disponível, projeção, contas pendentes e reservas.
- **Receitas e despesas:** cadastro, edição, exclusão, categorias, datas, confirmação/desfazimento de recebimento ou pagamento, busca e filtros. Recorrências mensais podem ter valores diferentes por mês e ser encerradas sem apagar os demais meses realizados.
- **Parcelas:** geração de 2 a 120 parcelas, distribuição exata de centavos, vencimentos ajustados a meses curtos, saldo devedor e pagamento individual. Cada parcela é o próprio lançamento da despesa.
- **Reservas:** objetivos com meta e prazo opcional, edição, aportes, retiradas, progresso e histórico. Movimentações são transferências internas.
- **Conta:** cadastro com senha, login, sessão persistente, logout e isolamento por usuário. Layout adaptável a computador e celular, ocultação de valores e diálogos com confirmação de exclusão.

## Como os valores são calculados

Todos os valores persistidos e enviados à API são **inteiros em centavos**. O campo de valor aceita reais com vírgula e sem separador de milhar, por exemplo `1500,50`.

| Valor                        | Definição                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Disponível                   | Receitas efetivamente recebidas menos despesas efetivamente pagas, menos o dinheiro reservado. Acumula o histórico até o fim do mês selecionado. |
| Receitas/despesas previstas  | Lançamentos com vencimento no mês selecionado, incluindo os já realizados.                                                                       |
| Recebido/pago na visão geral | Valores cuja data de recebimento/pagamento está no mês selecionado, mesmo se o vencimento pertencer a outro mês.                                 |
| Recebido/pago nas listas     | Parte dos lançamentos do mês selecionado realizada até o fim daquele mês.                                                                        |
| Projeção                     | Disponível + receitas pendentes − despesas pendentes com vencimento até o fim do mês. Inclui atrasados.                                          |
| Reservado                    | Soma líquida de aportes e retiradas com data até o fim do mês selecionado.                                                                       |

Não há saldo inicial implícito. Para migrar dinheiro já existente, cadastre uma receita recebida com descrição como `Saldo de abertura`, categoria `Outros` e a data de início do controle. Depois, transfira a parte destinada a reservas. O saldo disponível pode ficar negativo quando pagamentos superam recebimentos.

Reconfirmar um pagamento atualiza a mesma linha, sem duplicar saídas. Recebimentos, pagamentos e transferências com datas futuras são rejeitados. Uma receita só prevista não financia um aporte. Aportes não podem superar o disponível e retiradas não podem superar a reserva; a validação também confere datas históricas afetadas por movimentações retroativas.

As recorrências são materializadas até o mês consultado, com chave única por regra/mês. Alterar o vencimento ou excluir uma ocorrência não gera outra cópia. O dia original é preservado: uma conta do dia 31 vence em 28/29 de fevereiro e volta ao dia 31 em março. A exclusão de uma parcela isolada é impedida para preservar o total da compra.

## Configuração e produção

Para publicar a aplicação atual no Render, há um Blueprint pronto com disco persistente. Veja o [guia de publicação](DEPLOY.md), incluindo custo estimado, conexão da conta e o link para revisar o deploy.

Nenhuma credencial de serviço externo é necessária. O arquivo `.env.example` contém todas as configurações:

| Variável        | Uso                                                                                     |
| --------------- | --------------------------------------------------------------------------------------- |
| `PORT`          | Porta da API; padrão `3001`.                                                            |
| `HOST`          | Rede de escuta; `127.0.0.1` local e `0.0.0.0` em produção.                              |
| `APP_ORIGIN`    | Origem exata autorizada para alterações; local `http://localhost:5173`.                 |
| `DATABASE_PATH` | Caminho do SQLite; padrão `./data/financia.db`.                                         |
| `APP_TIMEZONE`  | Fuso das datas; padrão `America/Rio_Branco`.                                            |
| `NODE_ENV`      | Use `production` na hospedagem.                                                         |
| `TRUST_PROXY`   | Use `1` somente se houver um proxy reverso confiável diretamente à frente do Node.      |
| `API_PORT`      | Apenas desenvolvimento/testes: destino do proxy do Vite, caso a API não esteja em 3001. |

```powershell
npm.cmd ci
npm.cmd run build
# Configure antes no .env:
# NODE_ENV=production
# APP_ORIGIN=https://financas.seu-dominio.com
# DATABASE_PATH=/caminho/persistente/financia.db
npm.cmd start
```

O Node serve tanto a API quanto os arquivos compilados de `dist/`, no mesmo domínio. Em produção, a API escuta em `0.0.0.0` para receber o tráfego do provedor. A origem HTTPS vem de `APP_ORIGIN` ou de `RENDER_EXTERNAL_URL` no Render, e os cookies recebem `Secure`. Para um servidor próprio, coloque um proxy HTTPS à frente dela; `HOST=127.0.0.1` restringe o Node ao proxy local. Use disco persistente com acesso restrito ao processo e mantenha backups consistentes do SQLite, incluindo seu modo WAL; pare o processo antes de copiar o banco ou utilize a API de backup do SQLite. Esta estrutura atende uma instância Node; múltiplas máquinas exigem migrar para um banco compartilhado.

Senhas usam scrypt com salt aleatório. Sessões usam tokens aleatórios de 256 bits, apenas seus hashes ficam no banco. Cookies são `HttpOnly` e `SameSite=Strict`, com validade de sete dias. O servidor valida a origem e o tipo de conteúdo de todas as alterações, aplica limites de requisições, valida os campos com Zod e restringe todas as consultas ao usuário da sessão. Chaves estrangeiras compostas também impedem relacionar dados de usuários diferentes.

Não há recuperação de senha por e-mail, verificação de e-mail, cobrança de assinatura ou integração bancária nesta versão. Para disponibilizar publicamente, ainda é necessário contratar/configurar a hospedagem Node, domínio, certificado HTTPS, armazenamento persistente e backup. Nenhum serviço foi publicado automaticamente.

As fontes DM Sans e Manrope são carregadas pelo Google Fonts, com fallback local para sans-serif se o acesso não estiver disponível.

## Verificações

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run test:e2e
npm.cmd audit
```

Os testes de unidade/API cobrem cálculos realizados/projetados, arredondamento, meses curtos e ano bissexto, idempotência de recorrências/pagamentos, cancelamento futuro, validação, proteção contra alterações entre origens, autenticação, persistência em disco, reservas e isolamento entre usuários.

Os testes Playwright percorrem cadastro/login, receitas, despesas, edição, busca, pagamento, parcelas, reservas, aporte/retirada, histórico, seletor de mês, persistência após recarregar e exclusão. Rodam em Chromium com viewport de computador (1440 px) e celular (Pixel 7), conferem ausência de rolagem horizontal da página e registram capturas em `test-results/`. Usam exclusivamente `data/e2e.db`, separado do banco da aplicação. O relatório pode ser aberto com `npx.cmd playwright show-report`.

O override de `minimatch` nas dependências de desenvolvimento corrige a vulnerabilidade de negação de serviço presente na versão transitiva usada pelo analisador TypeScript. O lockfile registra a versão validada.

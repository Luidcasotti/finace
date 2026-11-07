# Validação da primeira versão

Verificada em 06/11/2026, com Node.js 24.19.0, no Windows.

| Verificação                | Resultado                                           |
| -------------------------- | --------------------------------------------------- |
| `npm.cmd run format:check` | Aprovado.                                           |
| `npm.cmd run lint`         | Aprovado, sem avisos.                               |
| `npm.cmd test`             | 13 testes aprovados.                                |
| `npm.cmd run build`        | TypeScript e build de produção aprovados.           |
| `npm.cmd run test:e2e`     | 2 fluxos completos aprovados: computador e celular. |
| `npm.cmd audit`            | Nenhuma vulnerabilidade reportada.                  |
| `git diff --check`         | Sem erros de espaços ou conflitos.                  |

O teste de produção com banco temporário em memória confirmou HTML com HTTP 200, política de segurança de conteúdo, cadastro real e cookies `Secure`/`HttpOnly`, além de `Cache-Control: no-store` na API. O comando de desenvolvimento também foi iniciado: a página em `http://localhost:5173` respondeu HTTP 200 e o proxy da API respondeu HTTP 401 para consulta sem sessão, como esperado. Os servidores de verificação foram encerrados.

Os testes de API confirmam que um usuário não pode ler, editar, excluir, liquidar ou movimentar dados de outro, inclusive quando conhece os IDs. Também verificam a restrição de chaves estrangeiras entre usuários no banco, persistência em disco, expiração/logout e rejeição de alterações originadas em outro site.

Os fluxos de navegador usam contas criadas apenas no banco separado `data/e2e.db`. Incluem recebimentos previstos/realizados, contas recorrentes, pagamento, edição e exclusão de despesa, busca, compra parcelada, aporte, retirada, histórico, troca de mês, ocultação de valores, recarregamento e novo login. Conferem os saldos esperados e a ausência de erros JavaScript ou rolagem horizontal da página. A tabela detalhada mantém sua própria rolagem em telas estreitas.

Foram inspecionadas capturas de login, painel vazio e painel preenchido nos dois tamanhos de tela. As capturas e o relatório Playwright ficam em `test-results/` e `playwright-report/`, ignorados pelo Git. Os lançamentos ilustrados são exclusivamente dados dos testes.

Não foi realizada publicação em hospedagem. O funcionamento local não depende de credenciais externas. A configuração de uma hospedagem com Node, HTTPS, disco persistente e backups está descrita no [README](README.md).

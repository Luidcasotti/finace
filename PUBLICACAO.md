# Publicação no Sites

**Endereço publicado:** https://financia-luid-casotti.casottimarinetti.chatgpt.site

A hospedagem confirmou a publicação com estado `succeeded`. O site está privado para o proprietário e usa a entrada com a conta ChatGPT. Não foi contratado serviço pago no Render nem uma conta separada da Cloudflare. Os limites e condições da conta Sites continuam se aplicando.

## Aplicação publicada

- Frontend React com visão geral, receitas, despesas, parcelas e reservas.
- API em Worker com banco D1 persistente provisionado pelo Sites.
- Identidade fornecida pelo gateway Sites, com dados separados por usuário.
- Valores em centavos, recorrências idempotentes, parcelas com soma exata e transferências de reservas validadas na gravação.
- Migração de schema incluída no artefato de publicação.

O banco online é separado do SQLite local e começa sem os seus lançamentos locais. Nenhum banco, senha ou dado financeiro da pasta local foi enviado junto com o código. A versão local com login por e-mail/senha continua disponível na raiz do repositório.

## Verificações realizadas

| Verificação                                           | Resultado                                    |
| ----------------------------------------------------- | -------------------------------------------- |
| Lint e formatação                                     | Aprovados.                                   |
| Testes da API local e cálculos originais              | 17 aprovados.                                |
| Testes da API para Sites/D1                           | 6 aprovados.                                 |
| Fluxos de navegador da versão original                | Computador e celular aprovados.              |
| Fluxos de navegador com D1 no runtime local do Worker | Computador e celular aprovados.              |
| Build React e Worker                                  | Aprovado.                                    |
| Auditoria de dependências da versão Sites             | Nenhuma vulnerabilidade reportada.           |
| Publicação na hospedagem                              | Confirmada como `succeeded` com a URL acima. |

Os testes de navegador do Worker usaram identidades de teste apenas no Wrangler local. A confirmação de publicação veio da hospedagem; não foi feito login interativo de um usuário no endereço de produção durante esta entrega.

## Referência técnica

- Branch GitHub: `feat/hospedagem-gratuita`.
- Commit de implementação: `7a5bbef`.
- Código publicado: `sites/financia-web/`.
- Commit do repositório de publicação Sites: `fbc0d5040a144fd3c9f25806a635f9c846a3e167`.
- Projeto Sites: `appgprj_6aeeab7f232c8191a7ffabb3112509cc`.
- Deploy confirmado: `appgdep_6aeeaf0df3308191a2aa2330c25c75d9`.

O [README da versão Sites](sites/financia-web/README.md) descreve desenvolvimento, testes, sincronização das telas e manutenção do schema.

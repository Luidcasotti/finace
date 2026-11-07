# Publicar na web com Render

**Alternativa escolhida para evitar o custo do Render:** a versão para ChatGPT Sites está em [sites/financia-web](sites/financia-web/README.md). As instruções abaixo continuam disponíveis como opção paga, mas nenhum serviço Render foi contratado.

O projeto está preparado para hospedar a interface e a API no mesmo serviço Node, preservando o SQLite em disco persistente. A publicação depende de uma conta Render conectada e da aprovação dos recursos pagos. Nenhum recurso foi contratado ou publicado apenas por adicionar estes arquivos ao GitHub.

## Configuração pronta

O [render.yaml](render.yaml) define:

- Serviço Node 24.19.0, com 512 MB de RAM e 0,5 CPU, na região `virginia`.
- Branch `feat/publicacao-web` do repositório `Luidcasotti/finace`.
- Instalação, lint, testes e build antes de iniciar a aplicação.
- Banco em `/var/data/financia.db`, dentro de um disco persistente de 1 GB.
- HTTPS e subdomínio `onrender.com` fornecidos pelo Render.
- Origem autorizada obtida de `RENDER_EXTERNAL_URL`, sem adivinhar a URL do serviço.
- Health check público em `/healthz`, que também confere a conexão com o banco.
- Cookies seguros em produção, proteção de origem e acesso aos dados por usuário.
- Deploys automáticos desabilitados: publicar uma nova versão exige uma ação explícita no provedor.

O plano de referência custa US$ 7/mês pelo serviço e US$ 0,25/mês pelo disco de 1 GB: **estimativa base de US$ 7,25/mês**, antes de impostos, consumo excedente e outros recursos da conta. Confira o total no painel antes de confirmar. Valores consultados em 06/11/2026 na [tabela oficial](https://render.com/pricing). O [plano gratuito não aceita disco persistente](https://render.com/docs/free), portanto não preserva este SQLite com a arquitetura atual.

## Publicação

Com a integração Render conectada ao assistente, a criação do serviço e o acompanhamento do deploy podem ser feitos pela conversa. A integração com GitHub precisa permitir acesso ao repositório, se ele for privado.

Também é possível revisar a mesma configuração diretamente no provedor:

[Revisar e publicar no Render](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2FLuidcasotti%2Ffinace%2Ftree%2Ffeat%2Fpublicacao-web)

1. Entre na sua conta Render e autorize o acesso ao repositório GitHub.
2. Revise o Blueprint, o plano de computação, o disco e o valor apresentado.
3. Confirme a criação do serviço.
4. Aguarde o build e o estado `Live`.
5. Abra a URL HTTPS retornada pelo Render e crie sua conta no financia.

Não é necessário comprar domínio. A URL efetiva só existe depois que o serviço é criado; o nome `financia` pode receber um sufixo do provedor. O banco da nuvem começa vazio. Os dados da pasta local não são enviados pelo Git ou pelo deploy. Uma eventual migração de dados locais exige um backup consistente e transferência separada.

## Conferência após publicar

- `GET /healthz` deve retornar HTTP 200 e `{"status":"ok"}`.
- A página inicial deve carregar via HTTPS.
- Cadastro, login e logout devem funcionar no domínio publicado.
- O cadastro de uma receita deve permanecer após recarregar a página.
- Contas distintas devem continuar sem acesso aos dados umas das outras.
- Após reiniciar ou redeployar o serviço, os registros devem continuar no banco do disco.

Essas verificações remotas só podem ser concluídas depois que houver um serviço publicado. Os testes locais verificam a configuração de produção, vínculo de rede, origem, health check e cookies seguros.

## Domínio próprio e operação

Ao adicionar um domínio próprio, configure `APP_ORIGIN=https://seu-dominio` no Render e faça um novo deploy. Essa configuração prevalece sobre `RENDER_EXTERNAL_URL`. Use a origem exata, sem caminhos. O acesso por outro domínio não poderá alterar dados, por proteção contra requisições de outra origem.

Este SQLite usa uma única instância do serviço. O disco do Render é exclusivo dessa instância; não escale horizontalmente sem migrar para um banco compartilhado. Deploys com disco podem ter uma breve interrupção. Mantenha backups consistentes do SQLite por meio da API de backup ou com o processo parado, sem copiar somente o arquivo principal enquanto houver gravações em WAL.

Referências: [web services](https://render.com/docs/web-services), [discos persistentes](https://render.com/docs/disks), [variáveis do provedor](https://render.com/docs/environment-variables) e [Blueprint](https://render.com/docs/blueprint-spec).

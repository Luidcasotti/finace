# financia para Sites

Versão da aplicação preparada para hospedagem integrada do ChatGPT Sites, sem contratar o serviço pago do Render. O frontend React mantém as mesmas telas da aplicação local. A API usa Cloudflare Workers, banco D1 persistente e identidade fornecida pelo gateway Sites.

O projeto Sites e o banco são provisionados pela integração. Não é necessária uma conta separada da Cloudflare nem uma chave de API externa. A disponibilidade e os limites de uso da sua conta Sites continuam se aplicando.

## Acesso

A versão publicada começa privada para o proprietário. A entrada usa a conta ChatGPT. Não há uma segunda senha cadastrada no financia nesta versão. Cada consulta e alteração usa o identificador estável do usuário fornecido pelo Sites, com chaves estrangeiras que também restringem relações entre usuários diferentes.

Os headers de identidade são confiáveis por serem definidos pelo gateway Sites. Para hospedar esta API em outro provedor, substitua essa camada por autenticação apropriada ao novo ambiente.

## Desenvolvimento local

```powershell
cd sites/financia-web
npm.cmd ci
npm.cmd run build
npm.cmd run db:local
npm.cmd run dev
```

O Wrangler serve o Worker em `http://127.0.0.1:8787`. O banco local em `.wrangler/state` é separado do banco publicado. As migrações SQL e os metadados ficam em `drizzle/`; alterações de schema devem gerar novas migrações com `npm.cmd run db:generate`.

Sem o gateway Sites, a página local apresenta o botão de entrada ChatGPT. Os testes de navegador emulam os headers de identidade exclusivamente no endereço local do Wrangler. Não há rota de login de demonstração nem bypass de autenticação no Worker.

## Testes

```powershell
npm.cmd test
npx.cmd playwright install chromium
npm.cmd run test:e2e
npm.cmd audit
```

Os seis testes da API verificam autenticação, origem, isolamento, parcelas, recorrência e transferências. A validação do saldo das reservas faz parte da instrução SQL de gravação, evitando que solicitações simultâneas gastem o mesmo saldo. Os testes de navegador percorrem o fluxo financeiro com D1 real no runtime local em computador e celular.

O parcelamento usa duas instruções SQL em um batch atômico, inclusive com 120 parcelas. A recorrência usa uma instrução com chave única por regra/mês. O Worker não altera o schema durante requisições; o Sites aplica as migrações na publicação.

## Manutenção e publicação

O código deste diretório é autossuficiente para publicar. Para atualizar as telas a partir do projeto principal, edite `src/` na raiz do repositório e execute `npm.cmd run sync:client` neste diretório. Esse comando também copia os cálculos compartilhados de `server/finance.js`. Ele é uma ferramenta de manutenção do repositório e não é necessário para o build da cópia publicada.

O build gera o frontend em `dist/client/` e o Worker em `dist/server/index.js`, com os assets do frontend incorporados para evitar dependência de um serviço de arquivos separado. O manifesto `.openai/hosting.json` identifica o Site e o binding D1 `DB`. O empacotamento do Sites inclui as migrações e envia somente código e arquivos compilados, sem o banco local.

Não publique esta pasta como site estático: a API e o D1 são necessários para a aplicação funcionar.

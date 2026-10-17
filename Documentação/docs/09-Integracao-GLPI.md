# Integração GLPI — API REST clássica

Este documento descreve a configuração técnica da integração GLPI 9.5.4. O fluxo operacional e o histórico local de chamados estão em [Chamados e integração GLPI](10-Chamados-e-Integracao-GLPI.md).

## Arquitetura e autenticação

`React -> API interna /api/glpi/* -> services/glpi -> API REST GLPI`

O backend inicia uma sessão com `GET initSession`, enviando `Authorization: user_token ...` e `App-Token` quando configurado. O `session_token` é mantido apenas em memória e enviado como `Session-Token` nas chamadas autenticadas. Cada operação encerra a sessão com `GET killSession` em `finally`. Sessões e tokens nunca são enviados ao navegador nem persistidos no D1.

O cliente usa fetch nativo, timeouts limitados entre 1 e 30 segundos e `redirect: 'manual'`; respostas opacas ou com status 3xx são recusadas sem seguir o destino, evitando encaminhar tokens. A autenticação e as leituras usam `GLPI_TIMEOUT_MS`; apenas o POST de criação usa `GLPI_TICKET_CREATE_TIMEOUT_MS`. Esse modo é compatível com Node e Workerd. O teste de conexão valida `initSession`, consulta `getActiveProfile` e encerra a sessão. Respostas externas são normalizadas e seus corpos/headers privados não são devolvidos ao frontend.

## Configuração do servidor

Defina estas chaves em um único arquivo local ignorado pelo Git (`.env` ou `.dev.vars`) ou como secrets do Worker. Nunca mantenha os dois arquivos locais ao mesmo tempo. Não imprima ou versione seus valores.

No desenvolvimento Vinext/Vite (`pnpm dev`), o Cloudflare Vite plugin carrega o `.env` na raiz do projeto para o binding `env` do Worker. No preview local do Worker (`pnpm start`), `scripts/start-worker.mjs` passa o caminho absoluto do `.env` ou `.dev.vars` da raiz ao Wrangler e força bindings locais; isso evita depender da localização do arquivo de configuração gerado em `dist/server`. O launcher não copia nem imprime segredos. O código acessa essas configurações por `env` de `cloudflare:workers`, não por `process.env`. Em produção, configure segredos nos bindings do Worker.

| Variável | Regra |
|---|---|
| `GLPI_API_VERSION` | Obrigatória; `v1` para a API REST clássica |
| `GLPI_BASE_URL` | URL completa da API, terminada em `/apirest.php`; preferir HTTPS |
| `GLPI_USER_TOKEN` | Token de acesso remoto do usuário técnico GLPI |
| `GLPI_APP_TOKEN` | App Token do cliente API; pode estar vazio somente se a instância não o exigir |
| `GLPI_TIMEOUT_MS` | Opcional; padrão 10000, inteiro entre 1000 e 30000 |
| `GLPI_TICKET_CREATE_TIMEOUT_MS` | Opcional; padrão 20000, inteiro entre 1000 e 30000; aplicado somente ao POST de Ticket |

O timeout de criação foi separado após uma criação real levar aproximadamente 10,26 s com o limite geral de 10 s. O padrão de 20 s duplica esse limite para dar margem a uma resposta mais lenta do GLPI sem prolongar autenticação e leituras. Um POST que exceda o timeout continua resultando em `uncertain`; o sistema não repete a criação automaticamente.

Os tokens devem pertencer a uma conta técnica com as permissões GLPI estritamente necessárias para criar e consultar chamados. Essa conta não representa uma pessoa nem um usuário Lastro.

## Endpoints internos

- `GET /api/glpi/test`: inicia e encerra sessão; não cria chamado.
- `GET /api/glpi/tickets`: lista o histórico local; não chama o GLPI.
- `POST /api/glpi/tickets`: cria operação local e solicita um Ticket GLPI usando `{ "operationKey": "UUID v4", "title": "...", "content": "..." }`.
- `GET /api/glpi/tickets/:glpiId`: exige vínculo local, consulta o Ticket GLPI e sincroniza seus dados no histórico.

O corpo enviado ao GLPI V1 usa o payload já implementado: `{ "input": { "name": "...", "content": "..." } }`. Não são enviados campos de rota, trecho ou modelo nesta fase.

## Erros e resultado incerto

Erros de configuração, autenticação, autorização, conectividade, timeout e resposta inválida são normalizados. Se o POST ao GLPI puder ter sido processado sem que o Lastro receba uma confirmação, o estado local fica `uncertain`. O sistema não repete o POST automaticamente; confirme no GLPI antes de iniciar uma nova operação.

Uma falha ao encerrar a sessão é registrada somente com código seguro e não apaga um ticket já confirmado. Nunca registrar App Token, User Token, Session Token, Authorization completo ou corpo externo privado.

## Segurança e publicação

O backend de login individual e sessão local está documentado em [Autenticação backend GLPI](11-Autenticacao-Backend.md). Nesta etapa, a autenticação ainda não protege globalmente as rotas operacionais nem aplica roles nos endpoints existentes. Mantenha os endpoints acessíveis somente pelo ambiente confiável. A checagem de `Origin` reduz chamadas de outro site no navegador, mas não substitui autorização por usuário.

Não exponha a API operacional publicamente. Um Worker Cloudflare precisa ter conectividade de rede com a instalação GLPI; conectividade privada da empresa não é criada automaticamente pelo Worker.

## Homologação

Os testes automatizados simulam a API e não criam tickets reais. Um teste real anterior, registrado em 14/09/2026, recebeu HTTP 401 ao autenticar e não criou chamados. Nesta etapa, não foi repetido porque o destino configurado não foi confirmado como homologação autorizada. Antes do uso operacional, confirme ambiente e autorização, teste conexão, crie no máximo um ticket de teste identificado, consulte o ID e verifique o histórico local.

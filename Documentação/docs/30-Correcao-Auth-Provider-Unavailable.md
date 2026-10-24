# Correção de `AUTH_PROVIDER_UNAVAILABLE` na consulta de sessão

Data: 23/10/2026. A tela de login voltou a aparecer no runtime local em `http://127.0.0.1:8787`. A requisição sem cookie `GET /api/auth/me` respondeu **200** com `{"user":null}` e `Cache-Control: no-store` após a correção. A inspeção no Edge local confirmou formulário de login visível e ausência da mensagem de erro de sessão.

## Causa comprovada

A configuração efetiva em `.env` usa GLPI v1 e `GLPI_BASE_URL` com **HTTP e IP não privado**, sem `GLPI_PRIVATE_HTTP_HOST`. Somente essas propriedades foram inspecionadas; endereço completo e tokens não foram impressos nem usados. O validador `readGlpiUserAuthConfig()` lança `GlpiUserAuthError` com `failure='configuration'` para esse transporte, confirmado por diagnóstico local sem rede.

Antes da correção, `GET /api/auth/me` chamava `getAuthService()`, que construía imediatamente `GlpiUserAuthClient` e validava a URL mesmo sem cookie. O erro era convertido em `AuthError('AUTH_PROVIDER_UNAVAILABLE')` antes de `currentUser(null)` devolver a ausência de sessão. Logs do runtime registravam repetidos 503, sem a exceção original, pois a fábrica a normalizava. O binding `DB` consta no Worker compilado; a cópia íntegra da Etapa 12 registra migrations 0000–0012. A falha do GLPI não demonstrava falha do D1.

`AUTH_PROVIDER_UNAVAILABLE` permanece o resultado correto de uma **tentativa de login** quando o provedor GLPI falha por configuração/transporte, rede, resposta de identidade ou limpeza de sessão. Credenciais inválidas continuam tendo resposta de login negado. A rota de leitura de sessão não deve depender da construção desse provedor externo.

## Alteração restrita

- `services/auth/auth-runtime.ts`: fornece a identidade GLPI de forma tardia, construída apenas na chamada `authenticate()` do login. O mesmo cliente GLPI, validação de transporte, bootstrap e repositório local continuam usados.
- `services/auth/auth-service.ts`: ao consultar uma sessão ausente ou cookie malformado, testa a disponibilidade do armazenamento de sessões antes de retornar `null`. Tokens válidos continuam consultando a sessão, papel e atividade pelo repositório existente.
- `services/auth/auth-types.ts` e `db/auth-storage.ts`: contrato e consulta `SELECT 1 FROM sessions LIMIT 1` para detectar falha do D1 ou tabela ausente sem ler dados pessoais ou fazer DML. Uma falha retorna `AUTH_STORAGE_UNAVAILABLE` (503), não uma sessão vazia.
- `tests/auth.test.ts`: regressões para GLPI indisponível com sessão ausente/válida, login ainda indisponível e armazenamento indisponível com cookie ausente/malformado.

Não houve alteração de autenticação corporativa, autorização, cookies, duração/revogação de sessão, credenciais, migrations ou dados. O IP público HTTP segue recusado para login. A exceção privada preparada no [ajuste de transporte](29-Ajuste-Transporte-Autenticacao-GLPI.md) não foi ativada.

## Validação

| Verificação | Resultado |
|---|---|
| Testes selecionados de autenticação/UI/integração GLPI | 59 aprovados |
| Suíte completa | 222 aprovados, zero falhas |
| Lint | Aprovado |
| TypeScript | Aprovado |
| Build | Aprovado; aviso já conhecido de classificação estática de rotas Vinext |
| Runtime local sem cookie | `GET /api/auth/me` → 200 `{"user":null}` |
| Edge local sem cookie | Tela de login visível; mensagem de falha de sessão ausente |

Os testes de login/logout, sessão válida, expirada e revogada usam GLPI simulado e D1 isolado. Nenhuma credencial real foi transmitida ao GLPI. Não se realizou login real nem escrita de cadastro no D1 operacional. O runtime local está ativo somente em `127.0.0.1:8787`. Sem commit ou push.

# Etapa 16.6 — implementação inicial da governança das dimensões

Implementação concluída em 24/10/2026. Esta etapa adiciona somente a infraestrutura backend de governança para município, cliente e região operacional. Não há interface administrativa completa, atribuição de IDs aos pontos existentes, importação de planilhas, alteração do D1 operacional ou integração GLPI.

## Modelo implementado

A migration aditiva `0014_dimension_governance.sql` prepara:

- `dimension_values`: valores aprovados/retirados com ID UUID estável, tipo, nome de exibição, chave normalizada, UF apenas para município, revisão e auditoria;
- `dimension_name_keys`: reserva única de chave por dimensão, impedindo colisão entre nomes canônicos e aliases;
- `dimension_aliases`: estrutura auditável de aliases, preservada para a etapa administrativa posterior;
- `dimension_requests`: solicitação submetida, aprovada, rejeitada ou retirada, com solicitante, decisão, justificativas e revisão;
- `dimension_request_events`: histórico append-only de submissão e decisão;
- `dimension_operations`: recibo persistente de operações mutáveis, associado ao operador e ao hash da intenção.

Nenhuma tabela altera `information`, `details_json`, os índices da migration 0013, categorias, chamados ou registros existentes. Não há backfill nem inferência para os textos opcionais atuais de pontos.

## Contratos de API

| Endpoint | Perfil mínimo | Finalidade |
|---|---|---|
| `GET /api/dimensions?kind=<...>&q=&page=&pageSize=` | `viewer` | Valores aprovados paginados, ordenados e filtrados no servidor. |
| `GET /api/dimensions/requests?page=&pageSize=` | `operator` | Operador vê apenas pedidos próprios; administrador vê todos. |
| `POST /api/dimensions/requests` | `operator` | Submete pedido com `kind`, `proposedName`, `stateCode` (somente município) e `justification`; exige `Idempotency-Key`. |
| `POST /api/dimensions/requests/:id/approve` | `admin` | Aprova com `expectedRevision`, justificativa e `Idempotency-Key`; cria valor e reserva a chave na mesma transação. |
| `POST /api/dimensions/requests/:id/reject` | `admin` | Rejeita com revisão esperada, justificativa e chave idempotente. |

O servidor deriva usuário e tempo da sessão. Solicitações pendentes não entram no catálogo de seleção. Nome igual após normalização não é mesclado: uma aprovação concorrente ou colidente retorna conflito controlado. A infraestrutura de aliases existe no modelo, mas seu endpoint administrativo deliberadamente fica para a interface de administração posterior.

## Segurança e integridade

- Guards existentes mantêm `viewer` para leitura, `operator` para solicitar e `admin` para decidir.
- Corpos aceitam somente campos previstos; nomes e justificativas têm limite, NFC, espaço normalizado e bloqueio de padrões de segredo, contato ou rede.
- Municípios exigem UF em maiúsculas; clientes e regiões não aceitam UF.
- Revisão otimista impede duas decisões sobre a mesma solicitação.
- O mesmo `Idempotency-Key` recupera somente a mesma intenção do mesmo operador; reutilização diferente retorna conflito.
- Cada decisão grava valor, chave reservada, solicitação, evento e recibo em transação D1. Falhas anteriores ao commit retornam a solicitação ao estado submetido.
- Histórico e valores não são apagados por esses endpoints. Alias, renomeação, descontinuação e fusão ainda não expõem ação mutável nesta etapa.

## Arquivos principais

| Área | Arquivos |
|---|---|
| Migration e schema | `drizzle/0014_dimension_governance.sql`, `drizzle/meta/_journal.json`, `db/schema.ts` |
| Validação e persistência | `lib/dimension-governance.ts`, `db/dimension-governance.ts` |
| API | `services/dimensions/handlers.ts`, `services/dimensions/runtime.ts`, `app/api/dimensions/**` |
| Testes | `tests/dimension-governance.test.ts`, `package.json` |

## Validação realizada

| Verificação | Resultado |
|---|---|
| Testes direcionados de governança | 5/5 passaram: perfis, pedido, aprovação, rejeição, replay idempotente, colisão normalizada, revisão concorrente e rollback. |
| Suíte completa | 241/241 testes passaram, incluindo os cinco testes direcionados da governança. |
| Lint | `corepack.cmd pnpm lint` passou. |
| TypeScript | `corepack.cmd pnpm typecheck` passou. |
| Build | `corepack.cmd pnpm build` passou, incluindo as cinco rotas novas. |
| Integridade de patch | `git diff --check` passou; apenas avisos informativos de CRLF do Git foram emitidos. |

## Pendências para ativação e interface

1. A migration 0014 está **preparada e não aplicada** ao D1 operacional. Sua ativação exige etapa autorizada de backup, simulação isolada, restauração e validação pós-aplicação.
2. Criar a interface de catálogo, revisão administrativa, aliases, correção/retirada e histórico detalhado, usando os endpoints e tabelas preparados.
3. Em etapa posterior, definir a atribuição opcional dos IDs aprovados aos pontos e a transição explícita dos campos livres, sem inferir valores antigos.
4. Não há importação nem desbloqueio das quatro fichas do Lote 01; elas continuam `PENDENTE_APROVACAO_FINAL`.

Não foram executados migrations, D1 remoto, operações no GLPI real, importações, exclusões, commit ou push nesta etapa.

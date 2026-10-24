# Etapa 11 — Confiabilidade e idempotência cadastral

Data: 23/10/2026. Escopo: criação e edição de categorias e registros de rotas, VLANs, câmeras e pontos. Implementação concluída e validada em ambiente isolado; ativação operacional da migration 0012 pendente de autorização específica.

## Diagnóstico

Foram consultados os documentos das etapas 10.1–10.4 e os relatórios da auditoria de 22/10/2026. Os controles de revisão e de submissão existentes protegiam edições concorrentes e cliques repetidos na mesma montagem do formulário, mas não recuperavam uma confirmação perdida após recarga ou em outra aba. O achado A06 descrevia a gravação seguida de leitura completa: falhar na leitura podia apresentar como fracassada uma gravação já confirmada. Essa parte de A06/P04 foi tratada no novo caminho cadastral; isso não encerra indiscriminadamente os demais assuntos desses relatórios.

As melhorias visuais anteriores foram preservadas. A padronização visual não resolvia, por si só, a idempotência persistente.

## Contrato efetivamente implementado

- POST e PUT de `/api/data` exigem `Idempotency-Key` UUID v4 por intenção. A sessão validada no servidor determina o operador; autoria do navegador não é aceita.
- A chave fica vinculada globalmente ao operador e ao SHA-256 da representação JSON canônica do método e payload validado/normalizado, incluindo tipo, alvo e revisão quando aplicáveis. Campos de negócio não são identificadores de idempotência.
- Uma nova intenção legítima recebe outra chave, mesmo com conteúdo semelhante ou idêntico. Não há deduplicação por nome, título ou IP.
- A primeira requisição aceita reserva a chave persistentemente. A reserva contém `response_json` com o texto JSON `null`; isso **não representa confirmação**. Uma falha não libera a chave para outro payload.
- A alteração cadastral e a gravação do recibo confirmado pertencem ao mesmo `D1.batch`. Falhar a confirmação reverte a alteração; a reserva anterior permanece. Os testes verificam inclusive falha após gravação e antes do recibo.
- O SQL condiciona a escrita à reserva ainda pendente e ao operador ativo autorizado. Requisições concorrentes da mesma intenção retornam o mesmo recibo sem nova alteração. A revisão continua sendo exigida para uma edição nova; repetir uma edição já confirmada recupera seu recibo original.
- O recibo preserva identificador, revisão, horário do servidor e snapshot da confirmação. Repetições retornam esse snapshot, mesmo que o registro tenha recebido edições posteriores. Não há `readAll()` para montar a resposta da gravação.
- Reutilizar uma chave com outro operador, método, alvo ou payload gera conflito, sem executar a nova intenção. Reservas e recibos não possuem expiração automática.
- `GET /api/data/operations/[operationKey]` consulta somente a intenção do operador autenticado, com resposta sem cache. Um 404 significa ausência de confirmação disponível, não prova de ausência de requisição em andamento. O cliente pode repetir explicitamente o payload original com a mesma chave.
- Recibo inconsistente é tratado como resultado desconhecido. Tabela ausente retorna `DATA_SCHEMA_REQUIRED` (503): não há criação automática da tabela ou fallback para gravação sem proteção.

A atomicidade utilizada corresponde ao contrato documentado de [D1Database.batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch). Os testes usam bancos SQLite isolados e o Worker D1 local; não houve acesso ao D1 remoto.

## Recuperação nos formulários

Antes da primeira requisição, um outbox em `localStorage` conserva chave, payload normalizado e campos originais, separados por operador e intenção. O limite por entrada é 192 KiB. Valores identificados como credenciais são rejeitados antes de armazenamento. Sem armazenamento disponível, a submissão falha antes de enviar a mutação.

Erros definitivos e conflitos de revisão permitem corrigir os campos e, mediante nova submissão explícita, iniciar outra intenção. Em falhas de rede, respostas ambíguas ou recibos inválidos, campos e chave ficam congelados. A ação **Consultar / repetir a mesma intenção** consulta primeiro o recibo e, se necessário, repete a intenção original. Não há reenvio automático ao montar a página, recarregar ou receber eventos de outra aba.

**Retomar depois** mantém a intenção para recuperação. Recarregar a página ou abrir outra aba do mesmo perfil permite retomar o rascunho, inclusive categoria e revisão originais. O aviso exibe um identificador da intenção para distinguir conteúdos semelhantes. Durante envio, Escape e clique externo não desmontam prematuramente o formulário. Uma falha ao atualizar a lista após sucesso aparece separadamente da confirmação da gravação.

Foi corrigido um transbordamento comprovado do aviso com nome longo em 320 px, reutilizando as classes e tokens existentes. Não foram alterados paleta, ícones, navegação ou identidade visual.

## Banco e ativação

Migration aditiva: [`0012_data_operations.sql`](../../drizzle/0012_data_operations.sql), com tabela `data_operations`, chave primária da operação, FK do operador, validações e índice por operador/horário. Snapshot `0012_snapshot.json` e entrada 12 no journal Drizzle acompanham a migration. Migrations e snapshots anteriores permaneceram iguais aos do início desta etapa.

A migration foi aplicada **somente nos bancos descartáveis de testes**. Não foi aplicada ao D1 operacional e não foram alterados seus registros. Clientes antigos que enviam POST/PUT sem chave não atendem ao novo contrato. A publicação desse caminho exige uma janela de ativação autorizada: backup consistente, conferência do binding e banco, aplicação exclusiva da 0012 no destino autorizado, validação e disponibilização do cliente compatível. Não há autorização nesta etapa para realizar essa ativação.

Uma recuperação futura precisa preservar também o ledger junto dos cadastros. Não limpar reservas/recibos sem definir uma política que considere a possibilidade de requisições antigas serem repetidas.

## Arquivos desta etapa

| Área | Arquivos |
|---|---|
| Contrato e persistência | `services/data/operations.ts`, `db/data-operations.ts`, `db/data-write.ts`, `db/persistence.ts`, `db/storage.ts`, `db/schema.ts` |
| API | `app/api/data/handlers.ts`, `app/api/data/route.ts`, `app/api/data/operations/[operationKey]/route.ts` |
| Cliente | `lib/data-intents.ts`, `lib/form-submission.ts`, `components/preserved-form.tsx`, `app/page.tsx` |
| Banco | `drizzle/0012_data_operations.sql`, `drizzle/meta/0012_snapshot.json`, `drizzle/meta/_journal.json` |
| Testes | `tests/data-operations.test.ts`, `tests/data-intents.test.ts`, `tests/data-api.test.ts`, `package.json` |
| Documentação | Este capítulo, acompanhamento 15, índice e notas de atualização do capítulo 25/acompanhamento 14 |

O repositório já continha numerosas alterações de etapas anteriores. Elas foram preservadas; o estado anterior consta em `git-before.txt` e na cópia `source-before` das evidências, não devendo ser confundidas com alterações desta etapa.

## Validação automatizada

| Verificação | Resultado |
|---|---|
| `pnpm test` | 219 testes aprovados, zero falhas; 14 testes novos do ledger e 5 do outbox |
| `pnpm lint` | Aprovado |
| `pnpm typecheck` | Aprovado |
| `pnpm build` | Aprovado; permanece aviso conhecido de classificação de rotas do Vinext |
| Build da cópia isolada | Aprovado |

Cobertura: repetição de criação/edição, conteúdo igual com chave nova, payload/método/operador/alvo divergente, normalização, concorrência, revisão obsoleta, rollback de escrita e revisão, perda de resposta depois do commit, recibo inconsistente, autorização e desativação concorrente, schema ausente, chaves estrangeiras, contagem com triggers, recuperação independente da leitura da lista e preservação do outbox. Criação e edição dos quatro tipos de registro estão cobertas pelos testes de banco.

## Validação efetiva no Edge

Foram realizadas **28 verificações aprovadas** no Edge real, com Worker/D1 locais isolados, dados sintéticos e adaptadores simulados de autenticação e GLPI. As mutações cadastrais chegaram ao banco isolado; não foram apenas respostas falsas da API cadastral.

| Evidência | Verificações |
|---|---:|
| `final/browser-results.json` — perda de resposta, restauração após recarga, recuperação sem nova escrita, repetição/edição/conflito | 11 |
| `final/two-tabs-results.json` — recuperação de câmera em outra aba e POST concorrente em duas abas reais | 6 |
| `final/edge-cases-results.json` — edição incerta, adiamento, recuperação negada, lista indisponível após confirmação e validação corrigível | 7 |
| `final/mobile-results.json` — falha anterior ao envio, outbox e formulário em 320 px, repetição explícita da mesma chave | 4 |

Os cenários incluem tema claro/escuro e desktop/celular. Não constituem uma nova auditoria visual exaustiva V01–V21, avaliação WCAG integral ou homologação de todos os formulários de cada módulo no navegador. A cobertura de todos os tipos de cadastro é complementada pelos testes automatizados.

Evidências locais: `C:\Users\yurit\Lastro-backups\etapa11-20261023T113803Z`. Capturas em `final/screenshots`: `01-uncertain-category.png`, `02-restored-category.png`, `03-confirmed-category.png`, `04-two-tabs-confirmed.png`, `05-recovery-denied.png`, `06-confirmed-with-read-error.png`, `07-mobile-dark-confirmation.png`, `09-mobile-outbox-before-fix.png`, `09-mobile-outbox.png` e `10-mobile-recovered.png`. Logs finais: `tests-confirmed.log`, `lint-confirmed.log`, `typecheck-confirmed.log`, `build-confirmed.log`. Tentativas intermediárias não substituem os resultados finais.

## Preservação e integridade

Os seis arquivos físicos SQLite/WAL/SHM do D1 operacional mantiveram seus hashes; `.env` também permaneceu igual. A conferência foi por arquivos, sem abrir o banco operacional com SQLite. Resultados em `operational-before.json`, `operational-after.json` e `preservation-result.json`.

Na cópia isolada final, `quick_check=ok` e nenhuma violação de FK. Foram conservados 11 recibos confirmados e uma reserva de edição não confirmada de cenário de conflito; manter a reserva é o comportamento previsto. Contagens finais dessa **cópia sintética**, não do operacional: 4 usuários, 12 sessões, 17 categorias, 9 informações e 9 tickets. Detalhes em `final/isolated-integrity.json`.

O runtime de teste foi encerrado; portas 8899 e 9333 sem listener ao final. Nenhum serviço operacional foi encerrado como parte dessa limpeza. Sem operações reais no GLPI, acesso a D1 remoto, alteração de credenciais, commit ou push.

## Pendências e limites

- Ativação operacional da migration 0012 requer autorização específica e verificação própria. O código preparado não torna o schema operacional disponível automaticamente.
- HTTPS/autenticação GLPI e homologação com infraestrutura real continuam separados e não foram flexibilizados.
- Persistência entre abas/recargas depende do mesmo origin, perfil e armazenamento do navegador. Limpar o armazenamento ou trocar de origin perde a recuperação automática do rascunho; o recibo no servidor continua vinculado à chave. O namespace por operador não substitui a segurança do dispositivo nem criptografa dados locais.
- Não há retenção/expurgo automático do ledger ou política de expiração das intenções; defini-la é trabalho futuro, sem eliminar prematuramente a proteção de repetição.
- O caminho legado de leitura e seu mecanismo anterior de inicialização não foi reformulado; o novo caminho de mutação não executa DDL automático.
- Não houve homologação no D1 remoto, teste de infraestrutura distribuída real, credenciais reais ou GLPI real. Nenhuma próxima etapa foi iniciada.

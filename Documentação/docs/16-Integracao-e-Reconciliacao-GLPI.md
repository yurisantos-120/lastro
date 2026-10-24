# Implementação 5 — integração e reconciliação GLPI

## Validação posterior — Etapa 8

A [homologação visual e funcional](19-Homologacao-Visual-e-Funcional.md) identificou e corrigiu a interpretação de `meta.changes` do D1 quando triggers gravam o histórico: zero indica ausência de escrita, sem exigir contagem exatamente igual a um. CAS, batch, triggers e migrations foram preservados. Sincronização, atualização, solução, fechamento e reconciliação foram exercitados no Worker local com GLPI simulado. A configuração operacional HTTP permanece bloqueada pelo requisito HTTPS; não houve homologação nem operações no GLPI real.

## Entrega e limites

Integração incremental nos detalhes dos chamados, preservando abertura, dashboard, acompanhamento, pendências, RFO e passagens de turno. Não houve contato com GLPI operacional, execução de migrations operacionais, alteração de registros existentes, commit ou push. Os testes gravam somente SQLite em memória com dados sintéticos. A etapa seguinte não foi iniciada.

Foram consultados os capítulos [12](12-Chamados-Operacionais.md), [13](13-Dashboard-Operacional.md), [14](14-Passagem-de-Turno.md), [15](15-Registro-de-RFO.md), a auditoria de 22/10/2026, cliente GLPI, rotas, guards, persistência e testes. O Git já continha alterações extensas, incluindo implementações anteriores não commitadas. Uma cópia inicial permitiu comparar os arquivos sem resetar ou substituir esse trabalho. Journal é histórico de geração; não comprova aplicação no destino.

## Recursos GLPI 9.5.4 confirmados por fonte

| Recurso | Uso no Lastro |
|---|---|
| `GET initSession`, `GET killSession`, `GET getActiveProfile` | Sessão técnica efêmera e teste de conexão |
| `POST Ticket` | Abertura existente preservada |
| `GET Ticket/:id` | Consulta e confirmação do resultado remoto |
| `PUT Ticket/:id` | Atualização de título/descrição ou solicitação de status 6 |
| `POST ITILSolution` | Solução com `itemtype=Ticket`, `items_id` e conteúdo técnico |
| `GET Ticket/:id/ITILSolution` | Reconciliação de solução por marcador da operação |

A [documentação REST na tag 9.5.4](https://github.com/glpi-project/glpi/blob/9.5.4/apirest.md) define leitura, criação, atualização e paginação. O sucesso do PUT é validado no formato de coleção com ID e booleano; HTTP 200 sozinho não confirma atualização. Não são usados endpoints de versões 10/11 ou API v2.

O [código de ITILSolution 9.5.4](https://github.com/glpi-project/glpi/blob/9.5.4/inc/itilsolution.class.php) verifica a permissão de solucionar e pode levar o ticket a solucionado ou fechado, conforme a configuração da entidade. Por isso o Lastro lê novamente o chamado. A [classe CommonITILObject](https://github.com/glpi-project/glpi/blob/9.5.4/inc/commonitilobject.class.php) define 5 como solucionado e 6 como fechado, com restrições de perfil e transição. A [implementação REST](https://github.com/glpi-project/glpi/blob/9.5.4/inc/api/api.class.php) filtra os subitens pelo chamado pai e valida direitos de leitura/atualização.

Isso confirma compatibilidade de código com **9.5.4**, não a versão efetivamente instalada no servidor. O teste de conexão deixou de afirmar uma versão hardcoded; mostra que ela não foi verificada. Versão instalada, plugins, templates, campos obrigatórios, permissões e políticas da entidade dependem de homologação autorizada.

## Modelo persistido e migration

Migration aditiva **`drizzle/0011_glpi_reconciliation.sql`**, snapshot 0011 e entrada 11 no journal. Geração feita em cópia descartável. Migrations e snapshots 0000–0010 e entradas anteriores do journal permanecem intactos.

- `glpi_operations`: intenção com UUID, chamado local, ID GLPI, ação, payload validado, autor inicial, último operador, horários do servidor, estado, código seguro, ID da solução, observação e revisão.
- `glpi_operation_events`: fotografias cronológicas de cada reserva, tentativa de confirmação e reconciliação. Triggers gravam os eventos na mesma transação e impedem alterações/exclusões do histórico. A identidade da intenção não pode ser reescrita. Os IDs dos usuários têm FK; a interface resolve o nome atual do cadastro.
- `tickets.creation_fingerprint`: SHA-256 da intenção original de novas aberturas, incluindo autor. Campo anulável, sem backfill e protegido contra alteração. Evita que a sincronização de título/descrição invalide a repetição da chave original. O resumo público não expõe esse hash.

Índice parcial permite somente uma operação `pending` ou `uncertain` por chamado. Chave repetida precisa corresponder ao chamado, ator e payload completos. Atualização por revisão e batch transacional protegem concorrência e rollback. Não há transação distribuída com o GLPI: após um efeito externo e falha local, a reserva durável permanece para consulta; nunca é reenviada automaticamente.

Sem 0011, o painel de integração informa indisponibilidade e não inicia novas operações remotas de sincronização/escrita. A abertura existente continua compatível com o schema anterior; detecta a coluna de fingerprint antes de usá-la. Para chamados anteriores sem hash, a comparação usa autor e conteúdo local disponível, de forma conservadora: um replay após edição pode ser recusado como conflito, nunca convertido em nova criação.

**A migration não foi aplicada ao banco operacional.** Antes de disponibilizar, conferir as migrations realmente aplicadas e preparar o destino em procedimento separado e autorizado. Não pular etapas por suposição nem tratar o journal como confirmação de execução.

## Regras do fluxo

| Conceito | Regra |
|---|---|
| Situação operacional | Continua em `ticket_operations`; nenhuma resposta GLPI altera essa situação automaticamente |
| Resultado da abertura | Continua em `tickets.result_state`: pending, created, failed, uncertain |
| Status oficial | `tickets.status`, proveniente exclusivamente de resposta válida GLPI; última consulta em `last_synced_at` |
| Estado da integração | pending, confirmed, failed, uncertain; separado dos três conceitos anteriores |

**Abertura:** persiste a chave antes do POST, conserva timeout e erros existentes e bloqueia repetições da mesma intenção. Nenhum retry automático foi adicionado. Houve endurecimento de campos permitidos, comparação de intenção/autoria e limite de corpo de 64 KiB. Cada nova tentativa explícita conserva seu próprio registro local. Os testes anteriores de abertura continuam passando.

**Sincronização:** consulta explícita do operador, com trilha. Valida ID remoto e status 1–6, atualiza somente o cache GLPI e registra observação do status. Não carrega históricos completos para indicadores. Divergência entre Fechado local e status GLPI diferente de 6, ou GLPI fechado e situação operacional diferente de Fechado, aparece para revisão manual. Normalizado e solucionado continuam conceitos distintos, não se presume divergência por terem rótulos diferentes.

**Atualização:** substitui título e descrição, com confirmação explícita. Antes do envio, compara a leitura remota com o cache local; se houver edição externa, sincronizar e revisar primeiro. Depois do PUT, exige leitura com os valores solicitados. Uma mudança externa entre verificação e PUT ainda é possível: a API dessa versão não fornece aqui um compare-and-swap distribuído. Nenhum campo operacional/RFO é enviado implicitamente.

**Solução:** conteúdo técnico obrigatório, independente de RFO concluída. O texto é escapado para HTML e recebe marcador `[LASTRO:UUID]`. ID de solução válido e leitura posterior do ticket com status 5 ou 6 confirmam o fluxo. Não existe sequência automática de solução seguida de fechamento. A entidade GLPI pode fechar imediatamente ao solucionar; isso é explicado antes da confirmação.

**Fechamento:** ação separada, confirmada pelo operador. Leitura prévia exige status 5; envia somente status 6. O GLPI continua decidindo a permissão efetiva e a validade da transição. Somente nova leitura com status 6 indica fechamento oficial. Não há bypass de perfil, solicitação de aprovação com identidade forjada ou suposição de que todo operador Lastro tenha direitos individuais no GLPI: as operações remotas usam a conta técnica configurada, e a autoria local fica preservada.

**Incerteza:** rede, timeout, 5xx, retorno inválido, confirmação divergente ou falha de persistência depois do envio conservam bloqueio e histórico. Falha de autorização na consulta posterior a uma escrita já aceita também é incerta. Recusas conhecidas antes de efeitos confirmados ficam como falha. Operações terminais são imutáveis; nova intenção exige outra chave e ação explícita.

**Reconciliação:** executa somente leituras, inclusive quando repetida. Atualização compara os valores desejados; fechamento exige status 6; solução exige marcador único no chamado e status 5/6. Consulta paginada examina até 1.000 soluções; ausência de marcador, ambiguidade, limite ou leitura inconclusiva conserva incerteza, sem presumir que o POST falhou. Não há liberação automática por tempo. Se não houver evidência suficiente, a revisão no GLPI permanece necessária; não há botão para apagar ou descartar uma tentativa incerta.

**Abertura incerta:** admin informa ID candidato e justificativa/evidência de revisão da origem. Exige título/conteúdo exatamente iguais e ID não vinculado a outro chamado local. ID previamente conhecido não pode ser trocado. Para pending ainda em execução, há espera mínima de dois minutos antes de aceitar revisão. Texto igual sozinho não prova identidade: a confirmação manual é obrigatória. Não há busca/associação automática por título. Diferenças de formatação remota impedem associação conservadora e exigem investigação externa; não são normalizadas silenciosamente.

RFO pendente não bloqueia normalização nem esse fluxo GLPI. Fechado operacional continua exigindo status 6 já consultado e uma movimentação local explícita. Passagens anteriores, pendências e revisões de RFO permanecem intactas após sincronização ou encerramento remoto.

## API, segurança e interface

`GET /api/tickets/:id/integration?page=1` usa **ID local**, retorna cache, até 20 operações e 50 eventos por página, operação ativa e divergência. `POST` recebe `{operationKey, action, expectedRevision}` e campos permitidos da ação: update usa title/content; solution usa content; associate usa candidateId/attestation. Para reconciliação, enviar somente `{reconcileKey}`. O retorno de uma requisição processada contém a operação; o resultado é determinado por `operation.state`, não pelo HTTP 200. A listagem é local e não chama o GLPI.

GET/POST exigem operator/admin; associação exige admin também na persistência. Ator vem da sessão autenticada. Corpo JSON limitado, Origin validado quando presente, campos desconhecidos e autoria/horários forjados rejeitados. Dados e payloads são parametrizados; respostas e logs não incluem texto de erros upstream ou credenciais. Campos novos rejeitam padrões reconhecidos de segredo com a heurística compartilhada; isso não garante detecção de todo segredo arbitrário em texto livre.

O endpoint legado `GET /api/glpi/tickets/:id`, cujo ID é **remoto**, conserva a consulta explícita e passa pelo mesmo diário/bloqueio. Em indisponibilidade da migration, falha com mensagem segura; o cache continua disponível na rota local de detalhes. A listagem, dashboard e abertura não passaram a sincronizar automaticamente.

Painel usa componentes, ícones Lucide e tokens de tema existentes. Oferece histórico paginado, estado de carregamento/erro/vazio, divergência, dados enviados nas tentativas, confirmação explícita e reconciliação por consulta. Não envia POST por efeito/renderização e não reenvia após perda de resposta. Após navegação, o histórico recupera a reserva persistida. Não há modal obrigatório, cobrança, prazo ou avaliação individual.

### Correções relacionadas à auditoria

- **SEC01, transporte Lastro → GLPI:** HTTPS obrigatório nos dois leitores de configuração e nos dois construtores, com URL normalizada, cópia da configuração e bloqueio de redirects. HTTP é rejeitado também em localhost/rede privada. Credenciais humanas Basic e tokens técnicos deixam de alcançar um destino HTTP por essas entradas. Compatibilidade HTTPS foi verificada com transporte simulado. TLS navegador → Lastro e configuração do proxy ainda precisam ser verificados no ambiente de homologação.
- **SEC05:** abertura usa o leitor comum de stream limitado a 64 KiB antes da validação semântica.
- **Confiabilidade GLPI:** comparação da intenção de abertura, reconciliação explícita, estados separados, trilha transacional e remoção da afirmação de versão instalada hardcoded.

A correção SEC01 utilizou a skill `codex-security:fix-finding`, com investigação e revisão independentes somente de leitura. Resultado do trecho corrigido: **fixed**, validado com URLs HTTP alternativas, construção direta, mutação posterior de configuração e redirect de downgrade, além dos controles HTTPS legítimos. Não foi uma nova auditoria geral nem verificação de TLS de produção. SEC02, decisões de leitura SEC03 e ciclo administrativo geral SEC06 não foram ampliados neste escopo.

## Arquivos desta etapa

Criados:

- `services/glpi/glpi-url.ts`, `integration.ts`, `integration-workflow.ts`, `integration-handlers.ts`.
- `db/glpi-integration.ts`.
- `app/api/tickets/[id]/integration/route.ts`.
- `components/glpi-integration-panel.tsx`.
- `drizzle/0011_glpi_reconciliation.sql`, `drizzle/meta/0011_snapshot.json`.
- `tests/glpi-integration.test.ts`, `tests/glpi-integration-ui.test.ts` e este capítulo.

Alterados pontualmente:

- `services/glpi/glpi-client.ts`, `glpi-config.ts`, `glpi-user-auth.ts`, `glpi-ticket-service.ts`.
- `services/tickets/ticket-workflow.ts`, `types.ts`; `db/ticket-storage.ts`, `db/schema.ts`.
- `app/api/glpi/tickets/route.ts`, `app/api/glpi/tickets/[id]/route.ts`, `app/api/glpi/test/route.ts`.
- `components/tickets-section.tsx`, `tests/auth.test.ts` (fixtures HTTPS), `package.json` e `drizzle/meta/_journal.json`.
- Índice da documentação e capítulos 09–15 com configuração/links atualizados. Não confundir esta lista com o diff total do Git, que inclui trabalho anterior.

## Verificação

Executada em cópia temporária sem `.env`, `.dev.vars`, `.wrangler` ou banco operacional, com dependências locais existentes e GLPI simulado. Os binários Node foram chamados diretamente porque pnpm não está no PATH desta sessão.

| Verificação | Resultado |
|---|---|
| `node --experimental-strip-types --test tests/*.test.ts tests/*.test.mjs` | **186 testes passaram**, zero falhas |
| `node node_modules/oxlint/bin/oxlint` | Aprovado |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | Aprovado |
| `node node_modules/vinext/dist/cli.js build` | Aprovado; rota nova incluída |

Cobertura: criação/replay e hash após sincronização; status e divergências; atualização confirmada e edição externa; solução, fechamento separado e auto-close remoto; concorrência com mesma/diferentes chaves; vínculo administrativo; credenciais/autoria forjadas; controle de acesso e corpo excessivo; paginação sem duplicidade; FK e imutabilidade; rede/timeout/5xx/JSON inválido/retorno falso; autorização perdida após escrita; rollback de histórico e cache; recuperação por leitura; preservação de pendência, RFO e passagem; UI carregando/erro/vazio, incerteza e escape de HTML. Os testes antigos continuam na suíte.

O build mantém o aviso conhecido de classificação estática de `/` do Vinext. A validação de interface é de renderização React e semântica; não substitui homologação interativa de teclado/leitor de tela, celular e ambos os temas.

## Pendências para homologação real

1. Confirmar versão instalada, HTTPS válido nos dois trechos, proxy e configuração de segredos; a aplicação não possui exceção de transporte HTTP para GLPI.
2. Conferir migrations realmente aplicadas e preparar schema com autorização específica, backup e procedimento operacional.
3. Em instância de homologação autorizada, validar perfil/entidade da conta técnica, templates e campos obrigatórios, formato de descrição/HTML, leitura paginada de soluções, transições e configuração de auto-close. Nenhum chamado real foi usado nesta implementação.
4. Validar visualmente o fluxo, a distinção dos três estados e a revisão administrativa de abertura incerta. Para incerteza sem evidência suficiente, preservar a reserva e investigar no GLPI antes de qualquer decisão externa; não inventar confirmação nem liberar retry automático.
5. Avaliar volume/latência e os limites documentados; mudanças feitas diretamente no GLPI entre preflight e escrita não são serializadas pelo D1.

Não houve avanço automático para outra implementação.

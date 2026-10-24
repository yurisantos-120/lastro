# Implementação 1 — acompanhamento operacional de chamados

## Entrega e escopo

Camada operacional local, complementar ao chamado GLPI. O fluxo existente de abertura, sua chave idempotente e o tratamento de resultado incerto não foram modificados. Após confirmação da abertura, o operador pode acessar **Preencher acompanhamento operacional** ou abrir os detalhes de um chamado existente.

O registro GLPI continua em `tickets`. Duas tabelas novas guardam o acompanhamento, sem backfill e sem atualizar os chamados existentes:

- `ticket_operations`: resumo atual, tipo de ocorrência, descrição livre do trecho/rota, vínculo opcional com rota cadastrada, empresa/gerência, situação, justificativa de pendência, observações, orientações, datas, último operador e revisão.
- `ticket_operation_events`: movimentos cronológicos com chamado, operador autenticado, nome preservado no momento da ação, horário do servidor, tipo, estado anterior/novo, descrição opcional e fotografia completa dos dados da movimentação.

Não há associação automática de textos a cadastros. O vínculo opcional de rota usa `information.id`, validado como `kind='general'`. Empresa/gerência fica em texto, porque não existe entidade adequada de organização responsável no modelo atual. Nenhuma empresa fictícia foi criada.

## Regras operacionais

- Situações locais: **Em tratamento**, **Pendente**, **Normalizado**, **Fechado**. São independentes de `tickets.status` (oficial GLPI) e `tickets.result_state` (resultado de abertura).
- Para iniciar acompanhamento, a abertura precisa estar confirmada: `result_state='created'` e ID GLPI positivo. Tentativas pending/failed/uncertain continuam preservadas, sem confirmação artificial.
- Pendente exige somente justificativa. Tipo, trecho, empresa, observações, orientações e descrição da movimentação não são obrigatórios para registrar a pendência.
- Fechado exige status oficial GLPI `6` com sincronização já registrada. O servidor verifica isso novamente no momento da escrita. Esta implementação **não envia fechamento nem atualização ao GLPI**. Caso ainda não haja confirmação, usar a consulta de status já existente nos detalhes.
- Abertura registrada é o horário original de criação local de `tickets`, identificado assim na interface. Não se inventa data de abertura remota; `glpi_created_at` continua separado.
- Atualização, normalização e registro do encerramento usam o relógio do servidor em ISO UTC; a interface apresenta horário local do navegador. A data de encerramento operacional é a hora do registro local após confirmação, não uma data de fechamento remoto inventada.
- Entrar em Normalizado registra `normalized_at`; editar sem sair desse estado preserva a data. Fechar preserva a normalização anterior, se houver. Retomar Em tratamento/Pendente limpa os marcos atuais de normalização/encerramento; as fotografias dos eventos anteriores continuam preservadas.
- O primeiro evento é `initialized`; mudança de situação gera `state_changed`; ajuste sem mudança gera `updated`. Não se fabricou histórico para chamados antigos.
- Resumo e evento são gravados em um batch transacional. Falha no evento reverte o resumo. Revisão evita sobrescrever alterações concorrentes.
- A chave UUID de cada movimentação compara chamado, operador e payload normalizado. Repetir a mesma intenção recupera o resultado sem inserir outro evento; reutilizar a chave para outra intenção retorna 409.
- O formulário mantém a mesma chave/payload após erro de rede ou 5xx. Os campos ficam preservados e bloqueados até consultar/repetir ou recarregar explicitamente. Após conflito, recarregar substitui o rascunho mediante confirmação.
- Eventos são append-only, com triggers impedindo UPDATE/DELETE. Correções são novas movimentações; não há endpoint para apagar histórico.
- Não há cobrança, metas, penalidades, medição de produtividade, lembrete obrigatório nem prazo automático de atualização.

## API e autorização

`GET /api/tickets/:id/operations` retorna `{ success, operation, events }`; `operation` é nulo e o histórico vazio se o chamado existe sem acompanhamento. `:id` é **ID local de tickets**, distinto do ID remoto GLPI.

`PUT /api/tickets/:id/operations` recebe:

```json
{
  "operationKey": "UUID v4 gerado pelo cliente",
  "expectedRevision": 0,
  "state": "pending",
  "pendingReason": "Justificativa da pendência"
}
```

Campos opcionais: `occurrenceType`, `routeDescription`, `routeId` (inteiro ou nulo), `responsibleOrganization`, `notes`, `guidance`, `description`. Payload representa os dados editáveis completos; campos textuais omitidos tornam-se vazios. A interface carrega os valores existentes antes de salvar. `expectedRevision=0` significa primeiro registro; nos seguintes, enviar a revisão lida. Ator e horários são determinados pelo servidor; campos forjados são rejeitados.

GET exige viewer; PUT exige operator ou admin, verificados pelo guard de sessão existente. A persistência também exige usuário local ativo com papel operacional. Na interface atual, o painel está nos detalhes, cujo acesso já era de operator/admin; não se ampliou a visibilidade desses detalhes para viewer nesta etapa. PUT exige JSON, valida Origin quando enviado e limita a leitura do corpo a 64 KiB. Erros de armazenamento retornam mensagem genérica 503 sem SQL/detalhes internos.

## Migration e ativação

Nova migration **`drizzle/0008_ticket_operations.sql`**, acompanhada de `0008_snapshot.json` e entrada no journal. Gerada em cópia temporária com Drizzle Kit; acrescenta tabelas, índices, FKs, checks e dois triggers de imutabilidade. Não altera migrations anteriores, registros de `tickets` ou registros de usuários. Não cria dados iniciais.

**Não foi aplicada no banco operacional.** O journal/arquivos não significam que o banco esteja preparado. A auditoria anterior encontrou banco local até 0006, com 0007 pendente; isso precisa ser reconferido no destino antes de qualquer aplicação futura. Não pular ou reaplicar migrations por suposição. Até preparar o banco com autorização, o novo painel informa indisponibilidade; a abertura GLPI continua usando seu fluxo e esquema existentes.

## Arquivos desta implementação

Alterados de forma pontual:

- `db/schema.ts`: duas tabelas operacionais.
- `drizzle/meta/_journal.json`: entrada 0008, preservando as anteriores.
- `components/tickets-section.tsx`: acesso ao painel nos detalhes e após abertura confirmada.
- `app/page.tsx`: repassa apenas opções de rotas já carregadas.
- `package.json`: inclui o novo arquivo na suíte de testes.

Criados:

- `drizzle/0008_ticket_operations.sql` e `drizzle/meta/0008_snapshot.json`.
- `services/tickets/operations.ts`: contratos, estados e validação.
- `db/ticket-operations.ts`: leitura consistente, concorrência, idempotência e persistência transacional.
- `services/tickets/operation-handlers.ts`: adaptadores HTTP testáveis e autorização.
- `app/api/tickets/[id]/operations/route.ts`: ligação ao runtime D1/autenticação.
- `components/ticket-operations-panel.tsx`: formulário, datas, mensagens e histórico.
- `tests/ticket-operations.test.ts`: 12 cenários novos.
- Este documento.

## Verificação executada

Cópia descartável sem `.env`, `.dev.vars`, banco operacional ou publicação; dependências locais existentes. Testes usam SQLite `:memory:` com migrations e dados sintéticos exclusivos do processo de teste. Não houve chamadas reais ao GLPI.

| Verificação | Resultado |
|---|---|
| Suíte completa de dez arquivos Node | **104 testes passaram, zero falhas** |
| Oxlint | Aprovado, exit 0 |
| TypeScript `--noEmit --incremental false` | Aprovado, exit 0 |
| Vinext build | Aprovado, exit 0; nova rota incluída |

Cobertura nova: compatibilidade da migration e ausência de backfill; criação/leitura; ator e timestamps; justificativa obrigatória sem exigir observações; transições e datas; cronologia e imutabilidade; FK de chamado/usuário/rota; vínculos inválidos; abertura/fechamento não confirmados; autorização, Origin, JSON inválido/corpo excessivo; payload forjado; revisão concorrente; duplicação simultânea; rollback e recuperação após perda de confirmação.

O build mantém o aviso de classificação estática de `/` pelo Vinext e emitiu aviso informativo de tempo gasto em plugins; não houve erro. O ambiente não possui pnpm no PATH da sessão, então os binários Node instalados foram invocados diretamente com os mesmos arquivos/argumentos dos scripts. Não foi feita homologação visual interativa nem homologação em GLPI real.

## Pendências para dashboard e passagem de turno

A consulta agregada, os filtros, a paginação e a apresentação de pendências foram entregues na [Implementação 2 — Dashboard operacional](13-Dashboard-Operacional.md). A [Implementação 3 — Passagem de turno híbrida](14-Passagem-de-Turno.md) acrescenta entrega, recebimento e resumo preservado, sem transferir automaticamente a responsabilidade dos chamados ou gerar escala individual.

Na Implementação 2, abrir detalhes passou a consultar somente o registro local, preservando o botão explícito de consulta ao GLPI. Abertura de chamados e gravação operacional continuam nos contratos descritos acima. A nova listagem apresenta horário de sincronização e usa o fuso configurado para o NOC; os detalhes legados conservam a formatação anterior do navegador.

Antes de disponibilizar: preparar schema no destino autorizado, validar layout/teclado em ambiente isolado e decidir regras futuras de reabertura/conciliação com mudanças posteriores do GLPI. O estado operacional não é sincronizado automaticamente quando o status remoto muda. Nenhuma próxima implementação foi iniciada, e não houve commit ou push.

## RFO e política de fechamento

A [Implementação 4 — Registro de RFO](15-Registro-de-RFO.md) acrescenta investigação, conclusão e histórico técnico independentes. RFO ausente ou pendente **não bloqueia** normalização nem fechamento operacional. Continua valendo a exigência anterior de status oficial GLPI 6 já consultado para registrar Fechado; a RFO não envia comandos ao GLPI nem substitui essa confirmação. A data de normalização disponível na RFO vem do acompanhamento operacional.

## Integração GLPI — Implementação 5

A [Implementação 5](16-Integracao-e-Reconciliacao-GLPI.md) acrescenta sincronização auditada, solução, fechamento e reconciliação explícitos. Estados operacionais, pendências, RFOs e resumos de passagem permanecem independentes e preservados. Nenhum status remoto altera automaticamente o acompanhamento ou resumos anteriores; RFO pendente não bloqueia normalização. HTTPS é obrigatório para GLPI, e a nova migration não foi aplicada ao banco operacional.


# Implementação 4 — Registro de RFO

## Escopo e funcionamento

Cada chamado local com abertura GLPI confirmada pode ter uma RFO — Reason for Outage — com situação da investigação, causa, descrição técnica, solução aplicada, normalização, empresa/equipe e observações. A estrutura não presume rompimento de fibra: aceita atenuação, falhas de equipamento e outros incidentes em campos técnicos livres.

A RFO aparece nos detalhes do chamado, abaixo do acompanhamento operacional. O conteúdo atual e cada versão anterior são consultáveis. Os cartões do dashboard indicam **RFO não iniciada**, **RFO pendente** ou **RFO concluída**, separadamente da situação operacional, do resultado da abertura e do status GLPI. Nenhuma escala, cobrança, prazo ou métrica individual foi acrescentada.

Foram revisados os capítulos 12/13/14, o plano e os achados da auditoria de 22/10/2026, o Git e o journal de migrations. As alterações locais anteriores foram preservadas. Não foi iniciada outra implementação.

## Situações e validação

São dois campos independentes:

| Campo | Valores / regra |
|---|---|
| Investigação | `investigating` (Em análise) ou `confirmed` (Causa confirmada) |
| Conclusão documental | `pending` (Pendente) ou `completed` (Concluída) |

É permitido iniciar a investigação antes da normalização, sem causa definitiva e sem solução. A causa pode registrar hipótese enquanto a investigação estiver Em análise; o sistema não a promove automaticamente a causa confirmada.

Marcar Causa confirmada exige causa preenchida. Concluir exige investigação confirmada, causa, descrição técnica, solução aplicada e data de normalização disponível. Empresa/equipe e observações são opcionais. Nenhuma categoria técnica fixa ou lista fictícia foi criada.

Limites de texto: causa 4.000 caracteres; descrição técnica, solução e observações 10.000 cada; empresa/equipe 240. Strings são aparadas. Objetos, tipos/situações desconhecidos, controles nulos, revisão/chave inválidas e campos não permitidos são rejeitados. A API limita o corpo completo a 64 KiB, inclusive conteúdo enviado em chunks; os limites de caracteres não substituem o limite de bytes.

## Horários e normalização

Autoria, criação, atualização e conclusão documental usam identidade e relógio do servidor. O navegador não pode fornecer `updatedBy`, `createdAt`, `updatedAt`, `completedAt` ou uma `normalizedAt` arbitrária.

A normalização é obtida de `ticket_operations.normalized_at`, registrada pelo fluxo operacional existente. Se a RFO já preservava uma normalização válida, essa data pode ser mantida em revisões posteriores quando o acompanhamento atual não a fornece. Valores inválidos ou posteriores ao relógio do servidor não são usados para concluir a RFO. Horários são armazenados como ISO UTC e exibidos no padrão local do navegador, acompanhando o comportamento atual dos detalhes.

Para completar uma RFO após restabelecimento: registrar a normalização no acompanhamento operacional e salvar a RFO com causa confirmada, descrição e solução. Se o formulário ainda mostrar a data antiga, recarregar os dados registrados; o servidor sempre verifica a fonte novamente ao salvar.

Em chamados legados encerrados sem data de normalização registrada, a RFO pode permanecer Pendente com causa confirmada. Esta etapa não inventa datas de restabelecimento, não faz backfill e não oferece entrada de horário retroativo. Uma correção histórica autorizada precisa de procedimento próprio.

Uma RFO concluída pode ser revisada ou retornar a Pendente. Edição que mantém a conclusão preserva o horário da conclusão documental; retornar a Pendente limpa esse marco da versão atual, sem apagar a versão concluída anterior. Concluir novamente registra novo horário. Mudanças no chamado não reescrevem automaticamente a RFO: eventual reabertura deve ser revisada pelo operador conforme o contexto da ocorrência.

## Política explícita de normalização e fechamento

**RFO ausente ou pendente não bloqueia normalização nem fechamento operacional.** O usuário pode documentar a solução após o restabelecimento, sem depender de uma RFO concluída para registrar o serviço normalizado.

O fechamento continua sujeito à regra anterior: abertura confirmada, identificador GLPI válido e status oficial GLPI 6 com sincronização já registrada. A RFO não acrescenta requisito a essa regra, não fecha tickets remotos e não altera automaticamente `tickets.status`, `tickets.result_state` ou `ticket_operations.state`. Essa independência foi coberta por teste usando os repositórios operacionais existentes.

## Histórico e concorrência

- `ticket_rfos` guarda uma versão atual por chamado local, com ID GLPI obtido do registro existente no servidor.
- `ticket_rfo_revisions` guarda fotografia completa de cada revisão, incluindo chamado local, ID GLPI conhecido, dados técnicos, autor e horários.
- Históricos são append-only, com triggers contra UPDATE/DELETE. A referência ao operador usa FK; o nome de exibição é preservado na revisão.
- Revisões são numeradas e únicas por chamado. Leitura paginada em blocos de 20, da revisão mais recente para a mais antiga, sem perder versões com horários iguais.
- Resumo atual e nova revisão são gravados no mesmo batch transacional. Falha no registro histórico reverte também a criação/edição atual.
- A revisão de base evita sobrescrever edição concorrente. O servidor verifica novamente abertura/ID GLPI, revisão da operação de normalização e usuário ativo no momento da escrita.
- Chave UUID identifica a intenção de gravação. Repetição da mesma intenção/chamado/operador recupera o resultado; mudança de conteúdo, chamado ou operador com a mesma chave recebe 409.
- A UI mantém a chave e os dados após erro de rede ou 5xx. Nova tentativa consulta/grava a mesma revisão de forma idempotente. Um 409 exige revisão/recarregamento explícito, sem substituir silenciosamente o rascunho.
- Paginar o histórico preserva o rascunho e sua revisão de base. Não se usa a revisão recém-consultada como autorização para sobrescrever um formulário antigo.

Não são criadas RFOs automaticamente para chamados existentes. A ausência de registro é “não iniciada”, sem inferir que uma RFO seja obrigatória para toda ocorrência.

## Segurança

GET exige sessão ativa viewer/operator/admin, como a leitura operacional existente. PUT exige operator/admin; a persistência também verifica perfil e atividade no banco. Na UI atual, o acesso aos detalhes permanece o de operator/admin. Identidade e vínculo GLPI não são aceitos do navegador.

PUT exige JSON, valida Origin quando enviado, limita tamanho, rejeita campos não permitidos e usa SQL parametrizado. Respostas têm `Cache-Control: no-store`. Falhas de armazenamento retornam 503 genérico, sem SQL, valores internos ou logs de payload.

Os campos de texto são rejeitados quando contêm marcadores reconhecíveis de credencial, Basic/Bearer, URL com usuário/senha, chave privada ou JWT. O detector conservador foi extraído para `lib/sensitive-text.ts` e compartilhado com a passagem de turno, sem mudar seu comportamento anterior. Ele pode rejeitar texto que apenas mencione termos sensíveis; não garante identificar todo segredo arbitrário sem marcação. A política continua sendo não inserir credenciais nos campos técnicos.

Os dados apresentados são escapados pelo React; não há HTML remoto bruto. Não foram abertos `.env` ou credenciais reais, nem realizadas chamadas reais ao GLPI.

## API e dashboard

`GET /api/tickets/:id/rfo?page=1` retorna `{ success, rfo, normalizationAvailable, revisions, page, total }`. O identificador é local. Chamado existente sem RFO retorna `rfo: null` e histórico vazio; chamado inexistente recebe 404. Página inválida/duplicada e parâmetros desconhecidos recebem 400.

`PUT /api/tickets/:id/rfo` recebe:

```json
{
  "operationKey": "UUID v4 gerado pelo cliente",
  "expectedRevision": 0,
  "investigation": "investigating",
  "completion": "pending",
  "cause": "",
  "technicalDescription": "Investigação de atenuação em andamento",
  "solution": "",
  "responsibleTeam": "Equipe de transmissão",
  "notes": ""
}
```

`expectedRevision=0` inicia a RFO; edições enviam a revisão lida. Campos textuais representam a versão editável completa, não um patch parcial. Ator, horários e ID GLPI são determinados pelo servidor.

O dashboard faz LEFT JOIN apenas com a versão atual, em relação 1:1, sem ler o histórico de RFO nem alterar as contagens existentes. O campo adicional `items[].rfoStatus` indica Pendente/Concluída ou ausência. Sem `ticket_rfos`, retorna `rfoAvailable=false`, preserva a consulta anterior e informa indisponibilidade da RFO. Não mostra uma falha de preparação como se todas as RFOs estivessem vazias.

## Migration e ativação

Nova migration aditiva **`0010_ticket_rfo.sql`**, com `0010_snapshot.json` e entrada adicional no journal. Cria tabelas atual/histórica, índices, FKs, checks de situação/conclusão e triggers de imutabilidade. Não insere dados nem altera tickets ou migrations anteriores.

**Não foi aplicada no banco operacional.** A preparação real do destino exige conferência de histórico/schema e autorização específica. O journal local não comprova aplicação. Até preparar o schema, o painel de RFO apresenta erro claro e opção de nova consulta; o dashboard mantém suas consultas anteriores quando as tabelas operacionais existentes estiverem disponíveis.

## Arquivos desta etapa

Criados:

- `services/rfo/rfo.ts`: contratos, validação e separação de campos editáveis.
- `services/rfo/handlers.ts`: guards e contratos HTTP testáveis.
- `db/rfo.ts`: versão atual, histórico paginado, transação, revisão e idempotência.
- `app/api/tickets/[id]/rfo/route.ts`.
- `components/rfo-panel.tsx`.
- `lib/sensitive-text.ts`.
- `drizzle/0010_ticket_rfo.sql`, `drizzle/meta/0010_snapshot.json`.
- `tests/rfo.test.ts`, `tests/rfo-ui.test.ts` e este capítulo.

Alterados pontualmente:

- `db/schema.ts` e `drizzle/meta/_journal.json`.
- `db/ticket-dashboard.ts`, `services/tickets/dashboard.ts` e `components/ticket-dashboard.tsx`: indicação de RFO e compatibilidade sem a nova tabela.
- `components/tickets-section.tsx`: painel nos detalhes.
- `services/handoffs/handoffs.ts`: reutilização do detector de texto sensível compartilhado.
- `package.json`: inclusão dos testes.
- Capítulos 12/13/14: ligação com esta etapa e política de fechamento.

## Auditoria relacionada

Resolvidos no caminho da RFO: ausência de autoria/histórico técnico por edição, sobrescrita concorrente, confirmação ambígua após falha de resposta, erros fora do formulário, validação desigual de texto sensível e indicação falsa de vazio quando o schema não está preparado. O formulário tem loading, alertas locais, feedback de gravação, rascunho preservado e recarregamento explícito.

Não houve refatoração geral, alteração dos formulários de inventário, mudança na autorização base, fechamento remoto ou reescrita da passagem de turno. Pendências gerais de TLS/proxy e administração permanecem as da auditoria; os controles desta etapa não substituem essa homologação.

## Testes e resultados

Cópia temporária sem `.env`, estado `.wrangler`, banco operacional ou publicação. SQLite `:memory:` e dados sintéticos apenas nos processos de teste. Suíte completa de 16 arquivos: **155 testes passaram, zero falhas**. Lint, TypeScript sem emissão e build Vinext aprovados. Mantido o aviso já conhecido de classificação estática da rota `/`.

Os 18 cenários novos cobrem investigação sem causa/normalização, critérios de conclusão, autoria/horário no servidor, histórico imutável, normalização e fechamento independentes, idempotência, concorrência, rollback de criação/edição, recuperação após resposta perdida, mudança concorrente de normalização, 25 revisões em páginas sem duplicidade, FKs/perfis/inatividade, credenciais/horários forjados, indicadores/fallback do dashboard, erros de API e renderização escapada/loading.

A UI foi verificada por renderização HTML e semântica, sem homologação visual interativa em navegador ou leitor de tela. Nenhum chamado real foi modificado, nenhuma migration operacional executada e não houve commit ou push.

## Pendências

Preparação autorizada do banco e homologação visual/interativa em ambos os temas e dispositivos. Definir procedimento autorizado para corrigir normalização histórica ausente, se necessário; não atribuir automaticamente a data atual a ocorrências antigas. Eventuais filtros específicos por RFO, anexos e vínculo da RFO com uma futura exportação exigem escopo próprio.

Passagens anteriores continuam imutáveis e não recebem conteúdo de RFO retroativamente. Não foi iniciada automaticamente uma próxima implementação.

## Integração GLPI — Implementação 5

A [Implementação 5](16-Integracao-e-Reconciliacao-GLPI.md) acrescenta sincronização auditada, solução, fechamento e reconciliação explícitos. Estados operacionais, pendências, RFOs e resumos de passagem permanecem independentes e preservados. Nenhum status remoto altera automaticamente o acompanhamento ou resumos anteriores; RFO pendente não bloqueia normalização. HTTPS é obrigatório para GLPI, e a nova migration não foi aplicada ao banco operacional.


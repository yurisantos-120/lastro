# Implementação 3 — Passagem de turno híbrida

## Entrega

O dashboard mantém sua abertura normal. A antiga área reservada agora consulta passagens e mostra um aviso discreto quando há entrega sem recebimento. O técnico pode expandir o painel para consultar o resumo, preparar sua entrega ou consultar o histórico. Não há modal, redirecionamento obrigatório, bloqueio de navegação ou exigência de recebimento para trabalhar.

Cada entrega guarda uma fotografia dos chamados, observações gerais e orientações opcionais. O recebimento é um registro separado, feito por outro operador. Nenhuma dessas ações altera chamados, estados operacionais, autoria dos chamados ou GLPI. RFO não foi implementado.

## Configuração e períodos

Configuração do Worker, sem editar dados ou gerar escala individual:

| Binding opcional | Padrão | Regra |
|---|---|---|
| `NOC_TIME_ZONE` | `America/Sao_Paulo` | Fuso IANA já utilizado pelo dashboard |
| `NOC_DAY_SHIFT_START` | `07:00` | Horário civil `HH:mm` |
| `NOC_NIGHT_SHIFT_START` | `19:00` | Horário complementar, 12 horas após o diurno |

Escala operacional identificada como **12×36**. Os dois horários devem formar turnos complementares de 12 horas civis. Isso não fornece informação suficiente para atribuir datas e folgas a cada pessoa: nenhuma escala individual, alocação automática ou fiscalização foi criada.

O turno é identificado pela data civil de início e pelo tipo Diurno/Noturno, no fuso do NOC. No padrão, o noturno de 21/10 começa às 19h de 21/10 e termina às 07h de 22/10. Datas UTC são calculadas sem fixar offset -03; em mudanças de horário de verão, a duração física pode ser 11/13 horas, preservando os limites civis configurados. Horários locais inexistentes são rejeitados, sem deslocamento silencioso.

A prévia inicial sugere o **último turno concluído**. O técnico pode selecionar outro turno já iniciado e atualizar a prévia. A interface mostra o período efetivamente apresentado e desabilita a entrega quando a seleção foi alterada sem atualizar a prévia. Períodos futuros são rejeitados pelo servidor.

Uma entrega tardia registra a situação **atual** dos chamados na confirmação, associada ao período escolhido; não reconstrói o estado passado dos chamados. O horário real da entrega é mantido separado do início/fim do período. Configuração e período ficam preservados na entrega, mesmo que os horários sejam modificados posteriormente.

## Resumo automático e confirmação

O resumo consulta chamados com abertura confirmada e acompanhamento operacional:

- Em tratamento.
- Pendentes, com a justificativa disponível.
- Normalizados cujo último status oficial conhecido não seja Fechado.

Inclui título/ID GLPI, tipo, trecho/rota, empresa/gerência, última observação, orientações e metadados locais de abertura/movimentação/sincronização. Consultas não fazem chamadas externas. Chamados de dias anteriores são incluídos sem corte de abertura. Fechados e tentativas de abertura incertas/falhas não são apresentados como ocorrências abertas. Chamados sem acompanhamento continuam identificáveis no dashboard; esta etapa não inventa estado operacional para inseri-los no resumo.

As observações da última movimentação usam a mesma regra do dashboard: descrição do último evento ou notas de sua fotografia, com fallback para notas do resumo operacional. Não se carrega todo o histórico para preparar a passagem.

O técnico revisa a prévia, acrescenta texto opcional e confirma. O servidor calcula uma assinatura da configuração, período, revisões e dados apresentados. Ao confirmar, releitura e comparação evitam entregar uma prévia já desatualizada. A instrução de INSERT também compara atomicamente as revisões das ocorrências/rotas selecionadas: atualização concorrente impede a gravação e retorna 409 para revisão. Essa proteção acompanha as revisões mantidas pelas APIs existentes.

O resumo guardado contém somente os campos selecionados e textos tratados. Não depende dos registros originais para ser reconstituído: mudanças posteriores de título, rota, observações ou estado não alteram passagens antigas. A entrega não reescreve eventos dos chamados.

Por limite de segurança, mais de 500 ocorrências ou resumo superior a 2 MiB retorna erro explícito, sem truncar silenciosamente e sem confirmar entrega parcial. Não há cronograma de atualização, prazo de resposta, meta individual ou cobrança.

## Entrega, recebimento e concorrência

- Entrega e recebimento exigem operador/admin local ativo. Identidade, nome e horário são obtidos pelo servidor; campos de identidade/horário enviados pelo navegador são rejeitados.
- Viewer pode consultar as passagens, mas não confirmar ações.
- Há uma entrega por fuso/data civil de início/tipo de turno. Outra chave não permite sobrescrever ou duplicar o mesmo período.
- Há um recebimento por entrega, feito por operador diferente de quem entregou. Não existe destinatário presumido nem escala individual suficiente para identificar automaticamente a pessoa seguinte.
- Chaves UUID e comparação da intenção permitem repetir requisições após falha de rede sem criar outra confirmação. Reutilizar chave com outro operador, período ou conteúdo recebe conflito.
- A confirmação de recebimento não recalcula a fotografia, não muda estados dos chamados e não dispara GLPI.
- Entregas e recebimentos são imutáveis no banco, com triggers contra UPDATE/DELETE. As FKs preservam referências de operador e entrega.
- A gravação de cada confirmação é uma única instrução atômica. Falha após inserir em um trigger reverte a operação inteira; resposta perdida após commit pode ser recuperada com a mesma chave.
- Na UI, 5xx/erro de rede conserva a chave e o payload para repetir a mesma confirmação. Campos ficam bloqueados enquanto esse resultado estiver incerto, sem bloquear a navegação fora do painel.

O aviso aponta a entrega mais recente ainda sem recebimento; entregas antigas também continuam consultáveis no histórico paginado de 20 registros. O painel não realiza polling, não mede demora e não registra produtividade.

## Dados confidenciais

O resumo é uma projeção permitida dos dados operacionais, sem credenciais de integração, tokens de sessão, conteúdo integral dos tickets ou chaves de operação. Textos que contenham marcadores de credencial, Basic/Bearer, URLs com usuário/senha, JWT reconhecível ou chave privada são substituídos integralmente por `[Conteúdo sensível omitido]` antes da prévia e da persistência. Novas observações/orientações com esses sinais são rejeitadas. A regra é conservadora e pode omitir também um texto que apenas mencione esses termos.

Não há logs de payload ou erros internos na funcionalidade. Erros HTTP públicos não reproduzem SQL ou conteúdo externo. Essa filtragem não identifica todo segredo arbitrário sem marcação; a política operacional continua sendo não digitar credenciais em texto livre. Nenhum `.env`, token ou credencial real foi aberto ou utilizado nesta implementação.

## API

Todas as respostas usam `Cache-Control: no-store` e autenticação existente.

| Endpoint | Permissão / comportamento |
|---|---|
| `GET /api/handoffs?page=1` | Viewer; metadados paginados, configuração e aviso de entrega disponível |
| `GET /api/handoffs/preview` | Viewer; resumo atual para o último período concluído |
| `GET /api/handoffs/preview?date=AAAA-MM-DD&shift=day\|night` | Viewer; prévia de período selecionado |
| `POST /api/handoffs` | Operator; entrega com `operationKey`, `date`, `shift`, `previewToken`, `notes` e `guidance` opcionais |
| `GET /api/handoffs/:id` | Viewer; fotografia e confirmações preservadas |
| `POST /api/handoffs/:id/receive` | Operator; apenas `operationKey`, identidade resolvida no servidor |

POST exige JSON, valida Origin quando presente e limita corpo a 64 KiB pelo leitor já existente. Parâmetros desconhecidos, identidades forjadas, IDs e datas inválidos são rejeitados. Banco/configuração indisponível retorna 503. Uma falha dessa área não impede o dashboard de consultar seus próprios dados.

## Migration e preservação

Nova migration **`0009_shift_handoffs.sql`**, com snapshot e entrada adicional no journal. Acrescenta:

- `shift_handoffs`: período único, fotografia/configuração em JSON, observações, orientações, operador de entrega, horário, chave e hash da intenção.
- `shift_receipts`: referência única à entrega, operador de recebimento, horário e chave única.
- Índices, FKs e triggers de imutabilidade e de separação entre quem entrega/recebe.

Não contém seed ou backfill; não modifica registros de chamados. **Não foi aplicada no banco operacional.** Migrations 0000–0008 e entradas anteriores do journal são preservadas; a preparação real de 0007/0008/0009 depende de conferência do destino e nova autorização. Sem as tabelas novas, o aviso informa indisponibilidade, mantendo a navegação.

## Correções integradas à auditoria

Aplicados apenas controles diretamente relacionados: autorização no servidor, validação de entrada/origem/tamanho, erros seguros, estado de resposta incerta e retry idempotente, fotografia imutável em vez de leitura dinâmica do histórico e prevenção de sobrescrita concorrente. O formulário oferece feedback local; prévia antiga não é confirmada silenciosamente. Não houve refatoração geral, alteração do fluxo de abertura GLPI ou sincronização automática.

## Arquivos

Criados: `services/handoffs/handoffs.ts`, `handlers.ts`, `runtime.ts`; `db/handoffs.ts`; quatro route handlers sob `app/api/handoffs/`; `components/handoff-panel.tsx`; migration 0009 e snapshot; `tests/handoffs.test.ts`, `tests/handoffs-ui.test.ts`, `tests/helpers/d1-memory.ts`; este capítulo.

Alterados pontualmente: `db/schema.ts`, `db/env.d.ts`, journal; `components/ticket-dashboard.tsx`, `components/tickets-section.tsx`, `app/page.tsx` para integração/permissão; `package.json` para incluir testes; teste de dashboard para reconhecer o painel substituindo o aviso reservado; capítulos 12/13 para atualizar as pendências.

## Verificação

Testes em cópia temporária sem credenciais/banco operacional e SQLite `:memory:`. Suíte completa: **137 testes passaram, zero falhas**, incluindo 19 cenários novos de configuração, travessia da meia-noite, DST, prévia, preservação, autorização, confirmação, concorrência, duplicidade, falhas/rollback, recuperação de resposta perdida, texto sensível e renderização segura. Testes anteriores de dashboard/chamados permaneceram aprovados.

Lint e TypeScript aprovados. Build Vinext aprovado, com o aviso já conhecido sobre classificação estática da rota `/`. Não foram realizadas chamadas reais ao GLPI nem operações reais de entrega/recebimento no banco existente.

## Pendências

Preparar o schema no destino autorizado; homologar interação em navegador, teclado/leitor de tela, temas e dispositivos móveis; confirmar horários/fuso operacionais com a equipe. Testes de UI desta etapa validam HTML renderizado e semântica, sem substituir homologação visual interativa.

Eventuais correções formais de uma entrega imutável, múltiplas equipes com períodos independentes, inclusão explícita de chamados sem acompanhamento e a escala individual exigem requisitos próprios. Não foram presumidos nesta etapa. RFO permanece fora do escopo. Nenhuma próxima implementação foi iniciada, nem houve commit ou push.

A [Implementação 4 — Registro de RFO](15-Registro-de-RFO.md) foi posteriormente integrada aos detalhes dos chamados. Ela não altera fotografias de passagens existentes nem seu fluxo de entrega/recebimento. O detector conservador de texto sensível foi compartilhado entre as duas funcionalidades, preservando o comportamento anterior da passagem.

## Integração GLPI — Implementação 5

A [Implementação 5](16-Integracao-e-Reconciliacao-GLPI.md) acrescenta sincronização auditada, solução, fechamento e reconciliação explícitos. Estados operacionais, pendências, RFOs e resumos de passagem permanecem independentes e preservados. Nenhum status remoto altera automaticamente o acompanhamento ou resumos anteriores; RFO pendente não bloqueia normalização. HTTPS é obrigatório para GLPI, e a nova migration não foi aplicada ao banco operacional.


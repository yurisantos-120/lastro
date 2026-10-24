# Implementação 2 — Dashboard operacional do NOC

## O que foi entregue

Painel na **Visão geral** e na área **Chamados**, reutilizando `tickets`, `ticket_operations`, `ticket_operation_events` e o vínculo explícito de rota em `information`. A base de conhecimento existente permanece abaixo do painel inicial. Não foram criadas tabelas ou migrations.

Antes da implementação foram lidos o capítulo 12, as pendências do plano de reformulação e os achados de UX da auditoria de 22/10/2026. Conferidos os arquivos 0007/0008 e as entradas de índices 7/8 do journal. Preservados schema, SQL, snapshots e journal desta etapa anterior. **Não foi executada migration no banco operacional nem presumido que o journal represente migrations aplicadas.**

## Regras dos indicadores

Todos os indicadores refletem os **filtros aplicados em todas as páginas**, não apenas os cartões visíveis. Não somar Ativos às situações, pois é um subconjunto operacional.

| Indicador | Regra |
|---|---|
| Em tratamento, Pendente, Normalizado e Fechado | Abertura confirmada (`result_state='created'` e ID GLPI positivo) e situação local correspondente |
| Sem acompanhamento | Abertura confirmada sem linha em `ticket_operations` |
| Ativos | Em tratamento + Pendente + Sem acompanhamento cujo último status oficial GLPI conhecido não seja 6 (Fechado) |
| Tentativas sem confirmação | Pending, failed, uncertain ou registro sem confirmação válida; aparece separado, fora dos seis indicadores |

As quatro situações locais mais Sem acompanhamento formam uma partição dos chamados confirmados. Uma ocorrência normalizada é exibida em Normalizados, sem ser adicionada a Ativos. Um chamado sem acompanhamento com GLPI oficialmente fechado continua em Sem acompanhamento, porém não em Ativos. Se o GLPI indicar Fechado e a situação local ainda for Em tratamento/Pendente, ambos são apresentados sem sincronização automática ou alteração dos dados.

Resultado de abertura, situação local e status oficial aparecem separadamente nos cartões. Campos não informados possuem texto explícito; não se inventam associações, datas ou confirmação remota. Abertura utilizada para filtro/agrupamento é `tickets.created_at`, identificada como abertura registrada no Lastro.

## Consulta durante o plantão

- Filtros combináveis por intervalo inclusivo de datas de abertura, situação/Ativos/Sem acompanhamento/Abertura não confirmada, tipo de ocorrência, trecho/rota, empresa/gerência e número GLPI exato.
- Agrupamento da **página atual** por hoje/ontem/dias anteriores, situação, tipo, trecho/rota, empresa/gerência ou número GLPI. Cabeçalhos informam a quantidade da página; não representam totais globais de cada grupo.
- Sem corte automático de data: chamados antigos ainda ativos permanecem consultáveis. O filtro Ativos permite concentrar a lista neles, sem limitar ao dia atual.
- Paginação padrão de 20, opção de 50 e limite de API de 50 por página. Ordenação estável por abertura decrescente e ID local decrescente.
- Pendências exibem justificativa, observação da última movimentação (descrição do último evento ou notas de sua fotografia; fallback para notas do resumo), orientações opcionais e horário da última movimentação.
- Última sincronização é exibida por chamado e no resultado agregado. Atualizar painel consulta o banco local; não sincroniza com o GLPI.
- Detalhes disponíveis a operator/admin, mantendo a política anterior. Viewer consulta os resumos do dashboard e os indicadores; não recebe conteúdo integral do chamado, autoria técnica ou chaves de operação nesta API.
- Foi reservado apenas um espaço visual para o futuro aviso de passagem de turno. Não há ação de entrega/recebimento, RFO, metas, penalidades ou cobrança de atualização.

## Fuso horário do NOC

Binding opcional do Worker **`NOC_TIME_ZONE`**, com nome IANA, por exemplo `America/Sao_Paulo`. Ausente, usa `America/Sao_Paulo`. Configuração inválida retorna 503, sem agrupar silenciosamente em outro fuso.

O servidor retorna o fuso e o horário de geração do resultado. Datas de filtro são dias civis nesse fuso: início incluído e início do dia seguinte excluído. A conversão não fixa offset -03; foram testadas mudanças de horário de verão em outro fuso. O navegador usa o fuso retornado para exibir horários e agrupar hoje/ontem, independentemente do fuso do computador do técnico. Nenhum arquivo `.env` foi lido ou modificado para implementar essa configuração.

## API e persistência

`GET /api/tickets/dashboard` exige sessão ativa viewer/operator/admin. Parâmetros permitidos: `page`, `pageSize`, `state`, `from`, `to`, `occurrence`, `route`, `organization`, `glpiId`. Parâmetros desconhecidos, repetidos, intervalos inválidos e paginação fora do limite recebem 400. Respostas usam `Cache-Control: no-store`.

A resposta contém `items`, `counts`, `page`, `pageSize`, `totalPages`, `timeZone`, `generatedAt` e `lastSyncedAt`. A listagem não transporta conteúdo integral de chamados, chaves idempotentes ou histórico de movimentações.

Contagens e página são consultadas no mesmo D1 batch. O relacionamento 1:1 com o resumo operacional evita multiplicar linhas por evento. Apenas a última movimentação é consultada por subconsulta limitada a uma linha, usando o índice de revisão existente; não se carrega todo o histórico para calcular indicadores. Filtros usam valores vinculados; caracteres `%`, `_` e sintaxe SQL são tratados como texto literal. A busca textual usa `lower` do SQLite: não promete normalização de acentos nem case folding Unicode completo.

`GET /api/tickets/:id` é uma nova leitura **local** para operator/admin, com ID local explícito. Não chama GLPI nem sincroniza. O botão já existente de consulta de status remoto permanece uma ação explícita do operador; não foi acionado durante esta implementação. O guard de autenticação mantém seu comportamento anterior de atualizar último acesso da sessão; as consultas do dashboard não escrevem em tickets/operações/eventos.

Sem as tabelas operacionais, a API retorna **503** e a interface apresenta erro com opção de tentar novamente, em vez de lista vazia ou indicadores zerados. Nenhuma inicialização de schema ou migration automática foi adicionada. A preparação do destino com 0007/0008 exige autorização própria e conferência do histórico real do banco.

## Correções relacionadas à auditoria

- Dashboard distingue carregamento, falha, vazio e sucesso; não apresenta zeros antes da resposta. Os indicadores cadastrais antigos na página inicial também aguardam a carga e não aparecem como zeros quando ela falha.
- Substituída listagem local limitada aos últimos 100 por consulta paginada, com totais independentes da página.
- Requisições de dashboard são canceladas na troca de filtros; resultados antigos não substituem a consulta atual.
- Abertura de detalhes não provoca mais sincronização implícita com GLPI. Seleção possui controle de sequência para evitar resposta atrasada de outro chamado.
- Campos de filtro têm nomes acessíveis, agrupamentos têm cabeçalhos e paginação usa botões com estados desabilitados. Loading usa `output`, erro usa alert, resultados indicam `aria-busy` e o título recebe foco ao aplicar filtros.
- Estado pending de criação tem mensagem própria. Falha confirmada não oferece reenviar a mesma chave encerrada; o fluxo de nova tentativa já existente gera outra chave.
- O CTA genérico de cadastro ficou restrito às áreas cadastrais, evitando abrir uma rota sem contexto no dashboard/Chamados.
- O painel utiliza tokens de tema e ícones Lucide já existentes, com grid responsivo. O controle de tema também ficou disponível no cabeçalho móvel, preservando o controle desktop. Não houve redesign geral, refatoração dos modais de inventário ou mudança de autenticação.

Não foi demonstrado bloqueador crítico de segurança no caminho novo: autorização é no servidor, dados SQL são vinculados e textos são escapados pelo React. Isso não substitui a homologação de TLS/proxy/credenciais pendente da auditoria geral, nem constitui scan completo de segurança.

## Arquivos desta etapa

Novos:

- `services/tickets/dashboard.ts`: contratos, filtros, datas civis e fuso.
- `services/tickets/dashboard-handlers.ts`: handlers testáveis do painel e detalhe local.
- `db/ticket-dashboard.ts`: agregação, paginação e resumo de pendências.
- `app/api/tickets/dashboard/route.ts` e `app/api/tickets/[id]/route.ts`.
- `components/ticket-dashboard.tsx`.
- `tests/ticket-dashboard.test.ts`, `tests/ticket-dashboard-ui.test.ts` e `tests/helpers/tsx-loader.mjs`.
- Este capítulo.

Alterados:

- `app/page.tsx`: integração inicial, loading cadastral e ação contextual.
- `components/tickets-section.tsx`: painel, detalhes locais e tratamento dos estados descritos.
- `db/ticket-storage.ts`: método de leitura por ID local, sem mudar abertura/gravação existente.
- `db/env.d.ts`: binding opcional de fuso.
- `package.json`: inclusão dos novos testes.
- `Documentação/docs/12-Chamados-Operacionais.md`: situação das pendências e ligação com esta etapa.

## Testes e resultados

Executados em cópia temporária sem `.env`, `.dev.vars`, banco operacional ou configuração de publicação. Testes de banco usam SQLite `:memory:` e fixtures sintéticas. Testes GLPI existentes usam HTTP simulado. Não houve contato com GLPI real, atualização/exclusão de dados existentes, commit ou push.

| Verificação | Resultado |
|---|---|
| Suíte completa, 12 arquivos | **118 testes passaram, zero falhas** |
| Lint Oxlint | Aprovado |
| TypeScript sem emissão | Aprovado |
| Vinext build | Aprovado; novas rotas incluídas |

Cobertura adicional: contagens e partições; confirmação versus situação/status; registros antigos ativos; fronteiras hoje/ontem, intervalo inclusivo e DST; filtros combinados e parâmetros literais; número GLPI exato; 125 registros distribuídos sem duplicação; última observação sem multiplicação por eventos; lista vazia; acesso por perfil; parâmetros inválidos; banco sem tabelas; mensagens seguras; renderização real dos componentes React em estados loading/erro/vazio/pendência; escape de HTML e agrupamentos. O loader TSX é exclusivo dos testes e usa o TypeScript já instalado, sem dependência nova.

Foi mantido o aviso já conhecido do Vinext sobre classificação estática da rota `/`. A validação da UI é de renderização HTML e semântica, não uma homologação visual/interativa completa em navegador, leitor de tela ou celular.

## Pendências restantes

Preparar schema no destino mediante autorização; homologar visualmente em ambiente isolado, teclado/leitor de tela/zoom e ambos os temas; medir latência e plano de consulta com volume real antes de propor índices adicionais. Busca Unicode/acentos e navegação por URL continuam oportunidades futuras. Os formulários gerais de inventário fora deste escopo continuam com as pendências de UX documentadas na auditoria.

A área reservada à passagem de turno foi substituída, na [Implementação 3](14-Passagem-de-Turno.md), por aviso discreto e painel expansível de consulta, preparação, entrega e recebimento. O dashboard continua abrindo normalmente. RFO e sincronização automática entre status GLPI e estado operacional continuam fora do escopo.

Na [Implementação 4](15-Registro-de-RFO.md), os cartões receberam indicação de RFO não iniciada, pendente ou concluída. Esses rótulos não entram nas contagens de situação operacional e não criam obrigação ou prazo. Sem a tabela nova, o dashboard mantém os indicadores anteriores e informa indisponibilidade da consulta de RFO. A sincronização automática de status continua fora do escopo.

## Integração GLPI — Implementação 5

A [Implementação 5](16-Integracao-e-Reconciliacao-GLPI.md) acrescenta sincronização auditada, solução, fechamento e reconciliação explícitos. Estados operacionais, pendências, RFOs e resumos de passagem permanecem independentes e preservados. Nenhum status remoto altera automaticamente o acompanhamento ou resumos anteriores; RFO pendente não bloqueia normalização. HTTPS é obrigatório para GLPI, e a nova migration não foi aplicada ao banco operacional.


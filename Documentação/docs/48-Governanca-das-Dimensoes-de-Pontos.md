# Etapa 16.5 — governança das dimensões dos pontos atendidos

Especificação preparada em 24/10/2026 a partir dos relatórios [43](43-Decisoes-D01-D04-e-Organizacao-de-Pontos.md), [44](44-Organizacao-Multidimensional-Pontos.md), [45](45-Prontidao-Ativacao-Controlada-0013.md), [46](46-Ativacao-Controlada-0013.md) e da política [47](47-Politica-de-Padronizacao-das-Dimensoes-de-Pontos.md). Esta é uma proposta funcional e técnica: **não cria catálogos, solicitações, permissões, migrations ou vínculos de pontos**. Os campos atuais, os dados existentes e as quatro fichas do Lote 01 permanecem inalterados e `PENDENTE_APROVACAO_FINAL`.

## Finalidade e princípios

O objetivo é substituir gradualmente o preenchimento livre das dimensões de pontos por referências a valores aprovados, sem transformar semelhança de texto em equivalência institucional. Os conjuntos governados são:

| Dimensão | Significado | Forma de exibição aprovada |
|---|---|---|
| Município | Município oficial do ponto, identificado também pela UF. | `<Nome oficial>/<UF>`; por exemplo, `Município Exemplo/ES`. |
| Cliente | Organização contratante ou institucionalmente responsável pelo serviço atendido. | Denominação institucional aprovada. |
| Região operacional | Divisão de cobertura, atendimento ou escalonamento definida pelo NOC. | `NOC - <nome aprovado>`. |

`client` não é sinônimo de `partner`, `provider`, `responsible` ou categoria. Região operacional não é município, UF, VLAN, parceiro ou classificação administrativa. A ausência de uma dimensão significa **não informado**; não deve ser suprida por inferência, texto genérico ou valor de planilha não aprovado.

Cada valor aprovado terá identidade estável, nome de exibição e chave de busca normalizada. A chave serve apenas para localizar candidatos e detectar colisões; ela não comprova identidade, não é exibida como nome e não autoriza fusão automática. Os nomes preservam acentos, caixa e pontuação aprovados, após normalização Unicode NFC e limpeza de espaços sem perda de significado.

## Modelo conceitual proposto

O modelo abaixo é conceitual; uma etapa de implementação deverá confirmar nomes físicos, tipos D1, constraints e migration aditiva.

| Entidade | Atributos essenciais | Regras propostas |
|---|---|---|
| `dimension_values` | `id` estável e opaco, `kind`, `display_name`, `normalized_key`, `status`, `revision`, autoria e horários do servidor. Município inclui UF e, quando validado, código oficial; região inclui referência restrita de escopo/vigência. | Um valor representa uma identidade aprovada. `status` permite retirar da seleção sem apagar vínculos históricos. |
| `dimension_name_keys` | `kind`, `normalized_key`, referência ao valor ou alias proprietário, estado. | Unicidade por dimensão e chave evita que valor canônico e alias ativos disputem a mesma forma normalizada. Colisão é revisão humana, não deduplicação automática. |
| `dimension_aliases` | ID estável, valor canônico de destino, forma aprovada, chave normalizada, estado, decisão e revisão. | Alias é forma alternativa de localizar a **mesma** identidade; não muda pontos nem cria equivalência por aproximação. |
| `dimension_requests` | ID estável, dimensão, nome proposto, justificativa segura, situação, revisão, solicitante, decisão, responsável e horários do servidor. | Situações: `draft`, `submitted`, `approved`, `rejected`, `withdrawn` e `superseded`. Solicitação não é valor aprovado. |
| `dimension_request_events` | ID, solicitação, tipo do evento, ator autenticado, horário do servidor, descrição segura e referência de revisão. | Histórico append-only de criação, envio, alteração, retirada, aprovação, rejeição e ligação a valor existente. |
| `point_dimension_assignments` | `information_id` (PK/FK de ponto), `municipality_id`, `client_id`, `operational_region_id`, revisão e auditoria. | Uma linha por ponto e, inicialmente, no máximo um valor opcional de cada dimensão. FKs impedem referência inexistente e preservam cadastro único. |

Os IDs nunca devem ser derivados do texto exibido. Um registro antigo sem atribuição continua válido e é apresentado como não informado. Os valores livres hoje existentes em `details_json` devem permanecer legíveis durante a transição, mas não serão convertidos ou vinculados por inferência. A atribuição só ocorrerá por decisão explícita, com evidência individual apropriada.

## Fluxo de solicitação e decisão

1. O operador pesquisa valores aprovados por dimensão usando busca normalizada e paginação no servidor.
2. Se não encontrar valor apropriado, inicia uma solicitação separada, com nome proposto e justificativa. A interface avisa que o pedido não altera o ponto nem cria valor selecionável.
3. O servidor associa solicitante e horário à sessão autenticada, valida conteúdo, cria um evento e devolve recibo idempotente.
4. O solicitante acompanha sua própria solicitação, com situação, motivo de decisão e histórico. Pode retirar um rascunho ou pedido pendente segundo a regra futura; não pode reescrever uma decisão final.
5. Um administrador examina fonte, possível colisão e distinção entre novo valor, alias ou identidade já existente. Ele aprova criando/ligando explicitamente o valor, ou rejeita com justificativa.
6. Só após aprovação o valor pode aparecer na lista de seleção. A aprovação não preenche automaticamente nenhum ponto e não altera as fichas do Lote 01.

Quando a busca localizar um nome parecido, o sistema deve mostrar que há um candidato, sem assumir equivalência. A decisão pode ser: criar valor distinto, criar alias para valor existente, associar a solicitação a valor já aprovado com justificativa, ou rejeitar. Nenhuma dessas ações ocorre apenas por igualdade de chave normalizada.

## Matriz de permissões proposta

Não são criados perfis novos. A proposta se apoia nos papéis atuais `viewer`, `operator` e `admin`, sempre avaliados no servidor a partir da sessão.

| Ação | Viewer | Operator | Admin |
|---|---:|---:|---:|
| Consultar valores aprovados e filtros de pontos | Sim | Sim | Sim |
| Consultar solicitação própria | Não por padrão | Sim | Sim |
| Consultar solicitações de terceiros | Não | Não | Sim |
| Criar, enviar ou retirar solicitação própria | Não | Sim | Sim |
| Aprovar, rejeitar ou associar a valor existente | Não | Não | Sim |
| Renomear valor, cadastrar alias, retirar valor da seleção | Não | Não | Sim, com justificativa e auditoria |
| Propor ou executar fusão de identidades | Não | Não | Não nesta primeira implementação |

A regra de acesso a pedidos próprios deve comparar o ID do usuário autenticado, não um ID enviado pelo navegador. Caso o NOC queira que `viewer` solicite valores, ou exija dupla aprovação para fusões, isso requer decisão explícita de política e não deve ser inferido desta matriz.

## Correções, aliases e continuidade histórica

| Operação | O que pode mudar | O que não pode acontecer |
|---|---|---|
| Correção de nome | A forma exibida do mesmo ID, com revisão, justificativa e evento histórico. | Reatribuir pontos para outro ID ou apagar a forma anterior sem rastreabilidade. |
| Alias | Nova forma aprovada aponta para um valor canônico existente. | Tornar nomes parecidos equivalentes sem decisão ou substituir valores dos pontos em massa. |
| Descontinuação | Valor deixa de ser selecionável para novos pontos; vínculos históricos permanecem. | Excluir valor usado ou quebrar filtros/detalhes antigos. |
| Fusão | Duas identidades reconhecidamente iguais podem exigir etapa posterior, prévia de impacto, aprovação explícita, transação e plano de compensação. | Fusão automática por nome, chave normalizada ou resultado de pesquisa. |
| Separação | Uma identidade ambígua exige novo valor e reatribuições explícitas, ponto a ponto ou por lote aprovado. | Presumir qual ponto deve migrar. |

Após uma renomeação, o detalhe histórico deve conseguir exibir a identidade estável e, quando necessário, a forma vigente no evento. Uma fusão confirmada no futuro deve manter `superseded_by`, eventos e relatório de impacto; rollback após confirmação será por evento compensatório e reatribuição auditada, não por exclusão silenciosa.

## Contratos de API propostos

Os contratos são propostas futuras e não alteram o atual `/api/data`.

| Operação proposta | Autorização | Contrato e garantias |
|---|---|---|
| `GET /api/dimensions` | `viewer` ou superior | Aceita `kind`, `q`, `page`, `pageSize` e somente valores aprovados/ativos por padrão. Filtro e contagem ocorrem no servidor, com ordem determinística e paginação. |
| `GET /api/dimension-requests` | `operator` próprio; `admin` geral | Aceita `mine`, dimensão, situação e paginação. Nunca expõe pedidos de terceiros a operador comum. |
| `POST /api/dimension-requests` | `operator` ou `admin` | Recebe dimensão, nome proposto e justificativa; exige `Idempotency-Key`. Ator, situação inicial e tempo são definidos no servidor. Candidato igual não é aprovado automaticamente. |
| `GET /api/dimension-requests/:id` | dono ou `admin` | Retorna solicitação autorizada e histórico paginado, com dados seguros. |
| Ações `submit`, `withdraw`, `approve`, `reject` | solicitante para as próprias ações; `admin` para decisão | Exigem revisão esperada e chave idempotente. Aprovação/rejeição é transacional, com motivo obrigatório e evento imutável. |
| Gestão de valor/alias | `admin` | Renomear, adicionar alias ou descontinuar exige revisão esperada, justificativa e idempotência. Fusão fica fora da primeira entrega. |

Para os pontos, uma implementação posterior poderá aceitar apenas `municipalityId`, `clientId` e `operationalRegionId` aprovados no caminho governado. A escrita deve atualizar ponto, atribuição 1:1, revisão e recibo idempotente em uma única transação. A leitura paginada deve receber filtros por ID apenas para `kind=point`, combiná-los com `q` e `categoryId`, aplicar o mesmo predicado em `COUNT` e resultados e conservar a ordenação determinística atual. Filtros de outras naturezas continuam inalterados.

Os IDs dessas dimensões entram no fingerprint de idempotência. Repetir a mesma chave e a mesma intenção recupera a resposta confirmada; a mesma chave com dimensões diferentes é conflito. Uma resposta perdida não autoriza o cliente a enviar uma nova intenção automaticamente.

## Experiência de interface proposta

No formulário de pontos, cada dimensão terá seletor pesquisável paginado, rótulo claro, valor atual, botão de limpar e estado de “não informado”. Cliente será visualmente separado de parceiro, provedor e responsável. Em caso de valor ausente, haverá ação secundária “Solicitar novo valor”, que abre painel próprio com justificativa e mensagem explícita de que o valor não ficará disponível até aprovação.

No painel de solicitações, o operador vê situação, datas registradas pelo servidor, justificativa, motivo de decisão e histórico de sua solicitação. O administrador recebe filtros por dimensão e situação, comparação com candidatos aprovados e ações de aprovar/rejeitar protegidas por revisão. Mensagens de erro preservam o rascunho em falhas recuperáveis; conflitos de revisão pedem recarga consciente e não sobrescrevem decisão alheia.

Os filtros de lista de pontos usam os mesmos catálogos, são combináveis, limpos individualmente e não reiniciam busca ou filtros não relacionados. Em celular, controles ficam empilhados; em desktop, seguem a grade e componentes existentes. Tema, ícones, teclado, foco, carregamento, lista vazia e mensagens de erro devem seguir os padrões já homologados, sem redesign.

## Segurança, consistência e auditoria

- Validar dimensão, tamanho, Unicode, caracteres de controle e padrões de dados sensíveis. Não aceitar endereço, contato, IP, segredo, token ou credencial em nome/justificativa pública.
- Determinar ator, horário e escopo de acesso exclusivamente no servidor. Corpo da requisição não define autor, aprovador ou data.
- Usar guards atuais para leitura/escrita e limitar decisões administrativas ao papel existente `admin`.
- Aplicar `revision`/controle otimista nas solicitações, valores e atribuições. Uma aprovação concorrente só pode confirmar uma vez; a segunda recebe conflito controlado.
- Usar ledger de idempotência persistente para todas as mutações e transações D1 para valor/alias, evento, nome reservado e decisão.
- Manter auditoria append-only com IDs, tipo de alteração, ator, horário e justificativa segura. Não registrar fonte confidencial, planilha privada ou credenciais em logs e respostas.
- Em falha antes do commit, rollback integral impede valor sem decisão, alias sem reserva ou evento sem resultado. Após commit, corrigir por ação compensatória auditada, nunca por eliminação silenciosa.
- Aplicar limites de tamanho, paginação e taxa a pesquisas/solicitações, sem carregar catálogos inteiros no cliente. Rejeitar parâmetros de filtro fora de `point` em vez de ignorá-los.

## Critérios de aceitação de implementação futura

1. Cada dimensão aprovada possui ID estável, nome aprovado, chave de busca e histórico; dois nomes semelhantes não são unidos automaticamente.
2. Município só aceita identidade oficial com UF aprovada; cliente e região seguem os significados separados definidos na política 47.
3. Operador pesquisa, solicita e acompanha pedido próprio, mas pedido pendente não pode ser escolhido por um ponto.
4. Admin aprova/rejeita com revisão, chave idempotente, motivo, autoria e horário do servidor; concorrência não duplica valores ou decisões.
5. Renomeações e aliases preservam vínculos e histórico; fusões não são disponibilizadas sem desenho, autorização e testes próprios.
6. Pontos anteriores permanecem intactos e não recebem valores por inferência. Um ponto continua único independentemente de quantas dimensões possua.
7. Filtros de município, cliente e região são combinados no servidor antes de paginação, sem contagem duplicada e sem regressão em outros tipos cadastrais.
8. Testes cobrem autorização, enumeração de pedidos, idempotência, revisões concorrentes, colisões de chave, alias, descontinuação, rollback, dados legados vazios, paginação, temas, teclado, responsividade e preservação de rascunho.

## Plano incremental sugerido

1. **Decisão de negócio:** aprovar mantenedores, fontes de referência, estado inicial dos catálogos, política de `viewer`, cardinalidade por ponto e, se desejada, dupla revisão para casos sensíveis.
2. **Desenho técnico isolado:** detalhar schema, constraints de nomes/aliases, política de retenção e migration aditiva; testar em cópia sintética e revisar impacto no contrato atual.
3. **Catálogos e solicitações:** implementar leitura paginada, solicitação, decisão e auditoria sem migrar nenhum ponto existente. Homologar permissões, conflitos e recuperação idempotente.
4. **Atribuição de pontos:** adicionar referências opcionais, filtros e formulários; manter compatibilidade de leitura com textos legados e proibir backfill inferido.
5. **Operação controlada:** cadastrar somente valores formalmente aprovados, com acompanhamento de erros e plano de reversão. Qualquer preenchimento dos pontos do Lote 01 continua dependente de aprovação individual externa.

## Verificação desta etapa

Foram consultados os documentos 43–47 e os contratos atuais de validação, paginação, escrita idempotente, autenticação/autorização e persistência. Como a etapa é exclusivamente de análise e documentação, não foram modificados código funcional, migrations, D1, planilhas, CSVs, usuários, credenciais ou GLPI; não foram executados testes funcionais, migrations, importações, commits ou push.

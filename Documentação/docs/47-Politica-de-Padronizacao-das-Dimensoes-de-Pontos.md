# Etapa 16.4 — política de padronização de município, cliente e região operacional

Proposta preparada em 24/10/2026. Este documento define regras de nomenclatura, validação e uso futuro para os campos opcionais `municipality`, `client` e `operationalRegion` de pontos atendidos. **Não aprova valores, não altera o D1, não reclassifica registros e não libera importação.** As quatro fichas do Lote 01 seguem `PENDENTE_APROVACAO_FINAL`.

## Base analisada

Foram consultados integralmente os relatórios [43](43-Decisoes-D01-D04-e-Organizacao-de-Pontos.md), [44](44-Organizacao-Multidimensional-Pontos.md), [45](45-Prontidao-Ativacao-Controlada-0013.md) e [46](46-Ativacao-Controlada-0013.md), além dos contratos de validação, escrita, consulta paginada e interface atuais.

O modelo mantém um cadastro único por ponto. As três dimensões são textos opcionais em `information.details_json`, separados de categoria, `partner`, `provider` e `responsible`. A chave técnica de busca atual remove acentos, converte para minúsculas `pt-BR` e reduz espaços; ela não é uma identidade canônica e não aparece como dado do usuário. Os filtros combinam as três dimensões no servidor antes da paginação e usam os índices da migration 0013.

Em ambiente restrito, o conjunto sanitizado de 599 rascunhos foi consultado sem transcrever valores: há 459 rascunhos de pontos; `partner` aparece preenchido em 292 rascunhos e `provider` em 32. Não existe nesse conjunto um catálogo de clientes aprovados, uma lista de aliases autorizados ou uma definição de regiões operacionais. Esses campos não são evidência para preencher `client` por derivação.

## Princípios gerais

1. O valor exibido preserva o nome aprovado, incluindo acentos, maiúsculas relevantes e pontuação permitida. A chave normalizada serve somente à busca.
2. Uma ausência significa **não informado**. Não usar `N/A`, `desconhecido`, hífen, município genérico ou região inferida como substituto.
3. Correção de escrita, abreviação, alias ou equivalência entre organizações requer revisão humana. Busca aproximada pode sugerir uma revisão, mas não pode alterar nem agrupar valores por conta própria.
4. Não guardar contato, endereço, IP, credencial, token, matrícula, pessoa física ou identificador técnico nos três campos. A validação existente já recusa vários padrões; a política exige revisão humana também para casos que passem pela validação sintática.
5. Cada alteração de um valor é uma edição do ponto existente: mantém revisão, autorização e idempotência. Não criar outro ponto para corrigir uma dimensão.
6. A política não autoriza atribuir dimensões a registros anteriores, às fichas do Lote 01 ou a qualquer linha de planilha sem evidência individual aprovada.

## Município

### Nome canônico proposto

Para novos valores aprovados, usar o nome oficial completo do município seguido da UF:

`<Nome oficial do município>/<UF>`

Exemplo de forma: `Município Exemplo/ES`.

O nome deve seguir a grafia oficial em português, com acentos. A UF é sempre a sigla oficial em maiúsculas. Um futuro catálogo pode guardar o código oficial do município em coluna própria; ele não deve ser embutido no rótulo exibido nem no campo atual de texto livre.

| Caso | Regra |
|---|---|
| Acentos | Obrigatórios no valor exibido aprovado. A busca continua encontrando a forma sem acento pela chave atual. |
| Homônimos | Sempre informar UF, mesmo onde não haja homônimo conhecido. |
| Abreviação | Não aceitar como valor canônico. `Mun. Exemplo`, siglas locais e apelidos podem constar apenas em uma futura tabela de aliases aprovada. |
| Erro de digitação | Exibir sugestão de correção baseada em catálogo aprovado; a substituição exige confirmação do operador e evidência do ponto. |
| Fonte de prova | Endereço atual validado ou outra fonte autorizada que identifique o mesmo ponto. Nome de arquivo, vizinhança, cliente ou região não bastam. |

Entradas válidas de exemplo: `Município Exemplo/ES`, `Cidade Modelo/MG`.

Entradas inválidas: `Município Exemplo` (UF ausente), `M. Exemplo/ES` (abreviação), `Municipio Exemplo/ES` (perde a grafia aprovada), `Região Norte` (não é município), `Não informado` (usar vazio).

## Cliente atendido

### Significado operacional proposto

**Cliente atendido** é a organização contratante ou institucionalmente responsável pelo serviço do ponto, reconhecida pelo NOC como referência principal para o atendimento. Ela pode ser diferente da organização física onde o equipamento está instalado.

Esse conceito não equivale a:

| Campo ou conceito | Por que permanece separado |
|---|---|
| `partner` | Pode indicar parceiro de campo, integrador ou referência vinda da fonte; não prova a relação contratual. |
| `provider` | Identifica fornecedor de conectividade quando informado; não determina quem recebe ou contrata o serviço. |
| `responsible` | É responsável operacional ou administrativo associado ao cadastro; não deve se tornar cliente por cópia. |
| Categoria | É agrupamento do ponto e não deve representar uma organização contratante. |

### Nome canônico proposto

Usar a denominação institucional aprovada para a relação de atendimento. Quando houver nome jurídico/documental aplicável, ele é a forma preferida; uma marca ou sigla só pode ser a forma canônica se o responsável aprovar essa escolha para o NOC.

Preservar sufixos institucionais quando fizerem parte do nome aprovado. Não expandir, remover ou mesclar automaticamente siglas, razões sociais, marcas, órgãos com nomes semelhantes ou unidades de uma mesma organização.

Entradas válidas de exemplo: `Organização Exemplo`, `Prefeitura Municipal de Cidade Modelo`.

Entradas inválidas: `Org. Ex.` sem alias aprovado, um nome de pessoa, um telefone/e-mail, `Provedor X` apenas porque aparece em `provider`, ou `Parceiro Y` apenas porque aparece em `partner`.

O levantamento privado deve produzir, em ambiente restrito, uma lista de candidatos com referência de fonte e variações ortográficas. Essa lista não deve ser publicada no repositório, não confirma equivalência entre nomes e não cria catálogo automaticamente. A aprovação precisa definir, por candidato, nome canônico, aliases permitidos, fonte de prova, responsável pela manutenção e decisão `APROVADO`, `DISTINTO` ou `PENDENTE`.

## Região operacional

### Significado operacional proposto

Região operacional é uma divisão definida pelo NOC para organizar atendimento, escalonamento, cobertura de equipes, turnos ou acompanhamento de rede. Ela não é, por definição, município, UF, microrregião administrativa, categoria de ponto, categoria VLAN, parceiro ou provedor.

Cada região aprovada precisa de uma ficha restrita contendo: nome, código curto opcional, finalidade, critério de abrangência, mantenedor, data de vigência e referências que definam seus limites. Uma região pode abranger vários municípios; um município pode abranger mais de uma região se o NOC aprovar essa cardinalidade em etapa posterior.

### Nome canônico proposto

Usar:

`NOC - <nome aprovado da região>`

Exemplo de forma: `NOC - Região Alfa`.

O prefixo identifica que o agrupamento é operacional e evita confundí-lo com geografia oficial. Códigos curtos, se aprovados, devem ficar no catálogo futuro, não ser usados como único valor no campo visível.

Entradas válidas de exemplo: `NOC - Região Alfa`, `NOC - Corredor Leste`.

Entradas inválidas: `ES` (UF), `Município Exemplo/ES` (município), `VLAN 100` (atributo técnico), `Categoria Pontos` (categoria), `Região 1` sem definição e dono NOC.

Não vincular uma região por inferência de endereço, município, categoria, parceiro, equipe ou planilha. A atribuição futura deve ter evidência explícita da regra NOC vigente para o ponto.

## Normalização sem perda de significado

| Camada | Regra proposta | Não fazer |
|---|---|---|
| Exibição | Aplicar Unicode NFC, remover espaços nas extremidades e reduzir espaços internos repetidos. Manter acentos, caixa, barras, hífens e pontuação aprovada. | Remover acentos, traduzir nome, expandir sigla, alterar sufixo institucional ou mudar UF. |
| Busca | Manter a chave atual: NFD, remoção de marcas diacríticas, minúsculas `pt-BR` e espaços reduzidos. | Mostrar a chave ao usuário ou tratá-la como identidade jurídica/operacional. |
| Alias | Relacionar alias a uma forma canônica somente em catálogo controlado e com decisão auditável. | Reescrever cadastros existentes em massa por semelhança textual. |
| Colisão | Quando dois rótulos gerarem a mesma chave de busca, sinalizar revisão. | Considerar os valores equivalentes automaticamente. |

As regras atuais de 160 caracteres e bloqueio de controles, e-mail, URL, IP, segredo e contato numérico continuam válidas. A política recomenda que uma implementação futura valide também o formato `<nome>/<UF>` para município e consulte catálogos aprovados antes de confirmar valores novos; isso não é uma alteração autorizada nesta etapa.

## Experiência de uso futura

| Abordagem | Benefício | Limite | Avaliação |
|---|---|---|---|
| Campo livre atual | Permite registrar informação verificada antes de existir catálogo. | Multiplica grafias e não protege identidade canônica. | Manter somente como transição, com aviso e revisão. |
| Sugestões de valores existentes | Rápida para o operador e compatível com busca. | Pode repetir erro já cadastrado e não prova equivalência. | Usar apenas como sugestão; não preencher ao selecionar texto parecido. |
| Lista controlada | Garante formas aprovadas e previne novos aliases. | Exige governança e cobertura inicial suficientes. | Destino recomendado depois da aprovação dos catálogos. |
| Lista com solicitação de novo valor | Combina consistência e continuidade operacional. | Exige estado de revisão, responsável e auditoria. | Melhor evolução: selecionar valor aprovado ou registrar solicitação pendente, sem torná-la canônica automaticamente. |

A interface recomendada é um seletor pesquisável e paginado para cada dimensão, com valor atual claro, opção de limpar, estado “não informado” e botão separado “solicitar novo valor”. A solicitação deve preservar o rascunho e indicar que ainda não é valor aprovado. Em celular, os três controles ficam empilhados; em desktop, podem ocupar a mesma grade atual. Filtros continuam combináveis e devem manter página, texto de busca e filtros já selecionados conforme o contrato atual.

Para corrigir um valor aprovado, o formulário deve mostrar a forma atual e a forma proposta, exigir justificativa e evidência, e atualizar somente os pontos escolhidos pelo operador autorizado. Correções em massa, fusões de aliases e troca de rótulo canônico exigem uma etapa específica com prévia, idempotência, conflito de revisão, rollback e auditoria.

## Decisões humanas pendentes

1. Aprovar se o município seguirá o formato `<nome oficial>/<UF>` e quem mantém a referência oficial.
2. Definir formalmente cliente principal, incluindo casos de unidade atendida, órgão controlador, contrato compartilhado e mudança de cliente.
3. Aprovar a primeira lista de clientes e aliases em ambiente restrito, com mantenedor e critério de prova.
4. Definir regiões do NOC, seus limites, cardinalidade por ponto, mantenedor e regra de vigência.
5. Decidir se solicitações de valores novos podem ser salvas como rascunho ou precisam de aprovação antes de qualquer persistência.
6. Decidir a política de correção e descontinuação de valores aprovados sem reinterpretar pontos antigos.

Sem essas decisões, o uso dos campos deve continuar opcional e cada preenchimento deve ser tratado como dado de um ponto individual, não como novo padrão global.

## Impacto e validação de uma implementação futura

Uma evolução para listas controladas requer etapa própria, migration aditiva e catálogo de municípios, clientes e regiões, com IDs estáveis, aliases auditáveis e atribuição 1:1 por ponto, conforme proposta do relatório 43. A API deve manter compatibilidade com os campos atuais durante transição, filtrar por ID canônico no servidor e preservar a ordenação, paginação, autorização, revisão e `Idempotency-Key`.

Os testes futuros devem cobrir: grafias com e sem acento; município homônimo com UF distinta; colisão de chave normalizada; alias aprovado e alias pendente; cliente diferente de parceiro/provedor/responsável; região não geográfica; filtros combinados; pontos antigos vazios; edição com conflito de revisão; recuperação da mesma operação idempotente; autorização; responsividade; tema; teclado; e ausência de alteração automática de registros existentes.

Nenhum código funcional, migration, D1, planilha, CSV de aprovação, credencial ou configuração foi alterado nesta etapa. Não houve importação, operação GLPI real, commit ou push.

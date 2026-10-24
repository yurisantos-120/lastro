# Etapa 15.3 — fichas iniciais e decisões de dados

Data: 24/10/2026. Este material prepara a revisão humana; **nenhuma ficha representa aprovação ou autorização de importação/limpeza**. Base: [preparação da Etapa 15.1](37-Preparacao-Dados-Tecnicos-e-Procedencia.md), [organização da Etapa 15.2](38-Revisao-Humana-Dados-Tecnicos.md) e seus CSVs. Os arquivos e valores técnicos completos permanecem na pasta privada das planilhas.

## Critério e resultado da seleção

Não há uma linha simultaneamente livre de toda pendência e aprovada: as 202 linhas com forma aceita pela API ainda pertencem a grupos de duplicidade, conflito ou incompatibilidade de mapeamento. Para o primeiro contato com o responsável, selecionei **quatro unidades de revisão de um localizador cada**. Elas têm tipo `point`, campos obrigatórios presentes, uma única pendência codificada, fonte F10 verificável, nenhuma ligação com os 77 grupos candidatos a duplicidade ou 54 grupos de conflito conhecidos e quatro identificadores/títulos distintos entre si. Esse é um recorte de **menor complexidade conhecida**, não garantia de ausência de duplicação.

| ID novo da ficha | Localizador preservado | Classe original | Forma da API | Pendência única | Grupos ligados |
|---|---|---|---|---|---|
| `REV-F10-A1-L7` | F10, aba 1, linha 7 | `incompativel_com_api` | Válida | `speed_unit_missing_or_ambiguous:speed` | Nenhum conhecido |
| `REV-F10-A1-L13` | F10, aba 1, linha 13 | `incompativel_com_api` | Válida | `speed_unit_missing_or_ambiguous:speed` | Nenhum conhecido |
| `REV-F10-A1-L36` | F10, aba 1, linha 36 | `incompativel_com_api` | Válida | `speed_unit_missing_or_ambiguous:speed` | Nenhum conhecido |
| `REV-F10-A1-L48` | F10, aba 1, linha 48 | `incompativel_com_api` | Válida | `speed_unit_missing_or_ambiguous:speed` | Nenhum conhecido |

`REV-*` identifica **apenas a ficha desta etapa**. Os IDs originais `dup-*`, `conf-*`, os localizadores e a classificação `incompativel_com_api` não foram alterados. O payload sanitizado tem `location`, `partner`, `address` e `speed` não vazios nos quatro casos; a API aceita a forma textual de `speed`, mas não comprova sua unidade. O campo ficou marcado na sanitização e **não pode ser tratado como velocidade confirmada**. A proposta de categoria do conjunto é Santa Maria de Jetibá, ainda não aprovada; o D1 não possui categoria `point`.

Fonte comum: **F10**, `TODOS OS PONTOS SANTA MARIA DE JETIBA (Fernando TI).xlsx`, aba **Página1**. O SHA-256 do arquivo atual e os hashes de origem registrados nas quatro linhas conferem com o inventário privado. A aba/linha são localizadores físicos do arquivo; esta documentação não reproduz valores de local, endereço, parceiro, velocidade ou contato.

### Ficha `REV-F10-A1-L7`

- **Tipo e origem:** ponto atendido; F10 / Página1 / linha 7. Classificação anterior `incompativel_com_api`, forma do payload válida, sem grupo `dup-*` ou `conf-*` conhecido.
- **Validar no original com o responsável:** identidade do ponto e identificador da fonte; local, endereço e parceiro; valor **e unidade** da velocidade; atualidade do serviço; município que fundamentaria a categoria `point`.
- **Dúvida registrada:** `speed_unit_missing_or_ambiguous:speed`. Nenhum outro código de pendência, campo seguro sem destino ou fórmula sem valor foi registrado para esta linha; isso não dispensa inspeção humana de sensibilidade e exatidão.
- **Opções:** confirmar unidade por evidência da fonte e corrigir a origem; declarar velocidade desconhecida e manter o campo pendente; ou manter a linha toda pendente. Não adicionar `Mbps` por presunção nem aprovar categoria por nome do arquivo.
- **Impacto:** um localizador nesta ficha; zero vínculos nos grupos conhecidos. A decisão sobre a categoria de Santa Maria de Jetibá pode afetar **281 propostas de ponto**. Verificar de novo as demais fontes antes de descartar duplicação não detectada.

### Ficha `REV-F10-A1-L13`

- **Tipo e origem:** ponto atendido; F10 / Página1 / linha 13. Classificação anterior `incompativel_com_api`, forma do payload válida, sem grupo `dup-*` ou `conf-*` conhecido.
- **Validar no original com o responsável:** identidade do ponto e identificador da fonte; local, endereço e parceiro; valor **e unidade** da velocidade; atualidade do serviço; evidência do município para a categoria.
- **Dúvida registrada:** `speed_unit_missing_or_ambiguous:speed`. Não foi registrada outra pendência nessa linha; revisar também o conteúdo no ambiente restrito.
- **Opções:** corrigir a unidade na fonte com confirmação; manter velocidade ou linha pendente; ou registrar que a velocidade não é conhecida após decisão expressa. Não inferir unidade nem mesclar por semelhança de título.
- **Impacto:** um localizador, sem grupos relacionados conhecidos; compartilha a decisão de categoria com as outras propostas de ponto. A ausência de vínculo no relatório de duplicidades não encerra a pesquisa de identidade.

### Ficha `REV-F10-A1-L36`

- **Tipo e origem:** ponto atendido; F10 / Página1 / linha 36. Classificação anterior `incompativel_com_api`, forma do payload válida, sem grupo `dup-*` ou `conf-*` conhecido.
- **Validar no original com o responsável:** identificador e identidade do serviço; local, endereço, parceiro e vigência; velocidade com unidade explícita; pertinência da categoria por município.
- **Dúvida registrada:** `speed_unit_missing_or_ambiguous:speed`. Os campos obrigatórios existem no rascunho sanitizado, mas sua correção factual não foi aprovada.
- **Opções:** fonte corrigida e revalidada; manter pendente até confirmação; ou decisão documentada de velocidade desconhecida sem inventar valor.
- **Impacto:** um localizador e a política compartilhada de categoria `point`. Nenhuma ligação encontrada com os 131 grupos conhecidos; conferir outras fontes e cadastro local antes de futura carga.

### Ficha `REV-F10-A1-L48`

- **Tipo e origem:** ponto atendido; F10 / Página1 / linha 48. Classificação anterior `incompativel_com_api`, forma do payload válida, sem grupo `dup-*` ou `conf-*` conhecido.
- **Validar no original com o responsável:** identidade e identificador técnico da fonte; local, endereço, parceiro, período de validade e unidade de velocidade; evidência do município/categoria.
- **Dúvida registrada:** `speed_unit_missing_or_ambiguous:speed`. A forma da API não valida a semântica de velocidade nem a categoria, que ainda não existe no D1.
- **Opções:** obter a unidade e corrigir a fonte; manter velocidade ou registro pendente; ou documentar ausência de dado após aprovação humana específica.
- **Impacto:** um localizador nesta ficha, sem conexões de duplicidade/conflito conhecidas; qualquer categoria aprovada poderia ser reutilizada por outros pontos após revisão individual.

## Proposta para os oito cadastros de origem de demonstração

A [matriz de procedência da Etapa 15.2](../evidencias-etapa-15-2/matriz-procedencia.csv) continua a referência de classificação. `451d14d:db/storage.ts` contém o seed histórico, e a comparação de ID e campos atuais confirmou **três categorias e cinco informações** de origem de demonstração. Isso descreve o **modo de criação**, não a veracidade técnica do texto. O conteúdo pode ter vindo de uma planilha de referência e ter sido consultado no plantão; nenhum deles está liberado para exclusão.

| ID local | Tipo e origem | Vínculos atuais comprovados | Verificação humana e efeito de eventual remoção |
|---|---|---|---|
| `categories:1` | `general`; seed confirmado | Informações `1`, `3`, `5` | Confirmar uso da categoria e dos três registros; `information.category_id` referencia a categoria e impede remoção isolada. |
| `categories:2` | `general`; seed confirmado | Informações `2`, `4` | Confirmar uso; a FK de `information.category_id` impede remoção isolada. |
| `categories:3` | `general`; seed confirmado | Nenhuma informação vinculada no D1 atual | Verificar uso externo e mudança de `updated_at` após o seed; ausência de FK atual não comprova que a categoria seja descartável. |
| `information:1` | `general`; seed confirmado | Categoria `1`; nenhuma FK de ticket/importação apontando para ela | Validar conteúdo técnico e uso atual antes de propor qualquer destino. |
| `information:2` | `general`; seed confirmado | Categoria `2`; nenhuma FK de ticket/importação apontando para ela | Mesmo critério; ausência de vínculo relacional não cobre referências textuais ou externas. |
| `information:3` | `general`; seed confirmado | Categoria `1`; nenhuma FK de ticket/importação apontando para ela | Confirmar se a orientação/trecho ainda é usada. |
| `information:4` | `general`; seed confirmado | Categoria `2`; nenhuma FK de ticket/importação apontando para ela | Confirmar validade técnica e dependências fora das FKs. |
| `information:5` | `general`; seed confirmado | Categoria `1`; **chamado local `4`** em `ticket_operations.route_id` | **Não propor remoção nesta revisão.** A FK `RESTRICT` impede exclusão enquanto o chamado estiver vinculado; qualquer mudança afetaria histórico operacional e exige análise específica posterior. O `updated_at` posterior ao seed não informa o que mudou. |

`import_records` está vazio; `ticket_operations` contém um vínculo com a informação `5`; `shift_handoffs` e `data_operations` estão vazios no D1 consultado. `PRAGMA quick_check=ok` e não há violações de FK. As quatro categorias locais de IDs `1788299829872`, `1788362673560`, `1788362673627`, `1788362673679` e as duas informações `1788299847161`, `1789407709439` **continuam `ORIGEM_DESCONHECIDA`**. IDs e horários, sozinhos, não confirmam cadastro manual.

**Tratamento proposto:** conservar os oito registros e pedir ao NOC a avaliação de validade técnica, uso presente e dependências por ID. Caso algum conteúdo seja declarado obsoleto, preparar em outra etapa um plano individual de substituição/arquivamento, com backup, referências externas e autorização específica. Origem demo não é critério suficiente para apagar. Não alterar automaticamente o vínculo do chamado `4`.

## Modelo de decisão humana

O [modelo CSV](../evidencias-etapa-15-3/modelo-decisoes-lote-01.csv) contém quatro linhas pré-preenchidas **somente com ID da ficha e localizador afetado**. `decisao`, `responsavel_aprovacao`, `data_decisao`, `justificativa_resumida` e `referencia_evidencia_restrita` estão vazios. Nenhuma aprovação foi inventada.

Para preencher uma ficha, o responsável deve registrar:

1. Decisão por localizador: `APROVAR_APOS_CORRECAO`, `CORRIGIR_FONTE`, `DADO_DESCONHECIDO`, `DISTINTO`, `MESMO_ATIVO` ou `MANTER_PENDENTE`, conforme o caso. Nenhum desses códigos executa operação no Lastro.
2. Identidade do aprovador, data da decisão e justificativa curta **sem valores sensíveis**. A evidência técnica completa fica no repositório restrito da fonte, referenciada por arquivo/aba/linha e ID de decisão.
3. Todos os registros afetados, inclusive grupos ligados descobertos depois. Uma aprovação da unidade de velocidade não aprova automaticamente categoria, identidade, ausência de credencial ou importação.

O modelo precisa ser usado em armazenamento de revisão com acesso adequado; não preencher conteúdo confidencial diretamente nos arquivos versionáveis do Lastro. Uma decisão posterior não modifica a classificação histórica da sanitização: a nova decisão deve ficar ligada ao localizador e à versão da fonte.

## Validação desta preparação

- As filas das Etapas 15.1 e 15.2 conservam **599 localizadores únicos**, com **zero** diferenças de classificação ou códigos de pendência. Os **131 grupos** não têm localizadores ou conexões inválidas; a matriz local permanece com oito IDs de origem seed e seis desconhecidos.
- As quatro fichas correspondem a quatro linhas únicas da fila: forma `sim`, classe `incompativel_com_api`, somente o código de unidade de velocidade e nenhum grupo conhecido. O arquivo F10 mantém SHA-256 igual ao inventário, e sua única aba inventariada é `Página1`.
- O CSV de decisões tem **quatro linhas** e nenhum valor preenchido em decisão, aprovador, data, justificativa ou evidência. Uma verificação heurística de atribuições de credenciais nos dois arquivos desta etapa retornou zero; isso não substitui revisão de segurança antes de qualquer importação.
- O D1 foi aberto apenas em leitura para conferir dependências: `quick_check=ok`, nenhuma violação de FK, um vínculo de `information:5` ao chamado local `4`. Nenhuma escrita ou migration foi executada. Como só documentação e modelo vazio foram criados, a suíte de aplicação, lint e build não foram reexecutados nesta etapa.

## Próximos lotes de decisão

1. **Lote 01, quatro fichas acima:** confirmar unidade da velocidade e identidade com o dono de F10, além da proposta de categoria `point` para Santa Maria de Jetibá. Revalidar a fonte corrigida; manter bloqueio até decisão expressa.
2. **Lote 02, se o critério do primeiro funcionar:** selecionar outras linhas isoladas de F10 com uma pendência e sem grupos ligados, verificando novamente hash, classificação, categoria e cruzamentos. Não inferir que as 32 linhas de forma válida da prioridade 3 sejam equivalentes entre si.
3. **Lote 03:** começar grupos pequenos `dup-*` com dois membros e sem `conf-*` conectado, usando [grupos relacionados](../evidencias-etapa-15-2/grupos-relacionados.csv). Os candidatos `dup-0034`, `dup-0040` e `dup-0075` têm dois membros com forma válida e nenhum outro grupo conectado, mas **a própria duplicidade continua em aberto**; não devem entrar como registros independentes sem decisão humana.
4. **Lotes posteriores:** conflitos `conf-*`, campos obrigatórios ausentes, abas sem estrutura e câmeras. Revisar interdependências antes de mudar a ordem; não resolver por maioria, nome ou IP isolado.

Somente depois de decisões documentadas, aprovação de categorias, correção/validação da fonte e verificação de segurança caberá simulação em banco isolado. Qualquer importação ou limpeza definitiva requer autorização separada. Esta etapa não executou migrations, alteração do D1, operação real no GLPI, exclusão, commit ou push.

**Avaliações posteriores:** quatro declarações preliminares de unidade, município e situação foram registradas [separadamente](40-Avaliacoes-Preliminares-Lote-01.md). Elas não alteram estas fichas nem preenchem o modelo de aprovação formal; as quatro linhas seguem bloqueadas para importação.

# Etapa 15.2 — preparação da revisão humana dos dados

Data: 23/10/2026. Este documento organiza decisões; **não aprova conteúdo, não importa, não cria categorias e não autoriza limpeza**. Fontes e artefatos tratados permanecem na pasta privada identificada na [Etapa 15.1](37-Preparacao-Dados-Tecnicos-e-Procedencia.md). O D1 recuperado foi consultado somente com SQLite `readOnly: true`. Nenhuma migration ou chamada GLPI foi executada.

## Base conferida e material de trabalho

Foram lidos o relatório e a fila completos da Etapa 15.1, os relatórios de preparação, revisão, sanitização e duplicidades de 08/10, o contrato cadastral atual e a migration `0007_import_tracking.sql`. A fila original conserva **599 linhas únicas** e suas classificações; nenhum artefato da sanitização foi reescrito. Os dez hashes de planilha já haviam sido conferidos na Etapa 15.1; a comparação atual trabalha sobre os localizadores e campos permitidos do conjunto sanitizado, sem reexportar valores brutos.

Arquivos de apoio desta etapa:

- [Fila priorizada](../evidencias-etapa-15-2/fila-priorizada.csv): 599 linhas, alias F01–F10, índice da aba, linha, tipo, validade **somente estrutural** na API, classificação original, códigos de pendência e grupos relacionados. Ordena a revisão; não altera a classificação original.
- [Grupos relacionados](../evidencias-etapa-15-2/grupos-relacionados.csv): 77 grupos de duplicidade candidata e 54 grupos de conflito, com os localizadores dos membros, arquivos envolvidos, pergunta, opções de tratamento e grupos conectados, sem valores divergentes.
- [Matriz de procedência](../evidencias-etapa-15-2/matriz-procedencia.csv): 14 IDs locais, vínculo de categoria, dependentes, classificação e código da evidência. Não contém conteúdo cadastral.

Os IDs F01–F10 e a ordem das abas são os do inventário da [Etapa 15.1](37-Preparacao-Dados-Tecnicos-e-Procedencia.md). Abra a planilha original somente no ambiente restrito para decidir sobre um localizador. Não escreva senhas, IPs, contatos ou outros valores operacionais nos CSVs de apoio ou no repositório.

## Proposta de categorias, para decisão

O D1 tem sete categorias: quatro `general`, duas `vlan`, uma `camera` e **nenhuma `point`**. Conferi os nomes e escopos dos sete IDs com o D1 atual, sem imprimir outros campos. A proposta antiga de 08/10 continua como hipótese de organização, mas suas quantidades (507 pontos e 52 câmeras) foram substituídas pela sanitização posterior (**459 pontos e 100 câmeras**).

| Escopo | Situação atual e possível equivalência | Proposta e decisão exigida |
|---|---|---|
| `point` | Nenhuma categoria. A sanitização propõe município para 281 linhas de Santa Maria de Jetibá, 57 de Santa Teresa e 74 de Sooretama; 47 não têm proposta. São **sugestões de fonte**, não município verificado por registro. | Avaliar município como primeira dimensão e confirmar cada atribuição por fonte/endereço. Definir destino dos 47 restantes. A antiga proposta de Linhares tem **zero** candidatos na sanitização atual e não deve gerar categoria por memória. Não criar categorias ainda. |
| `camera` | `Megalink` (ID `1788362673679`) existe, sem vínculo confirmado com as 100 linhas de câmera. | Definir se a categoria representa proprietário, equipe operadora ou outra dimensão. Confirmar se as câmeras das fontes F01, F05 e F08 cabem nela; se não, propor categorias com critério explícito. Nome de planilha não basta. |
| `vlan` | `Linhares` (ID `1788362673560`) e `Região Serrana` (ID `1788362673627`) existem. | Manter escopo separado de `point`, mesmo que um município tenha o mesmo nome. Não criar VLAN a partir de menção em câmera ou ponto; definir região e identidade apenas para uma futura fonte VLAN autônoma aprovada. |
| `general` / rotas | `Trechos de fibra` (ID `1`), `DWDM ativo` (`2`), `Procedimentos` (`3`) e `Backbone` (`1788299829872`). `Trechos de fibra` e `Backbone` podem parecer próximos, mas não são equivalentes comprovados. | Pedir ao NOC a definição de uso de cada categoria e se rota, trecho e backbone são agrupamentos distintos. As dez planilhas não forneceram registros autônomos de rota; nenhuma nova categoria de rota é necessária por esse conjunto. Preservar as quatro atuais. |

`information.category_id` exige categoria existente com escopo adequado no fluxo cadastral. `responsible`, `partner` e `provider` são textos com sentidos distintos; empresa, cliente e gerência não são uma entidade própria no schema. A decisão de categoria **não** resolve automaticamente campos obrigatórios, conflitos ou procedência.

## Procedência dos 14 cadastros locais

Uma investigação adicional encontrou `categorySeeds` (3 linhas), `recordSeeds` (5 linhas) e o `ensureDatabase()` que os inseria quando a base de categorias estava vazia em **`451d14d:db/storage.ts`**, commit inicial do Git. A comparação em memória, sem imprimir os valores, confirmou **ID e todos os campos de seed** nas três categorias e nas cinco informações atuais; escopo/tipo `general`, `details_json={}` nos registros e o horário comum de inserção também são compatíveis. As linhas de categoria `3` e informação `5` têm `updated_at` posterior, mas seus campos atuais ainda coincidem integralmente com o seed. Isso comprova a **origem de demonstração** com a evidência disponível; não prova que o conteúdo técnico subjacente seja falso nem que não tenha sido usado operacionalmente depois.

| Classe | Categorias locais | Informações locais | Tratamento nesta etapa |
|---|---|---|---|
| `DEMONSTRACAO_CONFIRMADA` | `1`, `2`, `3` | `1`–`5` | Origem associada ao seed histórico por comparação integral. Preservar; revisar uso atual e referências antes de qualquer proposta de limpeza. Categorias `1` e `2` têm, respectivamente, três e duas informações vinculadas. |
| `PLANILHA_CONFIRMADA` | Nenhuma | Nenhuma | `import_records` está vazio. Nenhum título coincidente seria prova isolada. |
| `MANUAL_CONFIRMADO` | Nenhuma | Nenhuma | Não há autoria de criação verificável; `data_operations` está vazio e IDs/horários não bastam. |
| `ORIGEM_DESCONHECIDA` | `1788299829872`, `1788362673560`, `1788362673627`, `1788362673679` | `1788299847161`, `1789407709439` | Preservar e pedir evidência de criação ao responsável. A primeira informação usa a primeira categoria desta linha; a segunda usa a categoria VLAN de ID `1788362673560`. |
| `REVISAO_NECESSARIA` | Nenhuma como classe exclusiva | Nenhuma como classe exclusiva | **Todos os 14 IDs** precisam de revisão humana de conteúdo/uso, inclusive os oito de origem demo. |

O relatório da Etapa 15.1 classificava os 14 como `ORIGEM_DESCONHECIDA` porque ainda não havia confrontado esse seed histórico. A tabela acima **atualiza a procedência de oito IDs com evidência nova**, sem alterar o estado do banco nem as classificações das 599 linhas das planilhas. Fixtures de `tests/` e `scripts/homologation-smoke.ts` continuam restritas a bancos isolados e não comprovam origem para os seis IDs restantes. O documento antigo menciona dados de demonstração baseados numa planilha de referência; por isso o operador deve verificar se algum conteúdo ainda é útil antes de discutir limpeza seletiva.

## Fila priorizada para revisão humana

As **599 linhas** continuam em quatro classificações principais da sanitização: 253 incompletas, 80 em duplicidade candidata, 193 conflitantes e 73 incompatíveis/sem estrutura. **Zero estão prontas para importação.** A validação da forma do payload, com categoria sentinela apenas em memória, passou em 202 das 559 linhas estruturadas. Essas 202 se distribuem entre grupos ainda bloqueados: 45 duplicidades, 124 conflitos e 33 incompatibilidades de mapeamento. A fila ordena esses casos primeiro porque podem exigir menos correção de campos obrigatórios; a ordem **não é aprovação** nem escolha da fonte vencedora.

| Prioridade na fila | Grupo de decisão | Linhas | Fontes envolvidas | O que falta |
|---:|---|---:|---|---|
| 1 | Duplicidade candidata com forma válida | 45 | F03, F06, F07 | Confirmar se os pares representam o mesmo ativo/serviço e decidir quais informações preservar por origem. |
| 2 | Conflito com forma válida | 124 | F03, F06, F07, F10 | Resolver valores divergentes por campo e por período, sem eleger uma planilha automaticamente. |
| 3 | Forma válida, mapeamento incompatível | 33 | F07, F10 | Definir destino dos campos seguros sem suporte e revisar semântica; não deslocar conteúdo para observações sem decisão. |
| 4 | Duplicidade candidata com correções de forma | 35 | F03, F04, F07 | Resolver a identidade e obter/corrigir os campos obrigatórios. |
| 5 | Conflito com correções de forma | 69 | F03, F04, F07, F10 | Resolver divergências e corrigir payload. |
| 6 | Incompleto | 253 | F01, F02, F04, F05, F07, F08, F09 | Solicitar campos obrigatórios e validar formato/unidade. |
| 7 | Sem estrutura reconhecível | 40 | F07, F08 | Mapear cabeçalhos/linhas com o dono da fonte; valores brutos não foram exportados. |

As fontes com mais linhas de **forma válida, ainda bloqueadas** são F10 (82/83), F07 (73/99), F06 (39/39) e F03 (8/88). Elas são boas candidatas para uma primeira **rodada de decisão**, especialmente F06, que tem conjunto menor; não são candidatas à importação imediata. F01, F02, F04, F05, F08 e F09 requerem sobretudo correção de campos ou estrutura antes de revalidar.

Os 358 pares candidatos formam **77 grupos de duplicidade** e afetam 273 linhas; 181 pares divergentes formam **54 grupos de conflito** e afetam 193 linhas. As 193 linhas com conflito também pertencem à rede de duplicidades. O CSV de grupos contém, para cada ID `dup-*` ou `conf-*`, os arquivos e todos os localizadores afetados; uma decisão pode alterar a avaliação de várias linhas. “Alta confiança” em um par candidato continua sendo pista, não autorização para unir.
Em **108 dos 131 grupos** há ao menos outro grupo conectado por um membro comum; o campo `grupos_conectados` permite ao revisor localizar esses efeitos antes de confirmar uma decisão.

## Decisões a registrar com o responsável

| Decisão | Informação a confirmar e fontes | Opções permitidas e impacto |
|---|---|---|
| C1 — categoria de ponto | Dimensão de agrupamento, município evidenciado por linha, 47 sem proposta; F02–F04, F06, F07, F09 e F10. | Aprovar município por evidência, definir outra taxonomia, ou deixar linha pendente. Afeta até 459 pontos e exige categorias `point` antes de qualquer importação. |
| C2 — categoria de câmera | Significado da categoria `Megalink`; F01, F05, F08. | Reutilizar com critério, propor novas categorias, ou manter pendente. Afeta 100 câmeras, todas hoje inválidas na forma da API. |
| C3 — rotas/VLANs | Definição de `Trechos de fibra` versus `Backbone`, e de região VLAN; categorias atuais e donos operacionais. | Manter separados, documentar equivalência aprovada, ou redefinir taxonomia futuramente. Não converte referências textuais em cadastros. Pode afetar registros locais existentes. |
| D — duplicidade candidata | Para cada `dup-*`, identidade do ativo/serviço, período e identificadores técnicos independentes; arquivos e localizadores no CSV de grupos. | Confirmar mesmo ativo, confirmar distintos, ou deixar indeterminado. Se forem o mesmo, decidir conteúdo por campo preservando **todas** as origens; não mesclar automaticamente. A decisão pode atingir grupos `conf-*` ligados. |
| F — conflito | Para cada `conf-*`, divergência de endereço, velocidade, IP, parceiro, local ou identificadores e validade temporal; fontes no CSV, valores apenas nos artefatos privados. | Confirmar valor com evidência externa, manter versões por período/serviço, ou manter pendente. Uma escolha pode afetar até todos os membros do grupo e candidatos de duplicidade relacionados. |
| I — campo obrigatório/estrutura | 253 incompletos e 40 sem estrutura; arquivo, aba, linha e responsável da fonte. | Corrigir a fonte ou registrar desconhecido e manter bloqueado. Não preencher por inferência de linha vizinha. |
| M — campo sem destino e segurança | 216 linhas com campo seguro não mapeado; cinco colunas excluídas e três valores omitidos na sanitização; fontes privadas. | Aprovar mapeamento compatível, propor evolução do modelo em etapa própria, ou excluir **somente com decisão explícita** o campo não essencial. Credenciais não entram em campos cadastrais. Pode afetar grupos inteiros. |
| P — procedência local | Oito IDs de origem seed e seis desconhecidos; commit histórico, D1 em leitura, registros de operação disponíveis e responsáveis pelo cadastro. | Confirmar uso atual e preservar, ou futuramente propor limpeza seletiva com IDs, dependências e autorização específica. Sem prova adicional, os seis permanecem `ORIGEM_DESCONHECIDA`. |

Para cada decisão, registrar em local restrito: ID do grupo/localizador, responsável, data, evidência consultada (arquivo/aba/linha e documento de decisão), resultado codificado (`APROVADO`, `CORRIGIR_FONTE`, `DISTINTOS`, `MESMO_ATIVO`, `PENDENTE` ou `INAPLICAVEL`) e IDs de grupos afetados. Não transcrever credenciais nem dados técnicos confidenciais no repositório. Uma decisão `MESMO_ATIVO` não elimina qualquer linha por si só; o plano de conteúdo e rastreabilidade precisa ser revisto separadamente.

## Plano incremental após a revisão

1. Obter as decisões C1–C3 e definir quem pode aprovar cada fonte. Manter os 14 cadastros locais intactos; documentar uso atual dos oito de origem seed e investigar os seis desconhecidos.
2. Começar pelos grupos de prioridade 1–3, preferindo um lote pequeno e rastreável (por exemplo, F06), e registrar decisões por localizador e grupo. Revalidar campos, unidade, período, categoria e ausência de segredos em cada linha aprovada. Contar **linhas realmente liberadas**, não apenas payloads com forma válida.
3. Tratar prioridades 4–7 com correção na fonte ou decisão do dono. Não usar maioria, igualdade de nome/IP, ou uma planilha preferida para resolver conflitos. Regerar uma prévia sanitizada versionada, preservando SHA-256 da fonte e localizadores.
4. Antes de qualquer ensaio de escrita, alinhar o validador do importador ao contrato cadastral, revisar a finalização concorrente de lotes e definir política para correção de uma origem já registrada na 0007. Planejar categoria, fingerprint, hash, lote, revisão, rollback e preservação de ambas as origens em conflitos.
5. Ensaiar **somente em banco isolado** um subconjunto aprovado, com idempotência, duplicidade, integridade, consulta paginada e comparação antes/depois. Preparar backup e recuperação. Importação definitiva ou limpeza seletiva requerem autorização específica posterior.

## Conferências realizadas

- As dez planilhas continuam com SHA-256 igual ao inventário de sanitização (**10/10**).
- A fila priorizada tem **599 localizadores únicos**, sem ausências, duplicatas ou alteração de classificação/códigos em relação à fila da Etapa 15.1.
- Os **131 grupos** apontam somente para localizadores da fila; conexões entre grupos são recíprocas, sem referências desconhecidas.
- A matriz local tem **14 IDs**, sendo oito de origem seed e seis sem origem comprovada. O D1 consultado em leitura continua com 13 migrations, sete categorias, sete informações e as tabelas `import_records`, `import_batches` e `data_operations` vazias.
- Não houve alteração de código de produção; a suíte automatizada, lint e build não foram reexecutados nesta etapa documental. A conferência de formatação do índice com `git diff --check` passou.

Não houve alteração do D1 operacional, planilhas originais, classificações de fonte, usuários, sessões, autenticação, GLPI ou credenciais. Não houve migration, importação, exclusão, commit ou push.

**Continuidade na Etapa 15.3:** as [primeiras quatro fichas e o modelo de decisão em branco](39-Fichas-Iniciais-de-Revisao-de-Dados.md) foram preparados sem alterar esta fila ou suas classificações. A revisão de vínculos encontrou uma referência do chamado local `4` à informação de origem seed `5`; veja o impacto antes de qualquer proposta futura de limpeza.

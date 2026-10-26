# Etapa 15.5 — resolução pendente das divergências do Lote 01

Preparado em 24/10/2026. Este documento organiza a decisão humana sobre quatro pontos de F10. **As quatro fichas permanecem `PENDENTE_APROVACAO_FINAL` e bloqueadas para importação.** Nenhuma declaração preliminar foi convertida em aprovação.

## Base e preservação da evidência

Foram relidos integralmente os documentos [37](37-Preparacao-Dados-Tecnicos-e-Procedencia.md), [38](38-Revisao-Humana-Dados-Tecnicos.md), [39](39-Fichas-Iniciais-de-Revisao-de-Dados.md), [40](40-Avaliacoes-Preliminares-Lote-01.md) e [41](41-Conferencia-Tecnica-Lote-01.md), além das filas, grupos, matriz de procedência, avaliações preliminares e modelo formal das Etapas 15.1–15.3. A Etapa 15.4 registrou a conferência direta da fonte e não criou outro CSV de decisão. Os quatro localizadores são únicos em ambas as filas; a classificação histórica `incompativel_com_api` e o código `speed_unit_missing_or_ambiguous:speed` coincidem entre elas. O modelo formal continua com os campos de decisão, aprovador, data, justificativa e evidência vazios.

**Evidência restrita original:** `Final-Selection-20261016/Lastro-Arquivos-Extras/TODOS OS PONTOS SANTA MARIA DE JETIBA (Fernando TI).xlsx`, F10, aba `Página1`, células `D7`, `D13`, `D36` e `D48`. SHA-256 do arquivo: `486a393deeb83a8dd6be52887594e18b31a71b1ab9183b2ffe13dbb46256ae80`, igual ao inventário privado de 08/10. **O texto integral de cada célula permanece na planilha original privada, sem cópia, edição ou normalização neste repositório.** Os artefatos privados de sanitização conservam o mapeamento por arquivo/aba/linha. Antes de qualquer decisão, o revisor deve confirmar novamente o hash e consultar as células no ambiente restrito; este relatório não reproduz os números, endereços, identificadores ou contatos.

Nas quatro células D há um número seguido do sufixo **`MB`**. A avaliação humana preliminar, registrada separadamente em [40](40-Avaliacoes-Preliminares-Lote-01.md), declara **`Mbps`**. Não há documento disponível que defina `MB` como abreviação informal de `Mbps` nessa planilha. Nenhum valor foi convertido, multiplicado por oito ou substituído. Até haver confirmação documental da convenção aplicável **a cada uma das quatro linhas**, `details.speed` continua bloqueado para aprovação, mesmo que o texto passe pela validação de forma da API.

## Matriz de decisão por ficha

Em todas as linhas, A registra parceiro, B local, C endereço e D velocidade; E (IP) está vazia. Local, parceiro e endereço estão presentes, mas sua exatidão e atualidade não foram aprovadas. A planilha não contém coluna de situação do serviço, ativação ou vigência, nem identificador técnico independente do texto de B. “Ativo” é somente uma declaração do responsável; não significa disponibilidade em tempo real.

| Ficha | Evidência documental confirmada | Declaração humana preliminar | Divergência e informação adicional necessária | Decisão pendente e critério de aprovação definitiva | Situação |
|---|---|---|---|---|---|
| `REV-F10-A1-L7` | F10/`Página1`/A7–D7 têm conteúdo; C7 traz o município por extenso no endereço; D7 termina em `MB`. | Unidade `Mbps`; município Santa Maria de Jetibá; serviço `Ativo`. | Esclarecer a convenção de D7 e conferir o número original em ambiente restrito. Confirmar identidade do serviço, parceiro/endereço atuais e obter prova operacional datada de status e vigência. | O responsável deve decidir a unidade com evidência documental, confirmar os demais campos e a identidade do ponto, verificar duplicidades e aprovar a categoria separadamente. O município textual, sozinho, não conclui a ficha. | `PENDENTE_APROVACAO_FINAL` |
| `REV-F10-A1-L13` | F10/`Página1`/A13–D13 têm conteúdo; C13 traz o município por extenso no endereço; D13 termina em `MB`. | Unidade `Mbps`; município Santa Maria de Jetibá; serviço `Ativo`. | Esclarecer a convenção de D13 e conferir o número original. Confirmar identidade, parceiro/endereço atuais e prova operacional datada de status e vigência. | Mesmos critérios por **esta** linha; a decisão da linha 7 não a aprova automaticamente. Município textual exige conferência do endereço atual. | `PENDENTE_APROVACAO_FINAL` |
| `REV-F10-A1-L36` | F10/`Página1`/A36–D36 têm conteúdo; D36 termina em `MB`. O município declarado não aparece por extenso em B36/C36. | Unidade `Mbps`; município Santa Maria de Jetibá; serviço `Ativo`. | Além da unidade e do número D36, falta documento autorizado que comprove o município. Confirmar identidade, parceiro/endereço e status/vigência datados. | O responsável deve decidir unidade e município **por evidência própria da linha**, depois validar identidade, duplicidades, categoria e situação do serviço. Sem prova de município, não atribuir a categoria proposta. | `PENDENTE_APROVACAO_FINAL` |
| `REV-F10-A1-L48` | F10/`Página1`/A48–D48 têm conteúdo; C48 tem referência geográfica indireta/abreviada, sem nome completo do município; D48 termina em `MB`. | Unidade `Mbps`; município Santa Maria de Jetibá; serviço `Ativo`. | Confirmar documentalmente o município; a referência indireta não basta. Esclarecer unidade e número D48, identidade, parceiro/endereço e status/vigência datados. | Decisão individual sobre município e unidade, seguida de revisão de identidade, duplicidades, categoria e situação. Não expandir abreviação por inferência. | `PENDENTE_APROVACAO_FINAL` |

As linhas 7 e 13 têm **corroboração textual do município no endereço**, sem comprovação de atualidade ou dos demais campos. Nas linhas 36 e 48, Santa Maria de Jetibá continua apenas declaração preliminar até evidência documental suficiente. Nenhuma dessas conclusões se estende às outras linhas de F10.

## Situação do serviço e evidência independente

A fonte F10 e os artefatos de sanitização não registram situação ou período de vigência para estas quatro fichas. Os relatórios de preparação, revisão e sanitização disponíveis são derivados das planilhas; não equivalem a confirmação operacional independente e datada. **Não foi disponibilizado, no material consultado, um registro operacional independente e autorizado que comprove `Ativo` e sua vigência por ponto.** Isso não afirma que tal registro inexista em outros sistemas. Não foi feita consulta ao GLPI real nem presumida ligação entre uma linha de F10 e algum chamado local.

Para cada ficha, a confirmação exige referência restrita a uma evidência autorizada que identifique o mesmo ponto/serviço, responsável pela informação, data ou período de validade e situação naquele período. Uma evidência histórica de serviço ativo não demonstra disponibilidade da rede agora. Se faltar essa prova ou houver divergência, manter a informação e a ficha pendentes, sem inventar data.

## Proposta de categoria, sem criação

| Atributo | Proposta para decisão |
|---|---|
| Nome | `Santa Maria de Jetibá` |
| Escopo | `point` |
| Finalidade | Agrupar **pontos atendidos** cujo município foi confirmado individualmente como Santa Maria de Jetibá; facilitar filtros e revisão, sem atribuir estado do serviço. |
| Critério de atribuição | Exigir identificação do ponto/serviço, `location`, `partner` e `address` verificados, município sustentado por endereço atual ou outra fonte autorizada e ausência de conflito de identidade não resolvido. Nome de arquivo, abreviação ou declaração isolada não bastam. |
| Limite | A aprovação da categoria não aprova registros, velocidades, status, vigência ou os demais pontos de F10. A atribuição de cada linha exige decisão própria. |

O contrato atual aceita o escopo `point`, exige categoria existente de escopo correspondente e campos obrigatórios `details.location`, `details.partner` e `details.address`. Há **zero categorias `point`** no D1 verificado na Etapa 15.4. Esta é uma proposta de taxonomia, não um payload de criação: descrição final, cor conforme o padrão visual existente e aprovação de quem administra as categorias ainda precisam ser definidos antes de uma eventual etapa autorizada. Nenhuma categoria foi criada e nenhum dos até 281 candidatos de município sugeridos na sanitização foi classificado por extensão.

## Decisões objetivas solicitadas ao responsável

1. **Convenção de velocidade:** apresentar documento ou confirmação formal do dono de F10 que defina o significado de `MB` e seu alcance. Para cada uma das quatro células D, conferir o número e decidir se a unidade documentada corresponde a `Mbps`, outra grandeza ou permanece indeterminada. Sem comprovação, manter `details.speed` bloqueado; não converter valores.
2. **Município:** confirmar endereço/município atual das linhas 7 e 13; apresentar prova adicional para 36 e 48. Indicar a fonte e o período a que a informação se refere. Não decidir outras linhas por analogia.
3. **Situação e vigência:** fornecer, por ficha, registro operacional independente, autorizado e datado que identifique o mesmo serviço e sustente a declaração `Ativo`. Distinguir situação contratual/administrativa de disponibilidade em tempo real.
4. **Identidade e cadastro:** confirmar se B representa um ponto/serviço distinto, obter identificador técnico independente se existir, validar parceiro A e endereço C e revisar possíveis duplicidades com outras fontes e cadastros locais.
5. **Categoria:** decidir nome, escopo, finalidade, critérios, descrição e cor da categoria `point`; aprovar ou manter pendente sua atribuição **individual** às quatro fichas.
6. **Aprovação final por ficha:** após resolver as pendências, registrar responsável identificado, data real, justificativa, versão/hash da fonte, referências restritas das provas e registros afetados no processo formal. Até essa decisão expressa, manter as quatro `PENDENTE_APROVACAO_FINAL` e `importacao_liberada=NAO`.

Os cruzamentos da Etapa 15.4 permanecem válidos como triagem: zero grupos `dup-*`/`conf-*` conhecidos, nenhuma coincidência exata normalizada de local ou da combinação local/parceiro/endereço entre os 599 rascunhos, e nenhuma coincidência exata de título/local/endereço nos sete cadastros locais. **Ausência de coincidência exata não prova ausência de duplicidade semântica ou histórica.** Repetir o cruzamento quando houver nova evidência ou correção aprovada, mantendo os localizadores e classificações anteriores rastreáveis.

## Verificações e limites desta etapa

O hash de F10 permanece igual ao inventário. As quatro referências e as declarações foram reconferidas nos artefatos; o CSV formal continua com quatro linhas e campos de aprovação vazios. A classificação e o contrato atual da API não foram alterados. O texto técnico integral ficou somente na fonte privada; este relatório contém referências de células e resultados sanitizados. Não foi obtida evidência independente de vigência, e nenhuma decisão humana definitiva foi registrada. Não houve escrita no D1, migration, importação, exclusão, alteração da planilha original, operação GLPI real, commit ou push **nesta etapa**. O Lote 02 não foi iniciado.

# Etapa 15.1 — preparação dos dados técnicos e procedência

Data: 23/10/2026. Escopo: diagnóstico em leitura, revalidação em memória e simulação sintética. **Nenhuma planilha foi importada, nenhum cadastro foi alterado e nenhuma limpeza foi executada.** O D1 local recuperado foi aberto com SQLite `readOnly: true`; o Worker operacional permaneceu na porta 8787.

## Fontes disponíveis e trabalho anterior

As fontes privadas estão fora do repositório, em `C:\Users\yurit\meus projetos\Final-Selection-20261016\Lastro-Arquivos-Extras`. O inventário `Sanitizacao-20261008/inventario-sanitizado.json` registra o SHA-256 e as abas. **Os hashes das dez planilhas atuais conferiram, 10/10**, com os do inventário. Um documento DOCX de credenciais existe na pasta; foi excluído da análise e não foi aberto.

| ID | Fonte XLSX disponível | Linhas não vazias inventariadas |
|---|---|---:|
| F01 | CAMERAS PMS.xlsx | 30 |
| F02 | checklist pms.xlsx | 35 |
| F03 | Cópia de PONTOS DE ATENDIMENTO SANTA MARIA DE JETIBA ( ANA).xlsx | 88 |
| F04 | Cópia de PREFEITURA DE SANTA TERESA( ANA).xlsx | 57 |
| F05 | endereços cameras pms_corrigido.xlsx | 22 |
| F06 | ESCOLAS SANTA MARIA DE JETIBA.xlsx | 39 |
| F07 | PMSMJ - Pontos e velocidades  2025.xlsx | 99, em três abas |
| F08 | RELAÇÃO DE PONTOS DA NUV.xlsx | 83, em duas abas |
| F09 | RELAÇÃO PREFEITURA MUNICIPAL DE SOORETAMA (PMS).xlsx | 63 |
| F10 | TODOS OS PONTOS SANTA MARIA DE JETIBA (Fernando TI).xlsx | 83 |
| **Total** | **10 arquivos, 13 abas** | **599** |

Foram recuperados `Preparacao-Importacao-20261008`, `Revisao-Importacao-20261008` e `Sanitizacao-20261008`, com relatórios, decisões, inventários, candidatos, conflitos e duplicidades. Os artefatos JSON tratados permanecem na pasta privada: podem conter dados operacionais e **não foram copiados para esta documentação**. A revisão mais recente de 08/10 substitui a contagem anterior de 31 registros “prontos para revisão”: após sanitização reforçada, **zero** permanecem tecnicamente aptos para aprovação. Não foi encontrado relatório final da simulação antiga da Etapa 5; essa lacuna já constava no relatório de sanitização.

A comparação com o D1 usou os localizadores e campos permitidos do JSON sanitizado. Não reextraí valores brutos das planilhas: a conferência dos dez hashes garante que os arquivos encontrados são exatamente os inventariados naquela sanitização, sem transformar a comparação em exposição de colunas excluídas.

O relatório de sanitização excluiu cinco colunas potencialmente confidenciais e omitiu três valores de campos permitidos que acionaram revisão de segurança. Essa filtragem por padrões não garante ausência absoluta de segredo: uma nova revisão humana e uma allowlist continuam necessárias antes de qualquer carga.

## Modelo atual e matriz de compatibilidade

O D1 local contém migrations `0000`–`0012`, incluindo `0007_import_tracking.sql`. A migration 0007 separa `import_batches` e `import_records`, guarda arquivo lógico, SHA-256, aba, linha, fingerprint e referência opcional a `information.id`. A chave de origem é única por arquivo lógico/aba/linha; mudar o conteúdo da mesma posição não autoriza reimportação automática. `data_operations` (0012) protege intenções cadastrais da API, mas não substitui a identidade de origem do importador. As duas tabelas da 0007 e `data_operations` estão vazias no D1 atual.

| Domínio | Fonte encontrada | Destino atual | Compatibilidade e pendência |
|---|---|---|---|
| Rotas e trechos | Nenhuma linha estruturada como rota autônoma nas dez planilhas | `information.kind='general'`, categoria `general`, campos textuais | Aceita documentação de rota; não modela topologia, segmentos ou conexões. Não transformar referência textual a trecho em vínculo cadastral. |
| Pontos atendidos | 459 linhas estruturadas `point` | `information.kind='point'`, `details_json` com local, parceiro e endereço obrigatórios | Não há categoria `point` atual. Endereços, parceiros, unidades de velocidade, datas e campos adicionais precisam de revisão; nenhum ID de categoria foi aprovado. |
| VLANs | Menções como atributos de outras linhas, sem conjunto independente | `information.kind='vlan'`, número e bairro obrigatórios; duas categorias `vlan` | Não criar registro VLAN a partir de menção em câmera/ponto. Exige decisão sobre identidade e região. |
| Câmeras | 100 linhas estruturadas `camera` | `information.kind='camera'`, câmera, bairro e endereço obrigatórios | Nenhuma das 100 passou no validador atual. A categoria `camera` existente não tem atribuição aprovada; campos de fonte sem destino exigem mapeamento. |
| Empresas, gerências e responsáveis | Parceiro, provedor, gerência e contatos em fontes distintas | `information.responsible` e alguns campos de `point.details_json`; não há entidade de empresa | Não equiparar parceiro, provedor, cliente e gerência. Campos seguros sem destino exigem decisão de domínio; não copiar para `notes` por conveniência. |
| Informações técnicas adicionais | ONU, OLT, sinal, IP, MAC, porta, datas e campos livres | `details_json` tem allowlist por tipo e limites; `notes` é texto livre | 216 linhas têm campos seguros sem destino aceito. Validar semântica, unidade e sensibilidade antes de ampliar o modelo. O importador legado valida menos que a API manual. |

O contrato paginado de `GET /api/data` continua aplicando filtros e busca no servidor antes de `COUNT` e `LIMIT/OFFSET`; isso não constitui contrato de importação. `db/import-storage.ts` é infraestrutura de persistência sem parser/upload/fluxo público de revisão. A validação interna do importador não aplica todas as regras de `app/api/data/validation.ts`, inclusive detalhes obrigatórios por tipo: **não usar a biblioteca diretamente com linhas apenas “válidas” em JSON**. As etapas 14.1–14.4 não modificaram o schema nem resolveram essa diferença.
O relatório antigo também apontou que a finalização do lote calcula o estado a partir de uma leitura anterior às últimas operações concorrentes; isso precisa de ensaio e correção antes de uma carga operacional.

## Situação das 599 linhas das fontes

Reexecutei **somente em memória** `validatePayload(..., 'POST')` da versão atual com `categoryId=1` sentinela, sem chamada de API ou consulta de categoria. Entre 559 linhas com tipo reconhecido, **202 passaram e 357 falharam**, exatamente como no relatório sanitizado; 40 linhas continuam sem cabeçalho suficiente. O sentinela testa formato e não identifica uma categoria válida para a linha. Das 202 aceitas, 124 pertencem ao grupo conflitante, 45 ao grupo de duplicidade em revisão e 33 ao grupo incompatível por outros motivos. Nenhuma linha foi aprovada para importação.

| Classificação principal conservadora da sanitização | Linhas |
|---|---:|
| Prontas para importação | **0** |
| Incompletas | 253 |
| Duplicadas em revisão | 80 |
| Conflitantes | 193 |
| Incompatíveis com a API ou sem estrutura | 73 |
| **Total único** | **599** |

As classificações principais não têm dupla contagem. Há 358 pares candidatos a duplicidade em 77 grupos (273 linhas afetadas; 204 pares de alta confiança candidata) e 181 pares com divergências técnicas em 54 grupos (193 linhas afetadas). “Alta confiança” continua sendo pista para revisão, não permissão para unir. A revisão anterior apontava 186 divergências; a sanitização posterior reconfirmou 181, não reconfirmou cinco. Entre pendências recorrentes: velocidade sem unidade clara (256), endereço obrigatório ausente (197), parceiro ausente (167), categoria não justificada (187) e campos seguros sem destino (216). Os códigos por linha estão somente nos artefatos privados. Nenhuma linha foi mesclada ou completada por inferência.

A [fila de revisão por localizador](../evidencias-etapa-15-1/fila-revisao.csv) contém **599 referências únicas**: alias F01–F10, índice da aba no inventário privado, número da linha, tipo, classificação e códigos de pendência. Não contém título, endereço, IP, contato, valor de campo, fingerprint ou credencial. Os índices de aba são baseados na ordem do inventário com hash verificado; consulte a fonte privada para revisar conteúdo.

## D1 local: inventário e procedência

Consulta SQLite em modo somente leitura: `PRAGMA quick_check=ok`, `foreign_key_check` sem linhas, 13 migrations, **7 categorias** (4 `general`, 2 `vlan`, 1 `camera`) e **7 informações** (6 `general`, 1 `vlan`). Não há categoria `point`, informação `camera` ou informação `point`. `import_batches=0`, `import_records=0`, `data_operations=0`. Não foram encontradas duplicatas de título normalizado dentro do mesmo tipo entre as sete informações. Um filtro heurístico de atribuições explícitas de credencial nos campos comuns retornou zero; isso **não certifica** ausência de segredos em texto livre.

| Classe de procedência | Categorias | Informações | Evidência exigida / resultado |
|---|---:|---:|---|
| `DEMONSTRACAO_CONFIRMADA` | 0 | 0 | Não foi localizado seed de produção nem vínculo inequívoco entre fixture e IDs atuais. |
| `PLANILHA_CONFIRMADA` | 0 | 0 | Nenhum vínculo 0007; comparar nome não prova importação. |
| `MANUAL_CONFIRMADO` | 0 | 0 | Sem recibo 0012 ou outro registro de autoria da criação. IDs e horários não comprovam ação manual. |
| `ORIGEM_DESCONHECIDA` | **7** | **7** | Preservar e obter evidência externa de criação/procedência. |
| `REVISAO_NECESSARIA` | 0 | 0 | Nenhuma pista específica permite separar um subconjunto; **todos os 14 desconhecidos exigem revisão humana**. |

Localizadores dos **14 registros com origem desconhecida** (sem reproduzir conteúdo): categorias `1`, `2`, `3`, `1788299829872`, `1788362673560`, `1788362673627`, `1788362673679`; informações `1`–`5`, `1788299847161`, `1789407709439`. A comparação em memória com `dados-sanitizados.json` não encontrou nenhum título normalizado do **mesmo tipo** em comum; mesmo uma eventual coincidência exigiria ao menos outros identificadores técnicos e rastreabilidade de arquivo/aba/linha. Isso não exclui relações conceituais entre registros. As seis informações gerais e a VLAN atual não correspondem aos tipos autônomos extraídos dessas dez fontes (`point` e `camera`).

**Relação de dados fictícios comprovados: vazia. Relação de dados reais confirmados por procedência: vazia.** A documentação antiga menciona dados de demonstração baseados numa planilha de referência, mas não fornece IDs nem prova que qualquer uma das 14 linhas atuais veio de seed. Fixtures de testes e smoke foram encontradas em `tests/` e `scripts/homologation-smoke.ts`; elas usam bancos isolados. Não se demonstrou que seus registros foram inseridos no D1 recuperado. Nenhuma linha deve ser excluída por semelhança com esses exemplos.

## Simulação e limites dos testes

Como **zero linhas reais foram aprovadas**, não houve simulação de escrita/importação de fonte, nem ensaio de fusão, idempotência de lote ou reconciliação transacional com dados das planilhas. O código e os testes existentes do importador foram inspecionados; testes que executam migrations de fixture não foram reexecutados nesta etapa. Antes de simular uma primeira carga, será necessário aprovar categoria, destino dos campos e política para conflitos; depois, testar a mesma origem repetida, hash alterado, concorrência e rollback **somente** em cópia isolada.

Para avaliar a paginação sem tocar dados reais, criei **20.000 informações sintéticas em SQLite `:memory:`**, com as colunas e índices cadastrais relevantes, e invoquei a função real `queryCatalog`. Cada página retornou 20 itens e total de 20.000 (1.000 páginas); um filtro combinado retornou um item. Tempos nesta máquina, numa execução: primeira página **12,41 ms**, página 500 **30,83 ms**, página 1000 **29,29 ms**, busca filtrada **80,05 ms**; `quick_check=ok`. São medidas locais de consulta, sem Worker/rede, sem dados reais e sem teste de carga concorrente. Elas confirmam paginação limitada e sugerem medir busca e páginas profundas em homologação representativa antes de propor novos índices ou cursor. Nenhum SQL de migration foi executado na simulação.

## Plano incremental e tratamento seletivo proposto

1. Manter originais e artefatos tratados privados; registrar hash do arquivo, aba e linha em cada decisão. Rever a allowlist e bloquear credenciais e informações de autenticação, inclusive em campos livres.
2. Pedir aos responsáveis das fontes as decisões sobre 358 pares candidatos, 181 divergências, 40 linhas sem cabeçalho, unidades/datas e 216 linhas com campos sem destino. Registrar decisão por linha/campo; não unir por IP ou nome isolado.
3. Aprovar categorias `point` e a semântica da categoria `camera`; manter categorias existentes sem atribuição inferida. Definir o que representa cada empresa, parceiro, provedor e gerência antes de mapear.
4. Reconciliar os 14 cadastros locais por evidências de criação, arquivo/aba/linha e identificadores independentes. Até lá, preservar todos. O grupo de limpeza seletiva está vazio; se futuramente houver demonstração comprovada, propor IDs exatos, dependências/FKs, backup e revisão humana antes de solicitar autorização específica para limpeza.
5. Unificar/compatibilizar a validação da entrada importada com o contrato cadastral atual antes de escrever. Preparar uma prévia por lote com localização, campos normalizados, classificação e decisão, sem valores sensíveis.
6. Somente com um subconjunto aprovado, ensaiar em cópia isolada: hash e origem 0007, categorias aprovadas, validação, duplicidade, reenvio idempotente, concorrência, rollback, integridade e leitura paginada. Não reutilizar automaticamente a mesma chave de origem quando uma linha corrigida mudar de conteúdo; reconciliar explicitamente.
7. Submeter resultado e plano de recuperação para autorização separada. **Esta etapa não autoriza limpeza nem importação definitiva.**

Não houve alteração de autenticação, GLPI, credenciais, configuração operacional, D1, migrations, usuários, sessões ou chamados; não houve commit ou push.

**Atualização da Etapa 15.2:** o confronto posterior com o seed do commit inicial trouxe evidência nova para reclassificar a **origem** de três categorias e cinco informações como demonstração. A tabela acima é o retrato da evidência disponível ao concluir 15.1; a [matriz atualizada e as decisões de revisão humana](38-Revisao-Humana-Dados-Tecnicos.md) preservam esse histórico sem alterar o D1 ou as classes das 599 linhas de fonte.

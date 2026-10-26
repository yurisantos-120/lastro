# Etapa 16.1 — organização multidimensional dos pontos atendidos

Implementação preparada em 24/10/2026. **A migration 0013 foi aplicada somente em bancos isolados. O D1 operacional recuperado não foi migrado nem recebeu cadastros.** Nenhuma ficha do Lote 01 foi importada; `REV-F10-A1-L7`, `REV-F10-A1-L13`, `REV-F10-A1-L36` e `REV-F10-A1-L48` continuam `PENDENTE_APROVACAO_FINAL`.

## Diagnóstico e escolha do modelo

O modelo anterior guarda um ponto em `information`, com uma categoria e atributos em `details_json`. A categoria era descrita na interface como “Empresa ou cliente atendido”, embora `partner`, `provider`, `responsible` e cliente não sejam conceitos equivalentes. As consultas paginadas já filtravam no servidor por tipo, categoria e texto, ordenando por `updated_at DESC, id DESC` e limitando a página a 100 itens. Não havia município, cliente e região operacional independentes.

O [relatório 43](43-Decisoes-D01-D04-e-Organizacao-de-Pontos.md) propôs catálogos de referência e atribuição 1:1 como modelo definitivo de identidade controlada. Não há, porém, lista canônica ou política aprovada para criar e manter essas três entidades. Nesta etapa incremental, foram acrescentados **três campos opcionais e explícitos ao próprio ponto**: `municipality`, `client` e `operationalRegion`. Eles permanecem em `information.details_json`, separados de categoria, parceiro, provedor e responsável. Nenhuma linha antiga é reclassificada. A interface não preenche valores por inferência.

Para filtrar sem carregar a base, a escrita gera no servidor `municipalityKey`, `clientKey` e `operationalRegionKey`: cópias em minúsculas, sem acentos e com espaços normalizados. O navegador não pode fornecer essas chaves. A migration [0013](../../drizzle/0013_point_dimension_indexes.sql) cria três índices de expressão sobre `kind` e a chave JSON correspondente. Não cria tabelas, dados, categorias nem backfill. Continua a existir **um único registro por ponto**. A integridade de `category_id` e a revisão do registro permanecem as existentes.

**Limite da escolha:** nomes livres não dão a mesma identidade canônica ou integridade referencial dos catálogos propostos em 43. Grafias diferentes além de acentos, caixa e espaços podem produzir grupos distintos. A definição de cliente principal, cardinalidade, nome canônico de município/UF e abrangência de região permanece pendente de decisão operacional. Uma futura adoção de catálogos exigirá etapa própria, conciliação humana e migration autorizada; não pode reinterpretar estes valores automaticamente.

## Contratos de API e interface

- `POST/PUT /api/data` com `kind=record` e `recordType=point` aceitam opcionalmente os três campos em `details`. Cada valor tem limite de 160 caracteres; validação rejeita controles, padrões de credenciais, e-mail, endereço de rede e contatos numéricos evidentes. Os campos não são aceitos para outros tipos. A validação reduz espaços repetidos sem trocar o texto informado por uma inferência. Identidade de sessão, papel `operator`/`admin`, `Idempotency-Key`, revisão e recibo transacional continuam os existentes.
- `GET /api/data?resource=records&kind=point` aceita `municipality`, `client` e `operationalRegion`, isolados ou combinados com `categoryId`, `q`, `page` e `pageSize`. Os filtros são prefixos normalizados sem distinção de acentos/caixa, aplicados no SQL antes de `COUNT`, `LIMIT` e `OFFSET`. Parâmetros repetidos, inválidos ou usados fora de `kind=point` são rejeitados. A leitura mantém os guards atuais e a ordem determinística. Nenhuma lista completa é trazida para filtrar no navegador.
- Na tela **Pontos atendidos**, o formulário apresenta as três dimensões em “Organização do ponto”; os detalhes mostram seus rótulos sem exibir as chaves internas. Três campos de filtro combináveis têm botão individual de limpeza. Ao alterá-los, a página volta à primeira; busca geral, categoria e tamanho de página continuam disponíveis. A navegação, os ícones Lucide, tema e padrões existentes foram preservados.
- Pontos antigos sem dimensões continuam aparecendo na lista sem filtros e na pesquisa geral. Sob um filtro de dimensão, ausência de valor significa que o ponto não corresponde ao filtro. Rotas, VLANs, câmeras, categorias, dashboard, chamados e GLPI não receberam novo contrato.

## Arquivos preparados

| Área | Arquivos |
|---|---|
| Modelo e escrita | `lib/point-dimensions.ts`, `db/data-types.ts`, `db/data-write.ts`, `app/api/data/validation.ts` |
| Consulta | `db/catalog-pagination.ts` |
| Interface | `components/point-dimension-filters.tsx`, `app/page.tsx` |
| Banco | `db/schema.ts`, `drizzle/0013_point_dimension_indexes.sql`, `drizzle/meta/0013_snapshot.json`, `drizzle/meta/_journal.json` |
| Testes e documentação | `tests/point-dimensions.test.ts`, `tests/catalog-pagination.test.ts`, `package.json`, este relatório, `Documentação/README.md`, quatro capturas em `Documentação/evidencias-etapa-16-1/` |

Os documentos 42 e 43 e a edição anterior do índice documental já estavam presentes no Git antes desta etapa; foram preservados.

## Validação efetivamente realizada

| Verificação | Resultado |
|---|---|
| Teste direcionado das dimensões | 5/5 passaram: validação, rollback, criação/edição/replay, filtros/paginação/legados e parâmetros inválidos. |
| Suíte completa | 236/236 passaram. |
| Lint, TypeScript e build | `corepack.cmd pnpm lint`, `corepack.cmd pnpm typecheck` e `corepack.cmd pnpm build`: concluídos sem erro. |
| Migration isolada | Wrangler local com `--persist-to` em diretório temporário exclusivo aplicou 0000–0013. `quick_check=ok`, `foreign_key_check=0`, 14 entradas de migration. |
| Banco sintético e API | Uma categoria e 27 pontos sintéticos; `GET /api/auth/me` com sessão sintética respondeu 200; os três filtros combinados responderam 200, total 23, primeira página 20. O destino GLPI no ambiente isolado apontava para loopback sem serviço. |
| Edge real, Worker isolado | Desktop 1365×900 e celular 390×844, claro e escuro: filtros, rótulos, navegação, 23 resultados e segunda página verificados. Sem rolagem horizontal no celular. Capturas: [desktop claro](../evidencias-etapa-16-1/edge-desktop-light.png), [desktop escuro](../evidencias-etapa-16-1/edge-desktop-dark.png), [celular claro](../evidencias-etapa-16-1/edge-mobile-light.png), [celular escuro](../evidencias-etapa-16-1/edge-mobile-dark.png). |

As capturas e testes de navegação usam apenas dados e sessão sintéticos. Criação, edição, conflito, idempotência e rollback foram exercitados por testes automatizados em SQLite isolado; não se realizou escrita pelo Edge. Não houve chamada ao GLPI real.

## Ativação operacional pendente

1. Revisar e aprovar o contrato de nomes institucionais e a governança das dimensões, especialmente a distinção entre cliente, parceiro, provedor e responsável. A validação sintática não comprova sozinha que um nome livre foi aprovado nem elimina toda possibilidade de dado pessoal ou confidencial.
2. Confirmar backup, estado das migrations até 0012 e validade JSON de `information.details_json` no D1 operacional. Os índices usam `json_extract`; JSON legado inválido impediria a migration e deve ser diagnosticado antes, sem edição automática. O banco identificado nesta sessão possuía JSON válido nos registros consultados.
3. Autorizar separadamente a aplicação **apenas da 0013** no D1 operacional, com plano de rollback e validação posterior. O contrato JSON permite leitura sem o índice, mas os filtros novos podem ter desempenho inadequado antes da migration; a ativação deve ser coordenada.
4. Manter o Lote 01 bloqueado até aprovação final individual e prova suficiente para seus valores. D01–D03 continuam declarações e não preencheram campos automaticamente.

Não foram executados migration operacional, importação, exclusão, operação real no GLPI, alteração de credenciais, commit ou push.

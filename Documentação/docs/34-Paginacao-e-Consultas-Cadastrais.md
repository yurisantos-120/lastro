# Etapa 14.2 — paginação e consultas cadastrais

Data: 23/10/2026. Achado: **D13-02** da auditoria geral consolidada.

## Diagnóstico

`GET /api/data` consultava todas as linhas de `categories` e `information` e enviava `details_json` de todos os cadastros à página inicial. Busca textual, filtros de tipo e categoria, contagens, atualizações recentes, cartões de categoria e seletores de rota/categoria dependiam desse resultado completo. Uma cópia de leitura do backup pós-0012 da Etapa 12 continha **7 categorias e 7 informações** (6 gerais e 1 VLAN); portanto, o problema de escala foi confirmado no código, mas não houve medição de degradação em carga operacional. A tabela `information` tinha índice de categoria e título, sem índice de `updated_at`.

## Contrato implementado

`GET /api/data` mantém a autorização mínima de visualização e exige `resource` explícito. Os recursos são:

| Recurso | Resultado | Parâmetros |
|---|---|---|
| `records` | `records`, `total`, `page`, `pageSize`, `pages` | `page`, `pageSize`, `q`, `kind`, `categoryId` |
| `categories` | `categories`, `total`, `page`, `pageSize`, `pages` | `page`, `pageSize`, `q`, `scope` |
| `routes` | `routes` (`id`, `title`), `total`, `page`, `pageSize`, `pages` | `page`, `pageSize`, `q` |
| `summary` | contagens por tipo, total de categorias e oito atualizações recentes | nenhum |
| `record`, `category` | registro individual ou `null` | `id` |

Página inicial 1, tamanho inicial 20 e máximo 100; página máxima 100000. `q` aceita até 160 caracteres, com `%`, `_` e barra invertida tratados como texto literal. Parâmetros inválidos, duplicados ou estranhos retornam HTTP 400, código `INVALID_CATALOG_QUERY`. `GET /api/data` sem `resource` também retorna 400; esse é o único rompimento intencional do contrato antigo. Todos os consumidores internos foram migrados. Respostas GET usam `Cache-Control: no-store`.

Filtros são aplicados no SQL antes de `COUNT(*)` e `LIMIT/OFFSET`. As consultas paginadas usam `db.batch` para contagem e linhas, com ordem determinística `updated_at DESC, id DESC` nas informações e `created_at ASC, id ASC` nas categorias. O vínculo categoria/quantidade é consultado por linha da página; o seletor de rotas recebe somente `id` e `title`. A busca percorre campos textuais existentes, nome da categoria e `details_json`; não carrega a base inteira em memória. O resumo consulta agregados e apenas oito linhas recentes.

O dashboard operacional de chamados segue seu contrato próprio. Formulários e seletores consultam páginas limitadas e permitem busca; quando o item selecionado não está na página atual, consultam apenas aquele item. Revisão, escrita idempotente, autenticação, permissões e tratamento de falhas de schema não mudaram. Nenhuma migration ou alteração do D1 operacional foi feita.

## Interface e comportamento

Rotas, VLANs, câmeras, pontos, pesquisa e categorias usam paginação, total, tamanho por página e filtros persistentes durante a troca de páginas. Pesquisa global e busca de categorias têm debounce; a mudança de filtro volta à página 1. A Visão geral usa apenas contagens e atualizações recentes. Há estados de carregamento, erro com nova tentativa e lista vazia; o filtro permanece acessível durante falhas. Uma atualização manual consulta novamente a página. A interface avisa que inclusões e edições entre consultas podem alterar a distribuição das páginas.

Paginação por deslocamento oferece ordem determinística para cada consulta, mas **não é um snapshot imutável entre requisições**. Se outra pessoa criar ou editar um cadastro entre páginas, uma linha pode mudar de página; a atualização manual ou uma nova busca recalcula total e ordem. Paginação por cursor/snapshot exigiria outro contrato e só deve ser considerada se a operação justificar esse custo. Busca com `LIKE` e ordenação por `updated_at` podem exigir índices específicos quando a cardinalidade crescer; medir latência e plano de consulta antes de criar migration.

## Validação

- Banco SQLite em memória com schema até **0012** e 51 informações sintéticas: primeira, intermediária e última página; totais e ordem estável; filtros combinados de tipo/categoria/texto; acentos e curingas literais; seletores limitados; novas linhas e edição entre leituras; limites inválidos e autorização. GET executou apenas `SELECT` e não criou linhas.
- Suíte completa: **231 testes aprovados**. Lint, TypeScript e build aprovados. Build em cópia isolada sem `.env`, `.wrangler` nem banco operacional; aviso conhecido do Vinext sobre classificação estática de rotas dinâmicas.
- Durante a finalização, uma tentativa de build com o Worker isolado ainda ativo falhou com `EPERM` no `dist` temporário. Uma tentativa subsequente no diretório do projeto também recebeu `EPERM` porque o `dist` operacional estava em uso. Nenhuma dessas tentativas concluiu; o build final foi executado com sucesso na cópia isolada após parar apenas o Worker de homologação. O Worker operacional permaneceu na porta 8787 e `GET /api/auth/me` anônimo respondeu HTTP 200 depois do incidente.
- Edge real em `127.0.0.1:8788`, com Worker e D1 **isolados**. O schema foi copiado sem dados do backup pós-0012, seguido de **57 informações, 3 categorias, um usuário e uma sessão sintéticos** na cópia. Depois, foram acrescentadas **35 categorias sintéticas** para exercitar o seletor com várias páginas. `integrity_check=ok`, `foreign_key_check` vazio. A API retornou página 1 com 20 de 57 informações; a tela de Rotas mostrou **53 resultados em três páginas**, página 2 iniciando em `Rota sintética 033` e a última contendo `Rota sintética 001`; busca por `Rota sintética 005` retornou um resultado. O seletor ocultou controles quando havia uma página e os mostrou com **36 categorias gerais em duas páginas**; a página 2 trouxe as categorias 33–38. O formulário preservou a categoria 38 escolhida mesmo após a busca mudar. Visão geral, cartões de categorias e formulário de rota foram abertos; nenhum formulário foi enviado. Temas claro/escuro e largura de 390 px foram conferidos, sem rolagem horizontal.
- Capturas reais do Edge preservadas em `Documentação/evidencias-etapa-14-2`: [última página no tema escuro](../evidencias-etapa-14-2/edge-final-routes-last-dark.png), [categorias no tema claro](../evidencias-etapa-14-2/edge-final-categories-light.png), [formulário com uma página no seletor](../evidencias-etapa-14-2/edge-final-route-form-light.png), [segunda página do seletor](../evidencias-etapa-14-2/edge-final-form-picker-page2.png) e [lista móvel](../evidencias-etapa-14-2/edge-final-mobile-list-light.png). Capturas adicionais da primeira rodada continuam na pasta temporária `lastro-catalog-build-a8949dbe83b94a98bc202e5f6ec97ad0`.

O Edge foi usado somente contra a cópia sintética. A instância operacional em `127.0.0.1:8787` e seu D1 não foram usados nesses testes. Não houve chamada real ao GLPI, migration, alteração de credenciais, commit ou push.

## Arquivos principais

`db/catalog-pagination.ts`, `db/storage.ts`, `db/persistence.ts`, `app/api/data/route.ts`, `app/api/data/handlers.ts`, `app/page.tsx`, `components/catalog-category-picker.tsx`, `components/catalog-route-picker.tsx`, `components/tickets-section.tsx`, `components/ticket-operations-panel.tsx`, `tests/catalog-pagination.test.ts`, `tests/data-api.test.ts`, `tests/data-operations.test.ts`, `tests/persistence.test.ts` e `package.json`.

## Pendências

Medir desempenho com volume representativo antes de decidir sobre índice de ordenação, busca especializada ou cursor. A seleção de rota vinculada a chamado foi validada pela API e por testes automatizados; não havia chamado sintético na sessão visual para abrir esse painel no Edge. Gravação cadastral não foi executada no navegador nesta etapa; a suíte automatizada cobre criação, edição, revisão e idempotência. Nenhuma outra correção da auditoria foi iniciada.

**Atualização da Etapa 14.4:** a lógica duplicada dos seletores foi compartilhada em `components/use-catalog-picker.ts`, e os tipos cadastrais passaram a vir de `db/data-types.ts`. O contrato paginado descrito acima permaneceu inalterado. Ver [revisão arquitetural pontual](36-Revisao-Arquitetural-Pontual.md).

# Etapa 16.3 — ativação controlada da migration 0013

Data: 24/10/2026. **Resultado: `0013_point_dimension_indexes.sql` foi aplicada exclusivamente ao D1 local recuperado do Lastro.** A integridade e a preservação lógica dos dados anteriores foram verificadas. Não houve acesso a D1 remoto, GLPI real, importação, alteração cadastral, categorias automáticas, mudança das fichas do Lote 01, commit ou push.

## Banco efetivamente utilizado

| Item | Valor confirmado |
|---|---|
| Projeto | `C:\Users\yurit\meus projetos\lastro` |
| Binding / nome lógico | `DB` / `site-creator-d1` |
| Configuração | `wrangler.d1.local.jsonc` |
| ID local | `00000000-0000-4000-8000-000000000000` |
| Persistência | `.wrangler/state/v3/d1/miniflare-D1DatabaseObject` |
| SQLite físico | `faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite` |

O starter do runtime também aponta explicitamente para `.wrangler/state` com `--local`. Não havia Worker do Lastro, listener local ou processo operacional escrevendo na persistência durante a captura e a aplicação. O Git já continha as alterações de desenvolvimento e documentação das etapas anteriores; elas foram preservadas.

## Pré-condições aprovadas

- Os relatórios 44, 45 e as ativações controladas das Etapas 7 e 12 foram consultados.
- O SQL da 0013 possui SHA-256 `A67F9722AE3B11992CE41030835D7656E6935B868995D9248B84758B0256178F` e contém somente os três `CREATE INDEX` previstos. Não contém comandos de dados, alteração de tabelas, categorias, seed ou importação.
- O histórico real tinha exatamente 13 migrations, de 0000 a 0012, sem duplicidade. O Wrangler local listou exclusivamente `0013_point_dimension_indexes.sql` como pendente.
- Antes da aplicação, `integrity_check` retornou `ok`, `foreign_key_check` não retornou linhas e não havia `details_json` inválido.
- Os sete cadastros existentes não tinham `municipality`, `client` ou `operationalRegion`; não havia ponto cadastrado. Assim, a migration não recebeu nem interpretou dados de dimensão.
- O arquivo SQLite principal anterior tinha SHA-256 `020FBD6AD68764A7ED2BA29A92EAE64396869CF7017A0260E3D13B81FFD37957`.

## Backup e restauração

O backup validado desta ativação está em:

`C:\Users\yurit\Lastro-backups\etapa16-3-20261024T153430Z`

Ele preserva o SQLite, WAL, SHM e os três arquivos de metadados. Também contém `snapshot.sqlite`, gerado pela API SQLite de backup, e `restore-test.sqlite`, cópia restaurada de forma independente. A coorte física teve hashes iguais aos arquivos operacionais no instante da cópia, e o snapshot/restauração preservaram integralmente o estado lógico: integridade, FKs, 13 migrations, tabelas, contagens e digests das linhas.

Uma primeira captura da Etapa 16.3 foi preservada, mas não utilizada como referência de recuperação: a conexão de leitura usada para gerar seu snapshot atualizou o seu próprio `-shm` após a cópia. Não houve mudança do SQLite principal, WAL ou dados. A coorte posterior acima foi criada com a ordem corrigida e teve os seis hashes confirmados contra a origem.

Antes da aplicação operacional, uma cópia restaurada recebeu a 0013 em `simulation-state`. A simulação retornou sucesso, preservou dados e schema das tabelas de aplicação, manteve as triggers e confirmou o uso do índice por consulta de leitura.

Após a aplicação real, o diretório `after-namespace` e `after-snapshot.sqlite` foram capturados no mesmo backup. Os hashes da coorte posterior também coincidem com a persistência operacional. O snapshot posterior tem SHA-256 `947E2D6F15A968DFD55ED481A017EDAF2A0BA39AA1B754C211390B57030D2A63`.

## Aplicação executada

O comando foi executado uma vez, no diretório do projeto:

```powershell
node node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --local --config "C:\Users\yurit\meus projetos\lastro\wrangler.d1.local.jsonc" --persist-to "C:\Users\yurit\meus projetos\lastro\.wrangler\state"
```

O Wrangler 4.92.0 informou `Resource location: local`, o ID local esperado e exibiu somente `0013_point_dimension_indexes.sql`. A execução concluiu com quatro comandos e status de sucesso. Não foi usado `--remote`.

## Estado posterior e preservação

`d1_migrations` passou de 13 para 14 entradas, preservando 0000–0012 e acrescentando somente:

`0013_point_dimension_indexes.sql`

Os índices presentes são:

- `idx_information_point_municipality_key`
- `idx_information_point_client_key`
- `idx_information_point_region_key`

`integrity_check` continuou `ok` e `foreign_key_check` permaneceu vazio. O Wrangler local passou a informar que não há migrations pendentes.

| Dados de aplicação | Antes | Depois | Comparação lógica |
|---|---:|---:|---|
| Usuários | 1 | 1 | Digest preservado |
| Sessões | 8 | 8 | Digest preservado |
| Tickets | 4 | 4 | Digest preservado |
| Categorias | 7 | 7 | Digest preservado |
| Informações | 7 | 7 | Digest preservado |
| Operações GLPI | 1 | 1 | Digest preservado |
| Eventos GLPI | 2 | 2 | Digest preservado |
| Operações de ticket | 1 | 1 | Digest preservado |
| Eventos de ticket | 1 | 1 | Digest preservado |
| Importações, RFOs e passagens | 0 | 0 | Sem registros novos |

Todas as tabelas de aplicação mantiveram schema e digest de linhas. As 15 triggers permaneceram idênticas. Nenhuma linha de `information` recebeu município, cliente ou região, e `import_records` continua vazio. A mudança física ficou no WAL e no histórico D1; por isso o hash do arquivo principal ainda aparece igual ao anterior, enquanto o WAL posterior contém o estado da migration. O conjunto SQLite/WAL/SHM deve sempre ser preservado junto.

Uma consulta somente de leitura por município passou a usar `idx_information_point_municipality_key`; a ordenação continua usando estrutura temporária, pois a ordem pública é `updated_at DESC, id DESC`. Como não há pontos locais, isso comprova a seleção estrutural do índice, sem medir desempenho em volume real.

## Testes executados

| Verificação | Resultado |
|---|---|
| Testes direcionados de dimensões, paginação e contrato | Incluídos na suíte completa, aprovados |
| Suíte automatizada | **236 passaram, 0 falhas** |
| Lint | Aprovado |
| TypeScript | Aprovado |
| Build | Aprovado |
| Simulação da migration em cópia restaurada | Aprovada |
| Consulta de leitura com índice no banco ativado | Aprovada |

Os testes que escrevem dados usam bancos isolados ou memória. Nenhum teste criou dado no D1 operacional, não houve autenticação contra GLPI real e não foram feitas chamadas reais ao GLPI. O build exibiu apenas o aviso conhecido do Vinext sobre classificação estática de rotas dinâmicas, sem falha.

## Limites e recuperação

Não houve falha de aplicação nem necessidade de recuperação. Se surgir inconsistência posterior, o procedimento é parar o runtime, preservar o estado atual e seus sidecars, e solicitar autorização específica antes de restaurar o backup validado. Não remover WAL/SHM, não editar `d1_migrations` e não reaplicar manualmente a 0013.

Os quatro localizadores do Lote 01 permanecem `PENDENTE_APROVACAO_FINAL`; esta ativação não criou categorias, nomes canônicos, importações ou qualquer inferência de dados. O próximo trabalho exige nova instrução específica.

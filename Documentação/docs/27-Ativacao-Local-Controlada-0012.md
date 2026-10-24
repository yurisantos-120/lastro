# Etapa 12 — ativação local controlada da migration 0012

Data: 23/10/2026. **Resultado: `0012_data_operations.sql` aplicada exclusivamente no D1 local recuperado, com preservação verificada.** Não houve operação em D1 remoto, produção ou GLPI real. Runtime permanece parado. Não houve alteração cadastral no banco local, credenciais, commit ou push.

## Alvo e pré-condições

Foram lidos os relatórios das Etapas 6, 7 e 11, incluindo o [contrato de idempotência](26-Confiabilidade-e-Idempotencia-Cadastral.md). Projeto: `C:\Users\yurit\meus projetos\lastro`. Configuração explícita `wrangler.d1.local.jsonc`, binding `DB`, nome `site-creator-d1`, ID local `00000000-0000-4000-8000-000000000000`, persistência `.wrangler/state/v3/d1/miniflare-D1DatabaseObject` e arquivo `faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite`.

Portas de runtime 8787, 3000 e 8899 sem listener antes do backup e ao encerrar. Os seis arquivos físicos do namespace (banco, WAL, SHM e metadados) tinham os mesmos SHA-256 registrados ao término da Etapa 11. O histórico real continha exatamente 0000–0011, com prefixo e schema esperado; `data_operations` ainda não existia. Wrangler listou **somente 0012** como pendente. O SQL integral foi revisado: cria a tabela `data_operations`, FK para `users`, checks de método/tipo/hash/JSON e índice `idx_data_operations_actor_time`; não altera tabelas antigas. Journal e snapshot 0012 estavam presentes. As diferenças legadas de DDL das chaves inteiras de categorias/informações permanecem as mesmas documentadas na Etapa 6.

## Backup, restauração e simulação

Evidências privadas e backup em `C:\Users\yurit\Lastro-backups\etapa12-20261023T122951Z`. A primeira tentativa de captura foi interrompida antes de criar cópia porque o método de hash usado não conseguia ler os arquivos bloqueados pelo próprio script. O método foi corrigido e as seis fontes foram mantidas sob locks exclusivos enquanto eram verificadas e copiadas para `before-namespace`. Os hashes das cópias coincidiram com as fontes. O WAL de aplicação, com 346.112 bytes no estado inicial, foi incluído. Nenhum backup anterior foi sobrescrito.

`backup.sqlite` foi gerado pela API SQLite de backup a partir da coorte; SHA-256 `7cd2cabc59f8301b83d7f4124d384f26d9849655d6bb1f8278d6ce8faa0baed3`. `restore-test.sqlite` foi criado separadamente e comparado quanto ao catálogo, histórico e hashes de todas as linhas e colunas anteriores: igualdade integral. Antes da aplicação, `integrity_check=ok`, `foreign_key_check` vazio, 12 migrations e ausência do ledger. Manifestos e inspeções: `before-files.json`, `before-inspection.json`, `preflight.json`.

Uma cópia da coorte foi aplicada em `simulation-state`, com configuração local explícita. O Wrangler exibiu exclusivamente `0012_data_operations.sql` e concluiu com sucesso. A inspeção confirmou 13 migrations, ledger vazio, índice esperado, integridade e FKs, prefixo histórico e todos os dados anteriores idênticos. Evidência: `simulation-apply.log` e `simulation-verification.json`.

Em `synthetic-smoke.sqlite`, cópia separada da simulação, a implementação real do repositório foi exercitada com uma identidade autorizada já existente: duas criações concorrentes com a mesma chave geraram um registro e o mesmo recibo; edição repetida manteve uma única revisão adicional; reutilização da chave com outro payload foi recusada. `integrity_check=ok` e nenhuma violação FK. Apenas essa cópia recebeu categoria sintética. Evidência: `synthetic-smoke.json`. Os testes da Etapa 11 complementam o smoke com abas reais, perda de resposta e os quatro tipos de registro.

## Aplicação no D1 local

Antes de aplicar, portas e hashes da origem foram reconferidos, e a listagem local novamente mostrou somente 0012. Comando executado uma vez, do diretório `lastro`:

```powershell
node node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --local --config wrangler.d1.local.jsonc --persist-to '.wrangler/state'
```

Wrangler 4.92.0 informou `Resource location: local`, ID local esperado, três comandos executados e `0012_data_operations.sql` concluída. Não foram executados seeds, importações ou migrations anteriores. Evidência: `local-pending.log` e `local-apply.log`.

## Estado final e preservação

O histórico real tem **13 entradas, 0000–0012**, com as 12 anteriores inalteradas. Na coorte pós-aplicação, `PRAGMA integrity_check=ok`, nenhuma violação de FK, SQL da tabela igual à simulação e índice presente. O ledger está vazio. O catálogo anterior permaneceu igual; todas as linhas e colunas das tabelas anteriores foram comparadas por contagem e hash integral. O estado posterior está em `after-namespace`, `after.sqlite`, `after-files.json` e `post-verification.json`. Os hashes operacionais continuaram estáveis depois dos testes.

| Registro anterior | Antes | Depois |
|---|---:|---:|
| `users` | 1 | 1 |
| `sessions` | 7 | 7 |
| `tickets` | 3 | 3 |
| `categories` | 7 | 7 |
| `information` | 7 | 7 |
| `auth_bootstrap` | 1 | 1 |
| Tabelas operacionais das etapas 1–5 | 0 em cada | 0 em cada |
| `data_operations` | Ausente | 0 |
| `d1_migrations` | 12 | 13 |

O primeiro bloqueio exclusivo de `-shm` na coleta pós-aplicação foi registrado em `postcopy-interruption.json`, antes de qualquer recuperação. Não houve restauração, reaplicação ou correção no banco. Uma captura subsequente com hashes antes e depois da cópia foi estável e permitiu a inspeção SQLite completa. A consulta read-only do histórico via Wrangler também confirmou 0012. Os sidecars foram preservados; não houve remoção ou checkpoint forçado.

## Testes e limites

| Verificação | Resultado |
|---|---|
| Suíte completa | 219 testes passaram; zero falhas |
| Lint | Aprovado |
| TypeScript | Aprovado |
| Build Vinext | Aprovado; aviso conhecido de classificação estática de rotas |
| Smoke sintético na cópia atual migrada | Criação concorrente, edição repetida, chave divergente, integridade e FKs aprovados |

Logs: `tests.log`, `lint.log`, `typecheck.log`, `build.log`. Uma primeira chamada de verificação tentou `pnpm`, indisponível no PATH desta sessão; os quatro checks foram executados pelas ferramentas Node instaladas e seus resultados próprios registrados. `final-state.json` confirma portas de runtime fechadas e hashes posteriores estáveis. O Git já continha alterações anteriores; foram preservadas. Este relatório e o link no índice são as únicas alterações de código/documentação desta etapa.

Não se utilizou sessão ou credencial operacional para escrever cadastros. Autenticação, dashboard, turnos, RFO e integração GLPI continuam cobertos pela suíte existente; não foi realizado fluxo interativo contra o banco local nesta etapa. HTTPS/GLPI real e D1 remoto permanecem fora da homologação. Não iniciar outra etapa automaticamente.

# Etapa 6 — diagnóstico, backup e homologação isolada do D1

Data: **22/10/2026**. Escopo concluído: identificação, backup, restauração, simulação e verificações. **Nenhuma migration foi aplicada ao banco operacional. Nenhum dado operacional foi modificado, excluído ou importado por esta etapa. Não houve operação real no GLPI, commit ou push.**

## 1. Banco e runtime identificados

Projeto: `C:\Users\yurit\meus projetos\lastro`.

| Configuração | Valor conferido |
|---|---|
| Binding do runtime | `DB` |
| Nome lógico D1 local | `site-creator-d1` |
| Identificador local | `00000000-0000-4000-8000-000000000000` |
| Raiz de persistência | `C:\Users\yurit\meus projetos\lastro\.wrangler\state` |
| Diretório físico D1 | `.wrangler\state\v3\d1\miniflare-D1DatabaseObject` |
| Arquivo operacional | `faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite` |

Caminho absoluto do banco:

```text
C:\Users\yurit\meus projetos\lastro\.wrangler\state\v3\d1\miniflare-D1DatabaseObject\faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite
```

A identificação não dependeu apenas do nome ou da existência de um arquivo. Foram cruzados `.openai/hosting.json`, `vite.config.ts`, `dist/server/wrangler.json`, `.wrangler/deploy/config.json`, `scripts/start-worker.mjs` e `wrangler.d1.local.jsonc`. O algoritmo HMAC do Miniflare **instalado** (`miniflare-D1DatabaseObject` + ID lógico acima) produz exatamente esse nome físico. O Windows Restart Manager identificou o processo 5320 com o `metadata.sqlite` desse namespace aberto; ele e o Worker 13388, que atendia a porta 8787, eram filhos do supervisor 17496.

Os outros arquivos `metadata.sqlite` de cache/estado não foram confundidos com o banco de aplicação. O ID acima é a configuração **local**, não uma identificação comprovada de banco remoto em Cloudflare.

O Windows recusou o encerramento do runtime nesta sessão. O usuário então confirmou a parada com Ctrl+C. Antes do backup foram confirmadas a ausência dos três processos e da escuta em 8787; os arquivos foram lidos com locks exclusivos contra novos acessos. Nenhum SQLite operacional foi aberto pelo mecanismo SQLite: inspeção SQL ocorreu somente sobre cópias.

**Estado ao encerrar a etapa:** runtime operacional e Worker isolado parados. Não foi reiniciado automaticamente o Lastro.

## 2. Histórico real e migrations

`d1_migrations` possui **7 registros**, na sequência exata de arquivos 0000–0006. Aplicações registradas entre 05/10/2026 e 08/10/2026. Não há registro duplicado, lacuna de nome ou migration desconhecida. `d1_migrations` não guarda checksum; nomes e schema permitem verificar coerência, mas não provar retrospectivamente os bytes executados em cada aplicação antiga.

O journal Drizzle contém 12 entradas, índices 0–11, coerentes com os nomes dos SQLs. Todos os snapshots existem e a cadeia `id/prevId` está íntegra. Datas de geração do journal não são datas de aplicação. ID sequencial de `d1_migrations` também não é o índice zero-based do journal.

| Migration | Journal | Banco operacional | Simulação isolada |
|---|---:|---|---|
| `0007_import_tracking.sql` | 7 | Pendente; tabelas ausentes | Aplicada com sucesso |
| `0008_ticket_operations.sql` | 8 | Pendente; tabelas ausentes | Aplicada com sucesso |
| `0009_shift_handoffs.sql` | 9 | Pendente; tabelas ausentes | Aplicada com sucesso |
| `0010_ticket_rfo.sql` | 10 | Pendente; tabelas ausentes | Aplicada com sucesso |
| `0011_glpi_reconciliation.sql` | 11 | Pendente; tabelas/coluna ausentes | Aplicada com sucesso |

Não foi encontrado caso de 0007–0011 registrado sem schema correspondente ou de objetos dessas migrations já existentes sem registro. Nenhum SQL, snapshot ou entrada do journal foi alterado nesta etapa. Os SHA-256 de todos os SQLs estão em `migration-plan.json`, no diretório protegido da evidência.

### Diferenças legadas encontradas

Comparar a instalação recuperada com a reconstrução vazia a partir de 0000–0006 mostra:

- `categories.id` e `information.id`: `INTEGER PRIMARY KEY` no banco recuperado, enquanto o SQL Drizzle explicita também `NOT NULL`. `PRAGMA table_info` informa `notnull=0` versus `1`. Para essas PKs inteiras que são aliases de rowid, SQLite gera ID ao inserir NULL; não há usuário/ticket sem identidade sendo corrigido ou removido aqui.
- Diferenças de aspas, espaçamento e ordem textual de declarações em categorias, informações e seus dois índices. Colunas, defaults, índices e FKs foram inspecionados; as FKs coincidem. O bootstrap de schema em `db/persistence.ts` ajuda a explicar a coexistência de declarações históricas diferentes das migrations.

Essas diferenças estão preservadas e registradas em `baseline-differences.json`, sem refatorar ou reconstruir tabelas. Não impediram as cinco migrations aditivas. O relatório não afirma identidade textual de todo o schema legado com uma instalação nova; exige revisão dessa condição no aceite operacional.

## 3. Backup consistente e verificável

Diretório protegido, fora do Git:

```text
C:\Users\yurit\Lastro-backups\etapa6-20261022T211731Z
```

ACL sem herança externa: controle completo somente para `YURI\yurit` e `SYSTEM`, herdado pelos arquivos de dados. Não compartilhar esse diretório como documentação pública: contém dados recuperados e hashes de sessões. Não foram lidos arquivos `.env`/`.dev.vars` nem exibidos conteúdos de usuários, sessões, tickets ou informações.

Arquivos de recuperação:

| Caminho relativo ao backup | Finalidade |
|---|---|
| `manifest.json` | Origem, parada, locks, arquivos, tamanhos e SHA-256 |
| `raw\faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite` | Cópia física exata do banco parado |
| `namespace-offline\` | Cópia adicional do namespace D1, incluindo banco, `metadata.sqlite` e sidecars presentes |
| `backup.sqlite` | Backup SQLite canônico anterior às migrations, incluindo o estado lógico completo |
| `restore-test.sqlite` | Restauração separada validada contra o backup |

A cópia física inicial foi verificada em **22/10/2026 às 21:17:58 UTC**, com runtime parado, locks exclusivos e comparação SHA-256. Banco de aplicação: **102.400 bytes**, sem `-wal` ou `-shm` presentes após a parada. A cópia adicional do namespace, feita ainda com o runtime parado, também tem o mesmo hash do banco; inclui `metadata.sqlite` de 8.192 bytes, `metadata.sqlite-shm` de 32.768 bytes e `metadata.sqlite-wal` de tamanho zero. Esse WAL é do arquivo auxiliar, não do banco de aplicação.

SHA-256 do arquivo operacional e da cópia física:

```text
d4895e28d5cdba43ff2b86ba1a2b19a8901bf598d12de3964861cb0fe1fb8e26
```

SHA-256 de `backup.sqlite`:

```text
7c574eb4eb074e518b67a0d6d41c3119a0f2ef4ee4d3f778d3684eeb99926015
```

O backup canônico foi produzido pela API SQLite de backup a partir da cópia física. Seu hash de arquivo pode diferir por layout/cabeçalho; os hashes lógicos de **todas as colunas e linhas**, schema e histórico foram comparados na restauração e coincidem. O arquivo físico original manteve seu SHA-256 até a verificação final.

### Resultado da restauração

`restore-test.sqlite` foi criado em caminho separado e aberto somente para leitura. `PRAGMA integrity_check=ok`, `foreign_key_check` vazio, contagens, conteúdo lógico integral, schema e histórico iguais à cópia anterior às migrations. O arquivo operacional não foi substituído para testar a restauração.

## 4. Simulação das migrations no D1 local

Foi usada uma cópia do código sem `.env`, `.dev.vars` ou estado operacional, em:

```text
C:\Users\yurit\AppData\Local\Temp\lastro-stage6-check-e00fc6e1-f7db-4ec3-9365-6bcc023d54fc
```

Estado D1 **exclusivamente de simulação**:

```text
C:\Users\yurit\Lastro-backups\etapa6-20261022T211731Z\simulation-state
```

O Wrangler **4.92.0 instalado** aplicou 0007–0011 com `--local`, configuração descartável e `--persist-to` apontando explicitamente ao diretório acima. Não foi usada a persistência do projeto. A simulação usou os arquivos SQL originais e os dados recuperados, sem backfill fictício.

| Verificação | Antes | Depois da simulação |
|---|---:|---:|
| Categorias | 7 | 7, conteúdo original idêntico |
| Informações | 7 | 7, conteúdo original idêntico |
| Usuários | 1 | 1, conteúdo original idêntico |
| Sessões | 7 | 7, conteúdo original idêntico |
| Tickets | 3 | 3, colunas originais idênticas |
| Bootstrap | 1 | 1, conteúdo original idêntico |
| Histórico de migrations | 7 | 12; prefixo anterior intacto |
| Tabelas, incluindo auxiliares D1 | 8 | 18 |
| Índices nomeados não internos SQLite | 11 | 32 |
| Triggers | 0 | 15 |
| Relações FK declaradas | 2 | 21 |
| Violações FK | 0 | 0 |
| Integridade | `ok` | `ok` |

As dez tabelas novas ficaram vazias na simulação principal. `tickets.creation_fingerprint` ficou NULL nos três tickets anteriores: nenhum dado fictício ou hash retroativo foi inventado. Schema, índices e triggers novos coincidem com a reconstrução de referência; declarações legadas foram preservadas.

`_cf_METADATA` conservou uma linha, mas seu conteúdo mudou **na cópia**, porque o D1 atualiza metadados internos de escrita/bookmark. Isso foi registrado separadamente, não confundido com alteração de usuários, sessões ou tickets. O banco operacional manteve o hash original.

As verificações SQL de catálogo/integridade usaram Node SQLite 3.53.4 sobre cópias. A aplicação das migrations foi realmente executada pelo D1 local/Workerd. Nele, `PRAGMA foreign_keys` retornou **1** e `foreign_key_check` não retornou violações. A consulta `sqlite_version()` foi recusada pelo autorizador D1; portanto a versão SQLite do Workerd não foi inferida da versão Node.

### WAL e teste de falha

A simulação deixou WAL de aproximadamente 342 KB no banco D1 isolado. Copiar somente o `.sqlite` dessa simulação não inclui necessariamente as migrations ainda no WAL. Esse problema foi detectado em uma primeira tentativa de smoke; as cópias seguintes foram geradas pela API SQLite de backup, incorporando o WAL. **Não foi feito checkpoint no banco operacional.**

Em outro estado isolado (`failure-state`), uma cópia de teste de 0007 recebeu uma instrução inválida ao final. A execução Wrangler falhou como esperado e reverteu o arquivo inteiro: histórico continuou com sete entradas, sem as tabelas de importação, integridade `ok` e nenhuma violação FK. O SQL original nunca foi modificado. Isso comprova rollback desse arquivo testado, não atomicidade de toda a sequência de cinco arquivos: numa falha posterior, migrations anteriores já podem estar confirmadas.

## 5. Testes automatizados e smoke tests

| Verificação | Resultado |
|---|---|
| Suíte Node completa | **186 testes passaram**, zero falhas |
| Oxlint | Aprovado |
| TypeScript sem emissão | Aprovado |
| Build Vinext | Aprovado; mantém aviso conhecido de classificação de `/` |
| Smoke de repositórios sobre cópia migrada | Sete grupos aprovados; zero chamadas de rede |
| Smoke HTTP em Worker isolado | **12 verificações aprovadas**, sem chamar endpoints GLPI |
| Falha de migration induzida somente em cópia | Rollback confirmado |

Comandos da suíte, executados na cópia de código:

```powershell
node --experimental-strip-types --test tests/*.test.ts tests/*.test.mjs
node node_modules/oxlint/bin/oxlint
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/vinext/dist/cli.js build
```

Smoke de repositórios: abertura com GLPI simulado, idempotência, acompanhamento, pendência com justificativa, dashboard, normalização, investigação/conclusão e revisões de RFO, entrega/recebimento de turno com snapshot, sincronização/atualização/solução/fechamento GLPI simulados e recusa de escrita por viewer. `fetch` de rede foi explicitamente bloqueado nesse processo.

Smoke HTTP: Worker compilado em `127.0.0.1:8899`, `--local`, com outro estado (`http-state`), configuração GLPI sintética e sessão **sintética**, criada somente nessa cópia. Cobriu 401 sem autenticação, `/auth/me`, dashboard, detalhes, acompanhamento, RFO, histórico da integração, lista/detalhe de passagem, fechamento operacional após status oficial simulado 6, replay idempotente e rejeição de autoria forjada. O Worker foi parado após os testes. Não foi usado login real nem sessão recuperada para autenticar.

Dados sintéticos foram criados **somente nas cópias de smoke**, nunca no banco operacional, no backup de recuperação ou na simulação principal. As linhas preexistentes foram novamente comparadas após os testes HTTP: todas preservadas. A contagem de sessões preservadas não comprova validade: na leitura agregada havia duas não expiradas/não revogadas e um admin ativo; não foram publicados tokens ou identidades.

Evidências privadas no diretório de backup: `baseline-inspection.json`, `baseline-differences.json`, `migration-plan.json`, `backup-verification.json`, `after-inspection.json`, `simulation-verification.json`, `smoke-results.json`, `http-smoke-results.json`, `rollback-results.json` e `final-preservation.json`. Inventários incluem tabelas, colunas, índices, FKs e hashes sem exportar linhas no relatório público. `http-fixture.json` é fixture privada com sessão sintética; não deve ser usado para operação real.

## 6. Plano proposto para ativação — ainda não autorizado

### Pré-requisitos e decisão

1. Obter autorização específica para aplicar **0007–0011 no banco local identificado**, com janela, responsável e aceite explícito. Este relatório e a execução isolada não constituem essa autorização.
2. Preservar o checkout atual sem reset, commit ou push. Registrar novamente hashes dos SQLs e confirmar ausência de alterações desde a homologação. Reconferir binding, ID lógico, raiz de persistência e nome físico; abortar se qualquer um mudar.
3. Revisar as diferenças legadas documentadas. Não reconstruir categorias/informações nem reaplicar 0000–0006 para tentar uniformizar o DDL. Não inventar identidades GLPI; 0006 não faz parte do plano de aplicação.
4. Conferir HTTPS, certificados/proxy e segredos GLPI no servidor em procedimento autorizado. A Implementação 5 rejeita transporte HTTP; preparar tabelas não garante login ou permissões GLPI. Não usar o painel administrativo de criação de teste contra GLPI real como smoke desta migração.
5. Parar todos os processos que usem essa persistência, confirmar parada e locks, criar **novo backup offline** com hashes e restauração de teste. O backup desta etapa só serve ao estado capturado; qualquer escrita posterior exige novo backup.

### Aplicação proposta

Somente depois da autorização e validações, com diretório de trabalho fixado no projeto e alvo reconferido, o comando proposto é:

```powershell
# PROPOSTA: NÃO EXECUTADA NO BANCO OPERACIONAL NESTA ETAPA.
node node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --local --config wrangler.d1.local.jsonc --persist-to "C:\Users\yurit\meus projetos\lastro\.wrangler\state"
```

Antes de confirmar, a lista precisa mostrar **exatamente** 0007–0011, nessa ordem. Não usar `--remote`, não aceitar aplicação de 0000–0006 e não alterar manualmente `d1_migrations`. Se aparecer lista diferente, objeto já existente ou checksum divergente, abortar e diagnosticar.

Manter runtime parado durante toda a sequência. Registrar sucesso/falha de cada arquivo. Em erro, não reaplicar cegamente e não presumir rollback de arquivos anteriores.

### Verificações para liberar uso

- `integrity_check=ok`, FKs habilitadas e `foreign_key_check` vazio.
- Histórico 0000–0011 completo, prefixo antigo intacto, dez tabelas novas e coluna `creation_fingerprint`; índices/triggers esperados presentes.
- Contagens e hashes de todas as colunas originais comparados ao **novo** backup. Novas tabelas vazias antes do primeiro uso; fingerprint legado NULL.
- Iniciar Lastro de forma controlada; validar sessão/roles, dashboard, detalhes, acompanhamento, RFO e passagens sem operação real GLPI. Qualquer teste de escrita deve permanecer no ambiente isolado até autorização própria.
- Homologar GLPI em instância de teste autorizada: versão instalada, perfil/entidade, templates, campos obrigatórios, auto-close e resultados incertos. Não declarar integração real aprovada com base apenas em mocks.

### Recuperação em caso de falha

1. Manter ou voltar a parar o runtime; impedir escritas concorrentes e identificar os processos corretos. Não tentar fazer downgrade por DROP/DELETE nem editar o journal para esconder a falha.
2. Preservar o estado que falhou em diretório de quarentena separado, incluindo `.sqlite`, WAL e SHM; registrar quais migrations confirmaram e guardar evidências. Não misturar sidecars antigos com o banco restaurado.
3. Validar SHA-256 do backup offline aprovado e restaurá-lo primeiro em outro diretório. Verificar integridade, FKs, histórico e hashes dos dados. Se houver WAL não vazio em uma coorte física, usar o conjunto consistente ou gerar backup canônico em cópia; nunca descartar WAL à mão.
4. Com autorização para recuperação e runtime parado, substituir o estado do namespace por uma restauração verificada. `backup.sqlite` precisa receber o **nome físico original**; não basta deixá-lo com o nome `backup.sqlite` na pasta D1. O auxiliar `metadata.sqlite` tem cópia offline; os sidecars da instância que falhou não podem acompanhar a restauração. Preferir diretório novo/verificado e preservar o anterior em quarentena.
5. Reiniciar controladamente e comparar o estado restaurado com o backup. A recuperação volta ao instante do backup; alterações posteriores não devem ser descartadas silenciosamente. Manter os componentes novos indisponíveis se o schema tiver voltado a 0006.

**Nunca restaurar `simulation-state`, `failure-state`, `http-state` ou arquivos `smoke-*.sqlite` no ambiente operacional.** Eles contêm schema de testes ou dados sintéticos. As fontes de recuperação desta etapa são `raw`, `namespace-offline` e `backup.sqlite`, verificadas pelo manifest.

## 7. Arquivos produzidos e limites restantes

No projeto, apenas ferramentas de diagnóstico e documentação foram acrescentadas:

- `scripts/validate-homologation-copy.mjs`: valida backup/restore, journal, schema e preservação, recusando abrir como SQLite a origem operacional. Modos `prepare`/`verify` trabalham em diretório de backup identificado por manifest; não aplicam migrations por conta própria. Geram arquivos novos e recusam sobrescrever a simulação/evidências existentes.
- `scripts/homologation-smoke.ts`: cria uma nova cópia por API de backup, acrescenta fixtures somente nela e bloqueia rede no smoke dos repositórios.
- Este capítulo e link no índice da documentação.

Os comandos Wrangler de simulação foram executados separadamente com configuração e persistência isoladas. Nenhuma rotina de aplicação automática foi adicionada ao runtime ou ao start do projeto.

Pendências: autorização operacional específica, novo backup se houver novas escritas, revisão/aceite do schema legado, preparação TLS e homologação GLPI real em destino de teste, além de validação visual/interativa de teclado, leitor de tela e ambos os temas. Não houve avanço para outra implementação.

## Registro posterior — Etapa 7

Em 22/10/2026, após autorização expressa limitada ao banco local, as migrations 0007–0011 foram aplicadas e verificadas conforme o [relatório da Etapa 7](18-Ativacao-Controlada-Banco-Local.md). O conteúdo acima preserva o diagnóstico e o plano da Etapa 6, quando ainda não havia aplicação autorizada. O runtime operacional permaneceu parado, sem operação real no GLPI ou D1 remoto.

# Etapa 16.2 — prontidão para ativação controlada da migration 0013

Verificação realizada em 24/10/2026, sem aplicar a migration no D1 operacional. A conclusão técnica é **apta condicionalmente**: a `0013_point_dimension_indexes.sql` pode ser aplicada posteriormente no banco local identificado, desde que as verificações de pré-aplicação deste relatório sejam repetidas sem divergência e exista autorização explícita limitada a essa migration.

## Banco e estado identificados

| Item | Resultado |
|---|---|
| Projeto e binding | `C:\Users\yurit\meus projetos\lastro`, binding D1 `DB`, configuração local `wrangler.d1.local.jsonc` (`database_name: site-creator-d1`). |
| Persistência do runtime | `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/`; banco físico `faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite`. O `scripts/start-worker.mjs` usa essa persistência com `--local`. |
| Runtime | Sem listener nas portas locais do Lastro durante o backup e a simulação. Nenhum Worker operacional foi iniciado. |
| Hash do SQLite operacional | `020FBD6AD68764A7ED2BA29A92EAE64396869CF7017A0260E3D13B81FFD37957`, igual antes e depois da etapa. |
| Histórico real | `d1_migrations` contém exatamente 0000–0012, em ordem, incluindo `0012_data_operations.sql`. O Wrangler local listou somente `0013_point_dimension_indexes.sql` como pendente. |
| Integridade | `integrity_check = ok`; `foreign_key_check` não retornou linhas. Há 7 `information`, 7 categorias, 4 tickets, 1 usuário e 8 sessões. Nenhum `details_json` inválido; não havia pontos cadastrados. |

O journal Drizzle contém 0000–0013 e sua entrada 0013 corresponde ao arquivo presente. A migration tem SHA-256 `A67F9722AE3B11992CE41030835D7656E6935B868995D9248B84758B0256178F`.

## Conteúdo e compatibilidade da migration

[`0013_point_dimension_indexes.sql`](../../drizzle/0013_point_dimension_indexes.sql) possui somente três `CREATE INDEX` de expressão em `information(kind, json_extract(details_json, ...))`:

- `idx_information_point_municipality_key`
- `idx_information_point_client_key`
- `idx_information_point_region_key`

Ela não contém `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, seed ou criação de categorias. Não altera tabelas, FKs, triggers ou o contrato dos cadastros. Os campos opcionais `municipality`, `client` e `operationalRegion` continuam em `details_json`; as chaves normalizadas são derivadas somente no servidor. A validação restringe os campos a pontos e rejeita dados evidentemente sensíveis, enquanto os filtros exigem `kind=point` e são aplicados no servidor antes de contagem e paginação.

O risco estrutural relevante é `json_extract`: uma linha com JSON inválido impediria a criação do índice. A verificação atual encontrou zero ocorrências, mas deve ser repetida imediatamente antes da ativação. Pontos antigos sem dimensões são compatíveis: não recebem valores e apenas não satisfazem um filtro de dimensão.

## Backup e restauração

Foi criado o backup novo e não sobrescrito em:

`C:\Users\yurit\Lastro-backups\etapa16-2-20261024T152413Z`

Ele contém o SQLite principal, seus arquivos `-wal` e `-shm`, além de `metadata.sqlite`, `metadata.sqlite-wal` e `metadata.sqlite-shm`. Os seis hashes foram conferidos com os arquivos da persistência operacional após a cópia. O SQLite principal, WAL e SHM tinham respectivamente 282.624, 8.272 e 32.768 bytes no momento do backup. O WAL de metadados estava vazio.

A restauração foi testada ao copiar esses arquivos para `simulation-state/v3/d1/miniflare-D1DatabaseObject/` dentro do próprio backup. A cópia restaurada passou em `integrity_check` e `foreign_key_check`, preservou os 13 registros de migration e os digests de usuários, sessões, tickets, categorias, informações e operações.

## Simulação isolada

Foi executado exclusivamente na cópia restaurada:

```powershell
corepack.cmd pnpm exec wrangler d1 migrations apply DB --local --config wrangler.d1.local.jsonc --persist-to "C:\Users\yurit\Lastro-backups\etapa16-2-20261024T152413Z\simulation-state"
```

O Wrangler informou `Resource location: local` e aplicou somente `0013_point_dimension_indexes.sql` com sucesso. Depois da simulação:

- `d1_migrations` passou de 13 para 14, com a entrada `0013_point_dimension_indexes.sql`;
- os três índices previstos existem com o SQL esperado;
- `integrity_check = ok`, sem violações de FK;
- todas as tabelas de aplicação mantiveram o mesmo schema, contagem e digest de linhas; as 15 triggers também permaneceram iguais;
- o plano da consulta por município mudou de `SCAN information` para `SEARCH information USING INDEX idx_information_point_municipality_key`.

Não havia pontos no banco recuperado, portanto a medição comprova a seleção do índice pelo SQLite, mas não estima ganho de tempo em volume operacional. O plano ainda usa uma estrutura temporária para a ordenação determinística por `updated_at DESC, id DESC`; isso é esperado para esses índices de filtro.

O único outro valor alterado na cópia isolada foi `_cf_METADATA.key=2`, de `996` para `1001`. É metadado interno do emulador D1 atualizado pela execução de comandos; não é dado cadastral, sessão, usuário, chamado nem conteúdo de `information`. O backup bruto conserva a versão original e permite retorno integral ao estado anterior.

## Procedimento proposto para ativação futura

1. Manter o runtime Lastro parado e confirmar que não há listeners ou processos usando a persistência `.wrangler/state`.
2. Confirmar o diretório do projeto, o binding `DB`, a configuração `wrangler.d1.local.jsonc`, o caminho físico e o hash do SQLite. Qualquer divergência interrompe o procedimento.
3. Executar `wrangler d1 migrations list DB --local --config wrangler.d1.local.jsonc`; o único item pendente deve ser `0013_point_dimension_indexes.sql`.
4. Verificar `PRAGMA integrity_check`, `PRAGMA foreign_key_check` e `json_valid(details_json)`; todos devem reproduzir os resultados deste relatório. Confirmar a presença e hash da migration.
5. Criar outro backup consistente com SQLite, WAL, SHM e metadados, fora de `.wrangler`, conferir hashes e testar a restauração em cópia separada.
6. Aplicar **somente** a 0013 via Wrangler local explícito. Não usar `--remote`, seeds, importação, limpeza ou comandos GLPI.
7. Conferir histórico até 0013, os três índices, integridade/FKs, contagens/digests e o plano de consulta. Só então reiniciar o runtime local e executar smoke tests de leitura.

### Critérios de sucesso

- histórico 0000–0013, sem migrations extras;
- apenas os três índices novos e a entrada de histórico esperada;
- integridade e FKs válidas;
- contagens e digests de dados de aplicação preservados;
- filtros de ponto respondendo, sem alteração em rotas, VLANs, câmeras, categorias, chamados, sessões ou GLPI;
- nenhum acesso remoto, operação real GLPI, importação ou alteração de ficha do Lote 01.

### Recuperação se a aplicação falhar

Interromper o processo antes de qualquer nova tentativa. Registrar o histórico e os objetos SQLite do estado encontrado. Com o runtime parado, restaurar o conjunto completo SQLite/WAL/SHM e metadados a partir do backup validado, preservando uma cópia forense do estado que falhou. Depois, validar hashes, integridade, FKs e migrations antes de reiniciar. Não apagar dados nem tentar corrigir manualmente o histórico de migrations.

## Autorização necessária

Esta etapa não autoriza aplicação. A próxima operação requer autorização explícita para aplicar **exclusivamente** `0013_point_dimension_indexes.sql` ao D1 local recuperado identificado acima, após repetir as pré-condições e criar um backup novo. Ela não deve autorizar D1 remoto, produção, GLPI real, importações, categorias automáticas, mudança das quatro fichas do Lote 01, commit ou push.

Nenhum dado operacional, credencial, ficha, migration operacional, importação, operação GLPI, commit ou push foi alterado nesta etapa.

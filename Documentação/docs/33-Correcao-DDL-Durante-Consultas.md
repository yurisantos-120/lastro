# Etapa 14.1 — correção de DDL durante consultas

Data: 23/10/2026. Achado original: **D13-01** da auditoria geral consolidada.

## Causa e correção

`GET /api/data` chamava `readAll()` em `db/storage.ts`, que chamava `ensureDatabase()`. Essa rotina em `db/persistence.ts` executava `CREATE TABLE IF NOT EXISTS` e `CREATE INDEX IF NOT EXISTS` para `categories` e `information`. Os métodos legados de escrita também invocavam a rotina. Assim, uma requisição normal podia tentar modificar a estrutura e uma base antiga podia aparentar estar inicializada sem histórico de migrations.

O bootstrap DDL foi removido. `readCatalog(db)` executa somente as duas consultas necessárias e preserva a conversão de `details_json`, o formato da resposta e a ordem dos registros. Os métodos legados de escrita não tentam criar tabelas. Migrations permanecem como único mecanismo de evolução do schema. Nenhuma migration nova foi criada ou aplicada.

Quando uma tabela ou coluna necessária está ausente, o GET retorna HTTP 503 com `SCHEMA_OUTDATED` e uma mensagem para aplicar as migrations pendentes. A resposta não expõe SQL interno. Falhas de banco de outra natureza continuam como erro genérico; não são disfarçadas como schema incompleto. O fluxo cadastral de idempotência já possui verificação específica da tabela `data_operations` da migration 0012.

## Arquivos

- `db/persistence.ts`: substituição da rotina DDL pela leitura pura e classificação de erro estrutural.
- `db/storage.ts`: chamadas de leitura e escrita sem bootstrap.
- `db/data-errors.ts` e `app/api/data/handlers.ts`: resposta controlada para schema incompleto.
- `tests/persistence.test.ts`: fixtures migradas explicitamente e regressões para GET sem DDL, banco vazio/legado, preservação de linhas e schema até 0012.
- `Documentação/docs/04-Banco-e-Persistencia.md` e `28-Auditoria-Geral-Consolidada.md`: atualização do comportamento e do acompanhamento do achado.

## Validação

- Testes direcionados de persistência e API de dados: **26 aprovados**.
- Suíte completa: **226 aprovados**, zero falhas. Inclui dashboard, chamados, turnos, RFO, cadastros, autenticação e GLPI simulado.
- Lint, TypeScript e build: aprovados. O primeiro build foi feito em cópia temporária sem `.env`, `.wrangler` ou D1 operacional; depois o Worker local foi parado, recompilado na pasta do projeto e reiniciado em `127.0.0.1:8787`. O aviso de classificação estática de rotas do Vinext permanece.
- Banco isolado com migrations até 0012: leitura vazia sem criar registros. Bancos vazio e legado: resposta 503, sem criar tabelas nem alterar linhas.
- Smoke test do Worker reiniciado: `GET /api/auth/me` sem cookie respondeu HTTP 200 com `{"user":null}`; não houve chamada ao GLPI.

O D1 operacional não foi alterado nesta etapa. O smoke test de autenticação consultou a disponibilidade do armazenamento de sessões sem gravar dados. Não houve chamada real ao GLPI, alteração de autenticação ou configuração GLPI, migration, commit ou push.

## Pendências

Paginação cadastral (**D13-02**) e as demais correções da auditoria seguem em etapas separadas. Uma base incompleta precisa de diagnóstico e aplicação controlada das migrations pelo procedimento operacional existente; o runtime não as executará automaticamente.

**Atualização de 23/10/2026:** a paginação D13-02 foi tratada na [Etapa 14.2](34-Paginacao-e-Consultas-Cadastrais.md). O método `readCatalog` desta etapa foi substituído por consultas limitadas; a garantia de ausência de DDL em GET continua coberta por testes. As demais pendências da auditoria continuam separadas.

**Atualização da Etapa 14.4:** os adaptadores legados de escrita, mantidos apenas para `tests/persistence.test.ts`, foram movidos de `db/persistence.ts` para `tests/helpers/legacy-persistence.ts`. O runtime não exporta mais wrappers de escrita em `db/storage.ts`; a API continua usando `DataOperations`.

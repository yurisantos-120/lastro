# Etapa 14.3 — estabilização de testes intermitentes

Data: 23/10/2026. Achado **Q13-01** da auditoria consolidada. Escopo: execução dos testes; nenhuma alteração de produção.

## Falha original e investigação

O arquivo privado `C:\Users\yurit\Lastro-backups\etapa13-20261023T123854Z\tests.log` registra 218 aprovações e uma falha em `tests/data-operations.test.ts:48`, no teste **“key binding rejects changed payload, method, target and operator without disclosing another receipt”**. O log mostra `PromiseRejectionHandledWarning` e uma rejeição `DataOperationError` com código `OPERATION_KEY_CONFLICT`. A repetição original `tests-rerun.log` passou 219/219.

O teste criava três Promises com `store.execute(...)` dentro de um array. Depois chamava `assert.rejects` para cada uma em sequência. Enquanto a primeira era aguardada, a segunda ou terceira podia rejeitar sem observador; o runner interpretava isso como falha de teste mesmo que o código de produção retornasse o conflito esperado. A temporização varia porque `execute` calcula um hash assíncrono e consulta SQLite. Cada teste usa um `D1Memory` próprio e fecha o banco em `finally`; o caso suspeito não usa portas, temporizadores de aplicação nem rede externa. A suíte padrão roda arquivos de teste em paralelo, o que pode influenciar a ordem relativa, mas não foi demonstrado estado compartilhado entre fixtures.

Em 20 execuções direcionadas e cinco suítes completas **antes** da correção, a falha não reapareceu naturalmente. Para demonstrar a corrida sem depender de sorte, uma reprodução isolada atrasou a primeira das três requisições e deixou as outras rejeitarem antes de serem aguardadas. Com `--unhandled-rejections=strict`, o padrão antigo saiu com código **1**; a mesma ordem controlada com criação e observação sequenciais saiu com código **0**. Essa reprodução usa apenas banco em memória e dados sintéticos.

## Correção

O teste agora guarda **funções que iniciam** cada operação e chama `assert.rejects(request(), ...)` imediatamente para cada uma. Assim, nenhuma Promise é iniciada antes de seu tratamento. Os três casos de conflito, os códigos esperados e as afirmações sobre recibo e número de categorias continuam iguais. Os testes separados de concorrência de criação e edição permanecem concorrentes e continuam aprovados. `db/data-operations.ts` e o comportamento de idempotência em produção não foram alterados.

Arquivo de código alterado: `tests/data-operations.test.ts`. Documentação e evidências: este relatório, `Documentação/docs/28-Auditoria-Geral-Consolidada.md`, `Documentação/README.md` e `Documentação/evidencias-etapa-14-3/`.

## Repetições e validação

| Execução | Antes | Depois |
|---|---:|---:|
| Teste direcionado, execuções independentes | 20/20 aprovadas | 30/30 aprovadas com rejeições estritas |
| Suíte completa paralela, execuções independentes | 5/5 aprovadas | 8/8 aprovadas com rejeições estritas; **231/231 testes** em cada uma |
| Ordem controlada de rejeições rápidas | código de saída 1 | código de saída 0 |

Além das repetições, `npm test` aprovou **231/231**; a suíte completa serial (`--test-concurrency=1`) aprovou **231/231**; lint, TypeScript e build foram aprovados. O build foi feito em cópia temporária isolada, sem `.env`, `.wrangler` operacional ou D1 recuperado. O aviso conhecido do Vinext sobre classificação estática de rotas dinâmicas permaneceu. As suítes incluem módulos de autenticação, GLPI simulado, dashboard, chamados, turnos, RFO, cadastros e paginação.

Evidências: [resumo de cada uma das 63 repetições](../evidencias-etapa-14-3/repeticoes.csv), [resultados da ordem controlada](../evidencias-etapa-14-3/ordem-controlada-resultados.txt) e scripts reproduzíveis [antes](../evidencias-etapa-14-3/ordem-controlada-antes.mjs)/[depois](../evidencias-etapa-14-3/ordem-controlada-depois.mjs). O [log da falha controlada](../evidencias-etapa-14-3/ordem-controlada-antes.log) foi preservado; a versão corrigida não emitiu saída. Os logs completos das repetições permanecem em `C:\Users\yurit\AppData\Local\Temp\lastro-etapa14-3-repeticoes`.

## Estado e limites

**Q13-01 corrigido no teste e não reproduzido após a correção** nas execuções acima. Nenhum número finito de execuções prova ausência universal de intermitência; acompanhar execuções futuras do CI continua apropriado. Outras possíveis falhas intermitentes não foram inferidas nem corrigidas sem evidência.

O Worker operacional permaneceu na porta 8787. Não houve acesso de escrita ao D1 operacional, aplicação de migrations, operação real no GLPI, alteração de credenciais, mudança visual, commit ou push.

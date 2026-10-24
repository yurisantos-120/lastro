# Etapa 7 — ativação controlada das migrations no D1 local

Data: **22/10/2026**, fuso de apresentação `America/Sao_Paulo`.

**Resultado: migrations 0007–0011 aplicadas com sucesso exclusivamente no banco D1 local autorizado. Integridade e preservação aprovadas. Recuperação não necessária.** Não foram alterados usuários ou credenciais, executados seeds/importações/limpeza, acessados D1 remoto ou GLPI real, nem realizados commit ou push. O runtime operacional permanece parado. Não foi iniciada homologação visual ou outra implementação.

## Autorização e alvo

A autorização expressa desta etapa limita-se ao banco recuperado identificado na [Etapa 6](17-Preparacao-Segura-do-Banco.md). O relatório anterior foi lido integralmente antes da alteração.

| Item | Valor reconfirmado |
|---|---|
| Projeto | `C:\Users\yurit\meus projetos\lastro` |
| Configuração Wrangler | `wrangler.d1.local.jsonc` |
| Binding / nome lógico | `DB` / `site-creator-d1` |
| ID local | `00000000-0000-4000-8000-000000000000` |
| Persistência explícita | `C:\Users\yurit\meus projetos\lastro\.wrangler\state` |
| Diretório físico | `.wrangler\state\v3\d1\miniflare-D1DatabaseObject` |
| Arquivo | `faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite` |

Foram cruzados configuração local, binding em `.openai/hosting.json`, configuração compilada do runtime, ponteiro `.wrangler/deploy/config.json` e starter com persistência explícita. O caminho físico corresponde ao manifest da Etapa 6. Não havia processo Workerd ou escuta nas portas de runtime verificadas antes da aplicação.

## Pré-condições aprovadas

Antes da primeira instrução SQL no banco autorizado:

- O arquivo operacional, sem WAL/SHM da aplicação naquele momento, tinha o mesmo SHA-256 da Etapa 6: `d4895e28d5cdba43ff2b86ba1a2b19a8901bf598d12de3964861cb0fe1fb8e26`.
- O backup `C:\Users\yurit\Lastro-backups\etapa6-20261022T211731Z` estava presente e íntegro. Foram conferidos hashes da cópia física, namespace e backup canônico, além da restauração separada.
- Uma nova cópia offline do namespace foi feita sob locks exclusivos. A aplicação só prosseguiu depois da validação desse novo backup e de sua restauração de teste.
- Histórico, todas as linhas/colunas, catálogo DDL, índices e FKs da cópia atual coincidiram com a inspeção validada na Etapa 6.
- `d1_migrations` tinha exatamente 0000–0006; as únicas pendências eram 0007–0011. Os hashes dos 12 SQLs coincidiram com o plano da Etapa 6. Journal e cadeia de snapshots estavam coerentes.
- As diferenças legadas de DDL eram as mesmas: declaração explícita de `NOT NULL` nas PKs inteiras de categorias/informações e diferenças de escrita do SQL. Não houve nova divergência nem reconstrução dessas tabelas; FKs e demais definições conferidas foram preservadas.

Registro de aprovação das pré-condições: **20:23:55**, antes da aplicação. Horários armazenados nas evidências usam UTC (`23:23:55Z`). Nenhuma pré-condição falhou.

## Backups e evidências desta etapa

Diretório novo, fora do Git e com ACL restrita ao usuário e ao SYSTEM:

```text
C:\Users\yurit\Lastro-backups\etapa7-20261022T232249Z
```

| Arquivo/diretório | Conteúdo |
|---|---|
| `manifest.json` | Alvo, modo local, estado parado e hashes do snapshot inicial |
| `before-namespace\` | Coorte física anterior às migrations, incluindo auxiliares presentes |
| `before.sqlite` | Backup SQLite canônico anterior à ativação |
| `restore-before.sqlite` | Restauração separada desse backup, conferida integralmente |
| `preconditions.json`, `before-inspection.json` | Aprovação e inventário inicial |
| `wrangler-apply.log`, `application-result.json` | Comando, alvo local, resultado e término |
| `d1-verification.json` | FKs habilitadas, ausência de violações e histórico real final |
| `after-namespace\`, `after-files.json` | Coorte física posterior, com WAL/SHM quando presentes |
| `after.sqlite`, `after-inspection.json`, `postconditions.json` | Estado lógico final completo e preservação |
| `smoke-results.json`, `http-smoke-results.json`, `final-preservation.json` | Resultados funcionais e conferência final |
| `tests.log`, `lint.log`, `typecheck.log`, `build.log` | Verificações automatizadas |

O novo `before.sqlite` tem SHA-256 `7c574eb4eb074e518b67a0d6d41c3119a0f2ef4ee4d3f778d3684eeb99926015`, igual ao canônico da Etapa 6 porque o estado inicial não mudou. O backup anterior foi preservado; não se usaram bancos de smoke como origem de recuperação.

O diretório contém dados recuperados e fixtures privadas; não deve ser publicado ou anexado integralmente a um relatório público. Nenhum conteúdo de usuários, sessões, tickets ou credenciais foi reproduzido neste documento.

## Aplicação efetivamente executada

Wrangler instalado: **4.92.0**. Diretório de trabalho fixado no projeto. Comando executado uma única vez para a sequência aprovada:

```powershell
node node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --local --config "C:/Users/yurit/meus projetos/lastro/wrangler.d1.local.jsonc" --persist-to "C:/Users/yurit/meus projetos/lastro/.wrangler/state"
```

O Wrangler informou `Resource location: local`, exibiu exclusivamente as cinco migrations esperadas e terminou com exit code **0**. Não houve `--remote`, troca de configuração, alteração de SQL ou inserção manual em `d1_migrations`.

| Migration | Estado inicial | Estado final | Registro D1 | Horário em São Paulo |
|---|---|---|---:|---|
| `0007_import_tracking.sql` | Pendente | Aplicada | 8 | 20:24:28 |
| `0008_ticket_operations.sql` | Pendente | Aplicada | 9 | 20:24:28 |
| `0009_shift_handoffs.sql` | Pendente | Aplicada | 10 | 20:24:28 |
| `0010_ticket_rfo.sql` | Pendente | Aplicada | 11 | 20:24:29 |
| `0011_glpi_reconciliation.sql` | Pendente | Aplicada | 12 | 20:24:29 |

Os horários de `applied_at` foram armazenados pelo SQLite em UTC, entre `2026-10-22 23:24:28` e `23:24:29`. As sete linhas anteriores do histórico conservaram IDs, nomes e horários.

## Validação do banco local após aplicação

A conferência D1 explícita, também com `--local` e a mesma persistência, retornou:

- `PRAGMA foreign_keys`: **1**.
- `PRAGMA foreign_key_check`: **nenhuma linha**.
- `d1_migrations`: **12 entradas**, sequência completa 0000–0011, sem duplicidade.

Com o Worker de migrations encerrado, foi feita cópia física consistente de todo o namespace. A inspeção SQLite dessa cópia confirmou `integrity_check=ok`, ausência de violações FK e catálogo final **igual ao da simulação aprovada na Etapa 6**, incluindo tabelas, colunas, índices, constraints e triggers. Índices/FKs e colunas anteriores também foram comparados individualmente.

| Objeto | Antes | Depois | Preservação |
|---|---:|---:|---|
| `users` | 1 | 1 | Todos os valores idênticos |
| `sessions` | 7 | 7 | Todos os valores idênticos |
| `tickets` | 3 | 3 | Todas as colunas anteriores idênticas |
| `categories` | 7 | 7 | Todos os valores idênticos |
| `information` | 7 | 7 | Todos os valores idênticos |
| `auth_bootstrap` | 1 | 1 | Todos os valores idênticos |
| `d1_migrations` | 7 | 12 | Prefixo anterior intacto; cinco registros acrescentados |
| Tabelas, incluindo auxiliares D1 | 8 | 18 | Dez tabelas adicionadas |
| Índices nomeados não internos SQLite | 11 | 32 | Definições esperadas conferidas |
| Triggers | 0 | 15 | Definições esperadas conferidas |
| Relações FK declaradas | 2 | 21 | Sem violações |

As dez tabelas novas ficaram **vazias no banco local autorizado**: `import_batches`, `import_records`, `ticket_operations`, `ticket_operation_events`, `shift_handoffs`, `shift_receipts`, `ticket_rfos`, `ticket_rfo_revisions`, `glpi_operations` e `glpi_operation_events`.

`tickets.creation_fingerprint` permaneceu NULL nos três tickets anteriores. Nenhum acompanhamento, RFO, passagem ou evento histórico fictício foi criado para registros antigos. As comparações usaram hashes dos valores integrais, não apenas contagens.

`_cf_METADATA` conservou uma linha, com alteração de metadados internos de escrita/bookmark pelo D1. Essa alteração de plataforma foi registrada separadamente; não foi tratada como modificação de usuários, sessões ou chamados.

### Estado WAL preservado

Após a aplicação, o arquivo principal ainda tinha **102.400 bytes**, mas havia WAL da aplicação de **346.112 bytes**, além do SHM. O hash do arquivo principal isolado continuava igual ao inicial; **isso não significa que as migrations não foram aplicadas**. O novo estado estava também no WAL e foi confirmado pelo D1 e pela inspeção da coorte completa.

Não foram removidos sidecars nem forçado checkpoint. `after-namespace` preserva o conjunto completo, e `after.sqlite` foi gerado pela API SQLite de backup, incorporando os dados do WAL. A conferência final dos hashes de todos os arquivos da coorte confirmou que o banco local não mudou durante os testes em cópias. Não copiar apenas o `.sqlite` operacional para transportar esse estado.

## Testes posteriores à ativação

Todos os testes que criam sessões, usuários ou chamados sintéticos usaram **cópias do banco já migrado**, nunca a persistência autorizada. O runtime operacional não foi iniciado. A cópia do código não continha `.env`, `.dev.vars` ou estado operacional e utilizou as dependências já instaladas.

| Verificação | Resultado |
|---|---|
| Suíte automatizada completa | **186 testes passaram**, zero falhas |
| Lint Oxlint | Aprovado |
| TypeScript sem emissão | Aprovado |
| Build Vinext | Aprovado |
| Smoke sobre cópia pós-migration | **8 grupos aprovados**, zero chamadas de rede |
| Smoke HTTP em Worker isolado | **12 verificações aprovadas**, sem endpoints GLPI |
| Preservação dos registros anteriores nas cópias de smoke | Aprovada |

Comandos executados na cópia isolada:

```powershell
node --experimental-strip-types --test tests/*.test.ts tests/*.test.mjs
node node_modules/oxlint/bin/oxlint
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/vinext/dist/cli.js build
```

O smoke de repositórios verificou:

1. Login, leitura de sessão e logout do `AuthService` com identidade GLPI simulada e usuário sintético somente na cópia.
2. Abertura com GLPI simulado e replay idempotente.
3. Acompanhamento, histórico, justificativa de pendência e dashboard.
4. Investigação, normalização, conclusão e revisões de RFO.
5. Entrega e recebimento de turno, preservando o snapshot.
6. Sincronização, atualização, solução e fechamento com GLPI simulado, sem alterar automaticamente a situação operacional.
7. Recusa de escrita por viewer.
8. Preservação integral dos registros recuperados na cópia testada.

Nesse processo, `fetch` de rede foi bloqueado. O script de fixture da Etapa 6 foi adaptado apenas na cópia descartável para consumir o snapshot pós-ativação e acrescentar o teste de autenticação; nenhuma mudança de lógica foi introduzida no código do Lastro.

O smoke HTTP usou o Worker compilado em `127.0.0.1:8899`, modo local, outra persistência (`http-state`) e configuração GLPI sintética. Cobriu 401 sem sessão, `/auth/me`, dashboard, detalhes, acompanhamento, RFO, integração local, lista/detalhe de passagem, fechamento operacional de ticket sintético com status remoto simulado 6, replay idempotente e rejeição de autoria forjada.

O Worker isolado foi parado ao concluir. Sessões recuperadas não foram usadas para autenticar. Não foi realizado POST de login contra o GLPI real: login/logout foram validados com provedor simulado, e os guards/sessões locais também foram verificados por HTTP na cópia. Validar credenciais, HTTPS e permissões do GLPI real continua fora desta autorização.

## Problemas, recuperação e estado de entrega

Não houve falha de pré-condição, de aplicação ou de validação. **Não foi necessária recuperação, e nenhuma restauração foi feita sobre o banco autorizado.** A restauração realizada antes da aplicação foi somente o teste em caminho separado.

Condições conhecidas preservadas:

- Diferenças legadas de DDL documentadas na Etapa 6, sem alteração corretiva de tabelas antigas.
- WAL não vazio após as migrations, preservado e incluído no backup canônico final.
- Aviso já conhecido do Vinext sobre classificação estática da rota `/`, sem falha de build.
- Autenticação com GLPI real, certificados, perfis e templates não homologados nesta etapa, por restrição explícita de escopo.

No projeto, esta entrega acrescentou este relatório, um link no índice e uma referência histórica no capítulo 17. Não foram alterados código de aplicação, testes, migrations, snapshots, journal, usuários ou credenciais. As alterações preexistentes foram preservadas.

Os backups anteriores e o backup imediatamente anterior a esta ativação continuam disponíveis. Caso surja uma falha futura, parar e registrar o estado antes de qualquer recuperação; o procedimento da Etapa 6 permanece uma referência e não dispara restauração automática.

**Banco local ativado até 0011; runtime operacional parado; sem homologação visual ou avanço automático para outra etapa.**

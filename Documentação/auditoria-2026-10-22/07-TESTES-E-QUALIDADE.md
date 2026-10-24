# Testes e qualidade

## Condições de execução

Checks em cópia temporária exclusiva, sem `.env`, `.dev.vars`, `.git`, estado `.wrangler`, artefatos recuperados ou banco operacional. Pastas de código, testes, migrations e assets foram copiadas; `node_modules` foi referenciado por junction para usar dependências já instaladas. Hosting sintético: binding `DB`, sem publicação nem credenciais. Não foi executado servidor da aplicação.

Pasta de execução: `%TEMP%\lastro-auditoria-cc391ebeb02d4517a6fdb106cf2655e2`. Node observado: `v24.22.0`. pnpm declarado: `11.19.0`; `pnpm.cmd` não encontrado no PATH. Não foram instaladas dependências nem alterado PATH/configuração global.

## Resultados

| Verificação | Comando efetivamente executado na cópia | Resultado |
|---|---|---|
| Testes selecionados | `node --experimental-strip-types --test tests/glpi.test.ts tests/data-api.test.ts tests/persistence.test.ts tests/auth-ui.test.ts tests/start-worker-config.test.mjs` | **44 testes, 44 passaram, zero falhas**; duração informada pelo runner ~599 ms |
| Lint | `node node_modules/oxlint/bin/oxlint` | Exit 0, sem diagnósticos |
| Typecheck | `node node_modules/typescript/bin/tsc --noEmit --incremental false` | Exit 0, sem diagnósticos |
| Build | `node node_modules/vinext/dist/cli.js build` | Exit 0; cinco etapas concluídas e oito rotas enumeradas |
| Integridade do snapshot local | `quick_check` e `foreign_key_check` em cópia aberta read-only | `ok`, zero violações |

O build avisou que `/` não pôde ser classificada estaticamente pelo Vinext, que limita a detecção de APIs dinâmicas. Foi aviso, não falha de compilação. Gerou artefatos somente na cópia temporária. O teste de falha de encerramento de sessão emitiu `GLPI_SESSION_CLEANUP_FAILED GLPI_CONNECTION_ERROR`, diagnóstico esperado pelo cenário simulado; a suíte passou.

## Por que a suíte completa não foi executada

O script `test` inclui nove arquivos. Quatro executam diretamente SQL dos arquivos de migration:

| Arquivo não executado | Evidência / cobertura deixada pendente |
|---|---|
| `tests/auth.test.ts` | Harness aplica migrations no construtor; login, sessão, autorização e bootstrap completos |
| `tests/auth-schema.test.ts` | Ensaia migrations e transição do schema de autenticação |
| `tests/import-storage.test.ts` | Aplica migrations e ensaia rastreabilidade/transações |
| `tests/tickets.test.ts` | Harness executa `0004_noisy_rictor.sql`; workflow integrado ao SQLite |

Embora esses testes usem SQLite `:memory:`, a instrução “Não execute migrations” foi interpretada de forma conservadora. Eles foram lidos estaticamente, mas **não executados**. Não houve mudança nos arquivos de teste para contornar a restrição. Os testes de persistência selecionados criam somente fixture/esquema de inicialização em memória; não leem nem executam migrations. Os de GLPI usam `fetch` injetado e respostas sintéticas, sem contato externo.

Essa decisão reduz a cobertura executada. Não se deve converter “44 passaram” em “toda a suíte passou”. Uma rodada completa dependerá de autorização específica para fixtures que executam SQL de migration ou de futura reorganização dos testes.

## Falhas de ambiente versus defeitos do produto

- **Ambiente:** ausência de pnpm no PATH; contornada chamando os binários locais correspondentes aos scripts. Não indica bug no Lastro.
- **Ambiente:** Python não disponível no alias do Windows; inspeção SQLite feita com Node já instalado. Nenhuma ferramenta foi instalada.
- **Ferramenta de auditoria:** uma tentativa de comando Node inline perdeu aspas na passagem pelo PowerShell e falhou antes de executar; repetida por stdin, sem alteração de código. Não é falha do produto.
- **Produto/estado recuperado:** tabelas da 0007 ausentes no snapshot, apesar de arquivos presentes; constatado sem aplicar SQL.
- **Produto:** ausência de paginação, modelo de trechos, fluxo de importação e administração são observações do código, não falhas descobertas pelos checks.
- **Não determinado:** se cada limitação já existia antes da formatação; não existe baseline anterior certificado. Todas foram observadas antes de qualquer implementação desta auditoria.

## Cobertura relevante existente

Os testes executados cobrem payloads dos quatro tipos, categorias, campos de conectividade, normalização de MAC, rejeição de entradas inválidas/corpo grande, revisão antiga/409, erros seguros, comportamento de persistência e IDs, concorrência otimista, ausência de seed automático, matriz visual de roles, configuração do inicializador, normalização/timeout/redirect/cleanup do cliente GLPI e proibição de retry de POST incerto.

Limites: `createDataHandlers` é testado com storage em memória; isso não equivale a teste HTTP completo com guard, cookie e Worker. `auth-ui.test.ts` testa funções de permissão, não renderização DOM. Harness SQLite simula D1, sem provar todas as características do Worker real. Build e typecheck não certificam UX, integridade semântica da base, política de proxy ou conectividade GLPI.

## Lacunas de qualidade prioritárias

1. E2E com API simulada para criação/edição/erro/409/login e acessibilidade dos modais.
2. Teste integrado de cada route handler com matriz de sessão/perfil, sem acesso ao banco real.
3. Confirmação de escrita separada de falha de releitura e proteção contra retry duplicado.
4. Corpo excessivo no endpoint de tickets e uniformidade de Origin/Content-Type.
5. Reconciliação e recuperação de pending/uncertain após reinício/navegação.
6. Validação compartilhada API/importação e finalização concorrente de lotes.
7. Contrato de listagem mínima de tickets por role e comparação de payload por chave idempotente.
8. Teste de runtime Worker em ambiente sem credenciais reais e esquema preparado por fixture autorizada.

Não foram adicionados testes ou correções ao repositório nesta etapa.

## Preservação

Comparação SHA-256 entre código original e cópia anterior aos checks: 140 arquivos iguais nas pastas copiadas, zero divergências. Status inicial tinha 31 modificados rastreados e 68 não rastreados individuais. A auditoria acrescenta exclusivamente oito Markdown em pasta própria, sem commit/push. Os snapshots temporários nunca foram usados como destino de escrita da aplicação.

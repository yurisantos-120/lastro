# Etapa 13 — auditoria geral consolidada do Lastro

Data: 23/10/2026. Escopo: estado atual das Implementações 1–12. Auditoria de leitura, testes locais e planejamento. Nenhum código funcional, migration, dado operacional ou credencial foi alterado. Não houve GLPI real, D1 remoto, commit ou push.

## 1. Resumo executivo

O Lastro tem os fluxos locais de chamados, dashboard, RFO, passagens de turno e cadastros implementados e cobertos por testes automatizados. O D1 local recuperado possui migrations 0000–0012, está íntegro e não contém movimentos sintéticos desta auditoria. A idempotência cadastral foi testada com cópias na Etapa 11 e a migration 0012 foi ativada localmente na Etapa 12. A autenticação humana e a integração com GLPI **não estão homologadas operacionalmente**: o destino HTTP conhecido é recusado intencionalmente pela exigência de HTTPS, e nenhum endpoint HTTPS aprovado foi confirmado.

Não foi comprovado P0 novo. Há riscos P1 de disponibilidade/segurança a investigar antes de exposição operacional: dependência RSC com aviso de DoS e limitação do rate limiter de login à memória de uma instância. Há pendências P2 de DDL em leitura, escala dos cadastros, navegação endereçável e estabilidade de um teste. O resultado dos testes não equivale a cobertura integral. Não foi realizada nova inspeção em navegador nesta etapa; os 21 achados visuais encerrados são apoiados nas evidências das Etapas 10.1–10.4, sem revalidação visual atual.

## 2. Inventário e relações entre módulos

| Módulo | Estado observado e integração |
|---|---|
| Autenticação/sessões | Login GLPI com HTTPS exigido; sessão local por cookie `HttpOnly`, `SameSite=Lax`, hash do token no D1 e guard de papéis. Login real bloqueado pela infraestrutura HTTPS. |
| Chamados/GLPI | Abertura local/externa, reconciliação e status oficial separados do estado operacional. Tentativas incertas não são automaticamente repetidas. Escrita real não testada nesta etapa. |
| Dashboard | Consultas agregadas e paginadas de tickets; distingue estado local, abertura e GLPI. Depende de tickets e operações. |
| Operações/RFO | Pendências, normalização, histórico e revisões da RFO vinculados a ticket/operador; RFO não muda GLPI automaticamente. |
| Passagens | Resumo congelado, turnos diurno/noturno 12×36, entrega e recebimento sem alterar tickets; depende do estado operacional e da identidade local. |
| Categorias e rotas/VLANs/câmeras/pontos | `categories` e `information`, revisão otimista, validação, chave persistente por intenção e recibo em `data_operations`. A API de listagem ainda consulta todos os cadastros. |
| Interface | Página principal coordena navegação e formulários; componentes de dashboard, detalhes, passagem e RFO usam os padrões visuais das Etapas 10.1–10.4. |

Dependências importantes: sessão validada → guard de API → repositório D1; ticket confirmado → acompanhamento/RFO/passagem; cadastro de rota opcional → descrição operacional sem associação por texto; intenção cadastral → reserva/recibo D1 → outbox do navegador. O estado GLPI nunca deve ser inferido do estado operacional.

## 3. Auditoria funcional

**Confirmado por testes automatizados e código:** suites cobrem autenticação/roles, tickets, reconciliação GLPI com mocks, pendências, dashboard, RFO, turno noturno, cadastros, revisões e idempotência. A Etapa 12 aplicou 0012 no D1 local após simulação e comprovou ledger vazio e preservação dos dados. A Etapa 11 verificou 28 cenários no Edge isolado, inclusive perda de resposta e duas abas; isso é evidência histórica, não uma execução no navegador desta etapa.

**Pendente de homologação operacional:** login com HTTPS e certificado aprovado, perfil/permissão GLPI 9.5.4 efetivamente instalado, criação/solução/fechamento de chamados exclusivamente de teste, latência e reconciliação no ambiente de destino. Não se executou fluxo de escrita sobre os três tickets recuperados nem se usaram sessões/credenciais reais. Fluxos de erro/rollback estão cobertos por simulações, mas falhas de rede e concorrência da infraestrutura real ainda não foram medidas.

**Lacunas funcionais antigas:** endereço/Voltar para a seção ativa continua ausente: `app/page.tsx` alterna `active` em estado React sem sincronizar URL ou `popstate`. O padrão de retorno ao dashboard foi corrigido no escopo V19, mas não entrega URL compartilhável ou preservação da seção ao recarregar. Importação de planilhas, modelos e outras evoluções do plano original permanecem fora desta auditoria, sem classificação automática como defeito.

## 4. Segurança

Guards `withRequiredRole` são usados nas rotas inspecionadas; mutações examinadas verificam sessão no servidor e origem, e entrada de login tem limite de 2 KiB. Cookies são `HttpOnly` e `SameSite=Lax`; `Secure` é condicionado ao HTTPS da requisição. Clientes GLPI rejeitam HTTP. O campo de idempotência não recebe identidade do navegador. React escapa conteúdo textual dos módulos; o uso de `dangerouslySetInnerHTML` visto no gráfico compartilhado exige revisão contextual e não foi classificado como XSS comprovado.

**S13-01, P1 — limite de login apenas em memória.** `services/auth/login-rate-limit.ts` usa `Map` no singleton importado pelas rotas. Cada instância/processo tem contadores independentes; troca/reciclagem de instância perde o histórico. Impacto: o limite de cinco tentativas em 15 minutos não é um controle global confiável se houver múltiplos Workers. Confirmado por inspeção de código; exploração/deployment não comprovados. Revisar política de borda ou armazenamento compartilhado atômico, com teste de múltiplas instâncias, sem diminuir a proteção HTTPS.

**S13-02, P1 condicionado à exposição — pacote RSC vulnerável.** O lockfile instala `react-server-dom-webpack@19.2.6` direta e transitivamente por Vinext; `pnpm audit` o associa a [GHSA-wx67-qw84-cm4g](https://github.com/advisories/GHSA-wx67-qw84-cm4g), que afeta `<19.2.8` e descreve DoS por requisição a Server Functions. A presença da versão está confirmada; exposição de um endpoint acionável no build publicado **não foi comprovada**. Revisar compatibilidade Vinext/RSC, testar a versão corrigida em cópia e verificar rotas efetivamente alcançáveis antes de classificar exploração operacional. Não testar payload de DoS no runtime local recuperado.

**S13-03, triagem de dependências.** `pnpm audit --json` retornou 61 alertas (3 critical, 24 high, 27 moderate, 7 low); `--prod` retornou 40 (1 critical, 16 high, 19 moderate, 4 low). Esses são números de avisos, não 61 vulnerabilidades demonstradas no Lastro. O crítico `proxy-addr@2.0.7` veio pela cadeia `shadcn → MCP SDK → express`, e o aviso [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) exige uma configuração específica de subnet de proxy. Nenhum uso dessa cadeia para autenticação do Worker foi demonstrado; classificar como alerta para triagem do pacote/build, não como bypass do Lastro. Arquivos JSON integrais estão nas evidências privadas. Versões e avisos mudam; repetir auditoria de dependências antes de publicar.

**Pendências de análise:** a inspeção manual não substitui varredura formal completa de 172 arquivos de app/serviços/banco/componentes/testes. Não foi demonstrado vazamento de tokens, SQL injection, XSS ou CSRF nesta revisão, mas isso não certifica ausência. A skill `codex-security:security-scan` requer preflight com Python; nesta sessão só havia aliases da Microsoft Store, sem interpretador utilizável. O scanner não foi iniciado e nenhum relatório de varredura formal foi produzido. Revisão de segredos em todo o repositório, rotas irmãs, limites por endpoint e configuração efetiva de implantação precisam ser completadas em ambiente com o helper disponível. Não foram abertas credenciais para essa análise.

## 5. Banco e persistência

Inspeção **somente** do backup `after.sqlite` da Etapa 12: `integrity_check=ok`, `foreign_key_check` vazio, 13 nomes de migration em sequência, 19 tabelas, 33 índices, 15 triggers e zero linhas em `data_operations`. Os seis hashes físicos do D1 local coincidem com o estado final da Etapa 12 após esta auditoria. Não se executou DDL nem DML no banco operacional. O backup pré-0012, sua restauração verificada e o snapshot pós-0012 permanecem em `C:\Users\yurit\Lastro-backups\etapa12-20261023T122951Z`.

Migrations 0000–0012 e journal são aditivos no histórico executado; o ledger 0012 tem PK, FK do operador, checks e índice. D1/SQLite não grava checksum da SQL aplicada em `d1_migrations`; a equivalência foi aferida por nomes, schema e evidências da aplicação. As diferenças legadas de DDL em PKs inteiras de categorias/informações, registradas na Etapa 6, continuam presentes. Triggers e vínculos dos módulos foram exercitados em testes isolados, mas não houve prova de carga, falha de energia ou recuperação de desastre em operação real.

**D13-01, P2 — DDL no caminho de leitura.** `db/storage.ts:18–20` chama `ensureDatabase()` em `readAll()`, e `db/persistence.ts:5–8` executa `CREATE TABLE IF NOT EXISTS` para duas tabelas. Isso mantém duas fontes de declaração de schema e permite escrita estrutural em uma consulta GET. No D1 já migrado tende a ser no-op, mas contraria a separação entre migrations e runtime e pode mascarar schema antigo. Confirmado por inspeção. Remover DDL da leitura apenas com verificação de compatibilidade de banco vazio/legado e testes de inicialização; não alterar o banco como parte desta auditoria.

**Atualização da Etapa 14.1:** D13-01 foi corrigido no código, com testes em bancos isolados vazio, legado e migrado até 0012. O registro acima preserva o diagnóstico original; os resultados atuais estão em [Correção de DDL durante consultas](33-Correcao-DDL-Durante-Consultas.md). Nenhuma migration foi aplicada ao D1 operacional nesta correção.

**D13-02, P2 — listagem cadastral sem paginação.** `db/storage.ts:18–35` busca todas as categorias e informações e serializa `details_json`; `app/page.tsx` distribui a coleção pelos módulos. Impacto potencial é latência/memória conforme o volume cresce. Confirmado por inspeção; degradação em carga não medida. Medir cardinalidade, consultas e payload antes de projetar paginação, preservando busca e rascunhos.

**Atualização da Etapa 14.2:** D13-02 foi corrigido no código com paginação, filtros e contagens no servidor, incluindo seletores auxiliares limitados. O diagnóstico original acima fica preservado. Testes em schema 0012 e Edge com banco sintético confirmaram navegação entre páginas e busca; desempenho em volume operacional alto ainda não foi medido. Detalhes em [Paginação e consultas cadastrais](34-Paginacao-e-Consultas-Cadastrais.md). O D1 operacional não foi alterado.

## 6. Arquitetura e qualidade

`app/page.tsx` tem cerca de 597 linhas e concentra navegação, busca, estado de cadastros, outbox, formulários e composição das telas. O tamanho por si só não é defeito; a dependência direta entre estado de navegação e recuperação de intenção aumenta o custo de regressão em mudanças futuras. `db/storage.ts` ainda exporta métodos legados de escrita que inicializam schema; o caminho novo da API usa `DataOperations`. Antes de remover qualquer exportação é necessário provar ausência de consumidores. Não foi comprovado ciclo circular ou código morto nesta leitura; não se propõe refatoração geral.

**Atualização da Etapa 14.4:** a ausência de consumidores dos quatro métodos legados de `db/storage.ts` foi confirmada por busca de imports e chamadas; eles foram removidos. Os adaptadores de persistência usados somente nos testes foram movidos para `tests/helpers/legacy-persistence.ts`. A duplicação dos seletores paginados e da declaração de tipos cadastrais foi reduzida sem alterar `/api/data` ou o design. O tamanho de `app/page.tsx` continua sem justificar divisão ampla; UX02 e a extração do fluxo de rascunho/navegação exigem etapa própria. Evidências em [Revisão arquitetural pontual](36-Revisao-Arquitetural-Pontual.md).

**Q13-01, P2 — teste intermitente.** A primeira suíte desta etapa teve uma falha em `tests/data-operations.test.ts:48`, no teste de reutilização de chave. O teste constrói três Promises rejeitadas em um array e só depois as aguarda em sequência; uma rejeição pode ser observada como não tratada antes da espera. A repetição aprovou 219/219. Evidência em `tests.log` e `tests-rerun.log`. Corrigir o teste para criar/aguardar cada rejeição imediatamente ou usar `Promise.allSettled`, e repetir a suíte em execuções independentes. Não há evidência de regressão de idempotência no D1.

**Atualização da Etapa 14.3:** Q13-01 foi corrigido no teste, após reprodução com ordem controlada de rejeições. Houve 30 execuções direcionadas, oito suítes completas paralelas de 231 testes e uma suíte serial sem falhas após a correção. Os 20 testes direcionados e cinco suítes anteriores à correção também passaram, confirmando que a falha natural era intermitente. Ver [relatório e evidências](35-Estabilizacao-de-Testes-Intermitentes.md). A observação futura do CI continua necessária; não se afirma impossibilidade de novas intermitências.

## 7. Interface e experiência de uso

Os acompanhamentos 12–14 da auditoria documentam V01–V21 corrigidos, com evidências em Edge real de etapas anteriores. A Etapa 11 acrescentou recuperação de rascunho entre abas e tela móvel de 320 px. Nesta etapa foram inspecionados componentes e estado da navegação, **sem navegador real**; portanto, o fechamento visual histórico é mantido, mas nenhuma revalidação visual atual é declarada. Temas, ícones e identidade não foram alterados. UX02 (URL/Voltar/recarga por seção) permanece como lacuna funcional distinta de V19; leitores de tela/WCAG integral também não foram homologados.

## 8. Matriz de achados e evidências

| ID | Prioridade | Evidência e causa | Impacto | Correção/testes necessários | Estado de prova |
|---|---|---|---|---|---|
| S13-01 | P1 | `services/auth/login-rate-limit.ts`: `Map` local | Rate limit inconsistente entre instâncias | Contador/controle compartilhado ou borda; testar múltiplas instâncias e expiração | Código confirmado; exploração pendente |
| S13-02 | P1 condicional | `package.json`, lockfile, audit; RSC 19.2.6 < 19.2.8 | Possível DoS se Server Functions expostas | Atualização compatível e prova da superfície publicada | Versão/advisory confirmados; alcance pendente |
| D13-01 | P2 | `db/storage.ts:18`, `db/persistence.ts:5–8` | GET podia executar DDL; schema duplicado | Separar healthcheck/migrations, testar legado/vazio/atual | Corrigido na Etapa 14.1; testes de schema aprovados |
| D13-02 | P2 | `db/storage.ts:18–35` | Escala de consulta/payload | Paginação e filtros no servidor; medir carga futura | Corrigido no código e validado em base sintética; carga operacional alta pendente |
| Q13-01 | P2 | `tests/data-operations.test.ts:48`, logs da suíte | CI intermitente/confusão sobre regressão | Criar e aguardar cada rejeição imediatamente | Corrigido; ordem controlada e repetições passaram; monitorar CI |
| A14-01 | P3, novo nesta etapa | `db/storage.ts`: quatro exports sem consumidores | Caminho de escrita paralelo ao fluxo idempotente | Remover wrappers; manter testes legados isolados | Corrigido; 231 testes e build aprovados |
| A14-02 | P3, novo nesta etapa | Seletores de categoria/rota repetiam busca, paginação e recuperação | Correções duplicadas e possível divergência | Compartilhar estado sem mudar apresentação | Corrigido; Edge sintético e testes aprovados |
| A14-03 | P3, novo nesta etapa | `RecordKind` duplicado na consulta e interface | Risco de filtro divergir dos tipos cadastráveis | Reutilizar fonte única `db/data-types.ts` | Corrigido; tipos e filtros validados |
| A14-04 | P3, novo nesta etapa | Erro bruto `Failed to fetch` no seletor | Mensagem inconsistente com a interface | Mostrar erro contextual e permitir retry | Corrigido; falha/retry reproduzidos no Edge isolado |
| UX02 | P2 | `app/page.tsx`, acompanhamento da Etapa 8 | Voltar/recarga perdem seção | Sincronizar estado com URL e testar navegação | Código confirmado; browser atual pendente |
| HTTPS GLPI | Bloqueio externo | Relatório 20, acompanhamento 10 | Login real indisponível com URL HTTP conhecida | Equipe GLPI/rede fornecer HTTPS/cadeia/hostname; homologar controladamente | Diagnóstico histórico; estado atual externo não reverificado |
| Demais advisories | Triagem | `dependency-audit*.json` | Depende de uso/exposição | Separar runtime, build e CLI; atualizar versões após teste | Avisos confirmados; exploração não comprovada |

P01 (baseline e banco) está atendido no D1 local pelas Etapas 6, 7 e 12. P04/A06 foi corrigido no caminho cadastral das Etapas 11–12. V01–V21 foram encerrados no escopo da Etapa 10.4. P02 continua parcialmente dependente de HTTPS; P03, P06–P10 requerem avaliação incremental conforme o plano original. P11/P12/P15 são evoluções de produto e não foram promovidas a defeitos.

## 9. Verificações executadas e evidências

Evidências privadas: `C:\Users\yurit\Lastro-backups\etapa13-20261023T123854Z`. O caminho efetivo está em `C:\Users\yurit\Lastro-backups\etapa13-current-path.txt`. Arquivos: `git-before.txt`, `git-after.txt`, `read-only-db.json`, `dependency-audit.json`, `dependency-audit-prod.json`, `tests.log`, `tests-rerun.log`, `lint.log`, `typecheck.log`, `build.log`.

| Checagem | Resultado |
|---|---|
| Suíte completa, primeira execução | 1 falha intermitente descrita em Q13-01 |
| Suíte completa, repetição | 219 passaram; zero falhas |
| Lint, TypeScript e build | Aprovados; aviso estático de rotas Vinext no build |
| D1 local | Seis hashes físicos iguais aos da Etapa 12; consulta SQLite apenas em cópia |
| Navegador real nesta etapa | Não executado |
| GLPI real / D1 remoto | Não acessados |

## 10. Plano de correções e critério de aptidão

1. **Segurança/integridade:** triagem de RSC e demais advisories por superfície real; teste de upgrade compatível; definir limite de login confiável entre instâncias; completar a varredura formal offline com o helper disponível. Qualquer achado validado terá teste de regressão antes de correção.
2. **Funcionalidade/confiabilidade:** estabilizar Q13-01; resolver DDL em GET com matriz de bancos; medir volume dos cadastros antes de paginação; corrigir URL/Voltar com validação de rascunhos, modais e acessibilidade.
3. **Infraestrutura externa:** obter endpoint GLPI HTTPS aprovado, cadeia e hostname válidos, caminho de rede e perfil/entidade de homologação. A equipe responsável executa alterações de serviço; o Lastro mantém rejeição de HTTP e certificados inválidos.
4. **Homologação:** em cópia isolada, testar navegador desktop/móvel e ambos os temas após correções; em ambiente GLPI de homologação autorizado, validar login e operações com chamados de teste, sem usar o D1 recuperado para escritas reais. Medir erros, reconciliação e rollback.

Critério de aptidão operacional: nenhum P0/P1 comprovado aberto, dependências alcançáveis atualizadas ou mitigadas com evidência, rate limiting efetivo, HTTPS e identidade TLS aprovados em cada salto, perfil GLPI confirmado, migrations/backup/restauração validados no destino, dados existentes preservados, suíte estável, fluxo de chamados/turnos/RFO/cadastros conferido em ambiente de homologação com dados de teste, e aceite explícito do responsável. A aprovação do build ou dos testes locais isoladamente não satisfaz esse critério.

**Acompanhamento de 23/10/2026:** a estabilização de Q13-01 no item 2 foi executada na Etapa 14.3; os demais itens do plano permanecem independentes.

Nenhuma correção ou próxima etapa foi iniciada nesta auditoria.

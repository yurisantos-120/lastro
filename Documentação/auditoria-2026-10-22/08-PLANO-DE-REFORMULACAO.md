# Plano priorizado de reformulação

## Decisão de arquitetura e autorização

Recomenda-se reformulação incremental, preservando cadastros, categorias por escopo, sessão local, roles, controle por revisão e idempotência de chamados. Não foi identificada necessidade de reescrever integralmente o produto. **Este é um plano; nenhuma correção, migration ou alteração de dados foi executada. Implementação depende de nova autorização.**

Classificação: C = fato comprovado; R = risco condicionado; S = evolução sugerida. Prioridades críticas exigiriam correção imediata por impacto demonstrado; altas protegem funcionamento/segurança; médias organizam evolução; baixas refinam experiência. Risco de implementação descreve chance de regressão da proposta, não severidade de uma vulnerabilidade.

## Críticas

**Nenhuma recomendação foi classificada como crítica incondicional com a evidência disponível.** Não foi comprovado comprometimento, bypass anônimo ou perda ativa de dados. Se a verificação operacional confirmar trânsito de credenciais em HTTP por segmento não confiável, promover a proteção de transporte para intervenção imediata. Não esperar reforma visual para resolver essa condição.

## Altas — antes de ampliar uso ou importar

### P01 — Certificar baseline recuperado e destino do banco (ordem 1; C/R)

**Justificativa:** HEAD não representa a aplicação atual; há 31 modificados e 68 arquivos não rastreados, incluindo recursos essenciais. Snapshot local termina em 0006, enquanto o código espera estrutura de importação da 0007.

**Impacto:** recuperação reproduzível e prevenção de operação no banco errado. **Risco de implementação:** alto se combinar versionamento e migração sem backup; baixo para inventário e comparação somente leitura.

**Arquivos:** `package.json`, lockfile, `drizzle/*`, `drizzle/meta/*`, `db/schema.ts`, `vite.config.ts`, `wrangler.d1.local.jsonc`, scripts e documentação de recuperação.

**Execução futura:** identificar instância ativa e D1 real; backup consistente; preservar alterações e separar segredos; ensaiar equivalência numa cópia. Só depois aprovar aplicação da 0007 no destino correto, se importação for entrar em uso. O plano não autoriza commit ou migração por si só.

**Aceite:** reconstrução reproduzível, histórico reconciliado com schema e backup restaurado com sucesso em ambiente isolado; nenhuma perda de registros.

### P02 — Proteger transporte e tentativas de autenticação (ordem 2; C/R)

**Justificativa:** configuração aceita HTTP com Basic/token e rate limit é só em memória; documentação relata uso HTTP anterior, sem confirmação do destino atual.

**Impacto:** proteção de credenciais e disponibilidade do login. **Risco:** médio, por certificados/proxy, cookies e clientes internos legados.

**Arquivos:** `services/glpi/glpi-config.ts`, `glpi-user-auth.ts`, `services/auth/auth-handlers.ts`, `login-rate-limit.ts`, configuração de hospedagem e manual.

**Execução futura:** validar fluxo TLS navegador→Lastro→GLPI, política do proxy e exceção explícita de desenvolvimento; implantar limitação compartilhada sem confiar em header arbitrário.

**Aceite:** TLS validado sem redirects que exponham credenciais, cookie Secure em produção e limite efetivo em múltiplas instâncias; nenhum segredo em log.

### P03 — Completar ciclo de vida de usuários e auditoria (ordem 3; C/R)

**Justificativa:** há bootstrap e roles, mas não administração segura, revogação global ou trilha de alterações. A equipe depende de manutenção manual.

**Impacto:** provisionamento, desligamento e investigação rastreáveis. **Risco:** alto, por tocar autorização e sessões.

**Arquivos:** `services/auth/*`, `db/auth-storage.ts`, `db/schema.ts`, futuras migrations aditivas e telas administrativas; repositórios de cadastros para eventos de auditoria.

**Execução futura:** definir matriz de permissões e política GLPI/local; implementar operações admin com revisão/auditoria, revogação e retenção; garantir bootstrap único. Não sincronizar roles automaticamente sem decisão explícita.

**Aceite:** viewer/operator nunca administram usuários, inativação/revogação impedem novas operações e eventos registram autor/data/ação sem credenciais.

### P04 — Corrigir experiência e contrato de gravação dos cadastros (ordem 4; C/R)

**Justificativa:** erro geral fora do modal; gravação seguida de `readAll()` pode responder falha depois de persistir. Há risco de repetição por usuário sem confirmação clara.

**Impacto:** menor ambiguidade, duplicação e perda de trabalho. **Risco:** médio, por alterar resposta da API e gerenciamento do formulário.

**Arquivos:** `app/page.tsx`, `app/api/data/handlers.ts`, `validation.ts`, `db/storage.ts`, `db/persistence.ts`.

**Execução futura:** separar confirmação de escrita e atualização de consulta; mensagens dentro do modal, pending, sucesso, validação por campo, descarte consciente e estratégia idempotente de criação. Preservar 409 e revisão.

**Aceite:** teste de erro pós-gravação sem segunda inserção, erro visível/focável no modal, conflito não sobrescreve versão atual e cancelamento tem resultado previsível.

### P05 — Fechar lacunas do workflow GLPI antes de modelos (ordem 5; C/R)

**Justificativa:** idempotência já existe, mas chave some ao desmontar; pending/uncertain sem reconciliação; payload reutilizado não é comparado e diagnóstico inventa versão.

**Impacto:** menos duplicações remotas e mais confiança no histórico. **Risco:** alto se repetir criação para tentar resolver incerteza.

**Arquivos:** `components/tickets-section.tsx`, `glpi-test-panel.tsx`, `services/tickets/ticket-workflow.ts`, `db/ticket-storage.ts`, `app/api/glpi/*`.

**Execução futura:** preservar operação em andamento; associar chave a intenção/payload/autor; especificar reconciliação manual/durável sem retry automático incerto; distinguir reenvio de consulta; limitar corpo da abertura; remover versão hardcoded. Manter ambiente de homologação separado.

**Aceite:** timeout/reinício/navegação não geram novo POST automático; mesmos dados/chave reutilizam resultado, divergência é explícita; reconciliação não perde autoria e diagnóstico não apresenta versão não verificada.

### P06 — Definir política de exposição e guard comum de escrita (ordem 6; C/R)

**Justificativa:** listagem para viewer inclui descrição, embora detalhe seja operator; proteção Origin/Content-Type difere entre endpoints.

**Impacto:** política de confidencialidade consistente e redução de cenário CSRF condicionado. **Risco:** médio: reduzir DTO pode quebrar UI/consumidores ou mudar acesso legítimo.

**Arquivos:** `services/auth/api-access.ts`, `app/api/data/route.ts`, `handlers.ts`, `app/api/glpi/tickets/route.ts`, `services/tickets/types.ts`, `db/ticket-storage.ts`.

**Execução futura:** decidir quais campos cada role pode ler; criar DTO mínimo e guard uniforme; manter aprovação de negócio para acesso compartilhado. Limitar bodies antes do parse.

**Aceite:** testes por role/endpoint/campo e requisições de origens distintas; nenhum bypass baseado somente em botão oculto.

## Médias — estrutura e funcionalidade

### P07 — Tornar schema/migrations a fonte única de verdade (ordem 7; C/R)

**Justificativa:** `ensureDatabase` duplica DDL parcial e roda em GET, sem completar schema nem atualizar tabelas antigas.

**Impacto:** inicialização previsível e diagnóstico de versão. **Risco:** alto se retirar o fallback antes de preparar instalações existentes.

**Arquivos:** `db/persistence.ts`, `db/storage.ts`, `db/schema.ts`, `drizzle/*`, scripts de inicialização e healthcheck futuro.

**Execução futura:** após P01, definir processo explícito de preparação e healthcheck sem DDL em consulta; compatibilizar bancos criados pelo fallback. **Aceite:** banco vazio/antigo/atual têm comportamento documentado e nenhuma migration automática surpresa.

### P08 — Contratos de domínio compartilhados e validação técnica (ordem 8; C/R)

**Justificativa:** tipos, listas de campos, título derivado e regras são duplicados; importação aceita registros que a API rejeita; IP de ponto não é validado como os IPs de câmera.

**Impacto:** evolução coordenada de UI/API/importação. **Risco:** médio/alto, pois regras novas podem rejeitar dados legados válidos operacionalmente.

**Arquivos:** `db/data-types.ts`, `app/page.tsx`, `app/api/data/validation.ts`, `db/import-storage.ts`, `db/env.d.ts`.

**Execução futura:** tipos discriminados, validadores reutilizáveis e política de compatibilidade; definir IP/CIDR/IPv6, datas e unidades antes de restringir. **Aceite:** mesmos dados têm resultado coerente nas entradas manual/importada; leitura legada mantém dados e sinaliza problemas sem descartá-los.

### P09 — Extrair responsabilidades da página preservando UX acessível (ordem 9; C/S)

**Justificativa:** 514 linhas misturam shell, consulta, modal, payload e todos os cadastros.

**Impacto:** manutenção por módulo e menor superfície de regressão. **Risco:** médio, por foco/estado/form actions e revisões.

**Arquivos:** `app/page.tsx`, futuros módulos em `components/`, hooks de dados/modal, `app/globals.css`.

**Execução futura:** extrações pequenas depois de P04/P08; não redesenhar tudo simultaneamente. **Aceite:** contratos e fluxos preservados, teclado/Escape/restauração de foco e cenários 409 cobertos.

### P10 — Navegação e consulta endereçáveis, paginação por volume (ordem 10; C/R/S)

**Justificativa:** todo inventário vai ao navegador e navegação não usa URL; histórico de chamados termina em 100.

**Impacto:** consulta compartilhável, menor payload e melhor escala. **Risco:** médio, por alterar filtros, contadores e recenticidade.

**Arquivos:** `app/page.tsx`, `db/storage.ts`, `app/api/data/*`, `db/ticket-storage.ts`, `components/tickets-section.tsx`.

**Execução futura:** medir volume/latência, definir filtros por tipo/categoria, preservar consulta na URL, introduzir paginação e endpoint de resumo quando necessário. **Aceite:** Voltar/recarregar preservam contexto; páginas não omitem/duplicam itens e resumo não depende de uma página parcial.

### P11 — Concluir pipeline de importação com revisão (ordem 11; C/R/S; depende de P01/P07/P08)

**Justificativa:** só existe storage; tabelas ainda não estão no snapshot e mudança de fingerprint não libera reimportação.

**Impacto:** entrada confiável e rastreável de dados. **Risco:** alto, por volume, origem e duplicidades.

**Arquivos:** `db/import-storage.ts`, `db/schema.ts`, `drizzle/0007_import_tracking.sql`, futuras entradas de importação e UI de lote/origem.

**Execução futura:** prévia sem gravar, mapeamento, rejeição de segredos, revisão de conflitos/hash, autorização, conclusão transacional e relatório por lote. **Aceite:** lotes repetidos/concorrrentes não duplicam origem; status final coincide com contadores e rejeições; erro não deixa informação sem rastreio. Não importar dados nesta auditoria.

### P12 — Definir domínio de fibra e equipamentos antes de modelar (ordem 12; C/S)

**Justificativa:** “rota” é texto e referências de ONU/OLT/VLAN não são vínculos reais.

**Impacto:** habilita topologia, análise de impacto e chamados contextuais. **Risco:** alto, por transformação do modelo e de cadastros existentes.

**Arquivos:** `db/schema.ts`, `db/data-types.ts`, formulários/detalhes/pesquisa e futuras migrations aditivas.

**Execução futura:** validar exemplos de origem/destino/trecho/emenda/porta/equipamento com a operação; elaborar modelo e conversão assistida, mantendo consulta dos textos antigos. **Aceite:** cenários reais aprovados e reconciliação sem perda antes de retirar campos legados.

### P13 — Completar verificação de qualidade e atualizar manual (ordem transversal; C/S)

**Justificativa:** 44 testes passaram, mas testes de migrations, E2E visual e runtime completo ficaram fora; manual contradiz guards/login atuais.

**Impacto:** mudanças revisáveis e reprodução por outra pessoa. **Risco:** baixo/médio; CI deve usar apenas dados e serviços sintéticos.

**Arquivos:** `tests/*`, `package.json`, scripts de ambiente, README e `Documentação/docs/03`, `04`, `05`, `09`, `10`, `11`.

**Execução futura:** separar testes unitários dos testes com migrations, matriz HTTP, E2E/acessibilidade, Worker isolado e pipeline CI; corrigir manual após consolidar decisão. **Aceite:** resultados reproduzíveis, cobertura declarada, comandos seguros e nenhuma conexão ao GLPI real nos testes automáticos.

## Baixas — refinamentos após confiabilidade

### P14 — Consolidar tokens visuais e refinamentos de navegação (ordem 13; C/S)

**Justificativa:** cores diretas/overrides, tema sem controle móvel, busca sem nome acessível explícito e pouco contexto por módulo. As correções acessíveis básicas podem acompanhar P04/P09, sem esperar acabamento.

**Impacto:** consistência e consulta mais confortável. **Risco:** baixo/médio, por contraste e CSS global.

**Arquivos:** `app/globals.css`, shell, listas, formulários e componentes UI utilizados.

**Aceite:** contraste medido, teclado, zoom e telas pequenas verificados; tokens preservam hierarquia e identidade Lastro. Não remover biblioteca inteira por estar parcialmente sem uso.

### P15 — Modelos de chamados, exportação e métricas (ordem 14; S)

**Justificativa:** modelos ainda são placeholder; exportação e métricas de consulta não estão implementadas. São evolução, não condição para reescrever os cadastros.

**Impacto:** produtividade e acompanhamento. **Risco:** médio, por informações exportadas e conteúdo gerado para GLPI.

**Arquivos:** `components/tickets-section.tsx`, workflow, contratos de domínio e futuros serviços de relatório.

**Aceite:** modelos validados com a operação, prévia do conteúdo, exportação respeita perfis e métricas não coletam termos/segredos sem necessidade.

## Sequência de entregas revisáveis

1. **Base segura:** P01 e verificação de transporte de P02; certificar backup/destino e baseline sem migrar por suposição.
2. **Uso confiável:** P02–P06, com matriz de testes de P13; resolver sessão, gravação, incerteza e acesso por campo.
3. **Organização incremental:** P07–P10, mantendo compatibilidade e medindo desempenho.
4. **Ampliação de domínio:** P11/P12 em escopos aprovados separadamente.
5. **Acabamento e produtividade:** P14/P15, com avaliação visual real.

Cada entrega deve ter critério de aceite, plano de retorno e revisão dos contratos afetados. Estimativas de esforço dependem de requisitos operacionais ainda não definidos; não se inventou cronograma nem autorização de implementação.

# Etapa 10.4 — Conclusão da padronização visual

**23/10/2026 — America/Sao_Paulo.** V11 e V19 foram corrigidos e validados individualmente. Os 21 achados estão encerrados **no escopo visual original e nos cenários verificados**, com as limitações descritas abaixo. Isso não encerra as pendências funcionais de HTTPS, idempotência cadastral ou homologação com infraestrutura real.

## Reconhecimento, isolamento e preservação

Lidos os capítulos 21–24 e os acompanhamentos 12/13, incluindo definições originais, impactos e evidências de V11/V19. Conferidos código atual e Git, com 111 entradas de alterações preexistentes. Uma cópia anterior de fontes preserva esse estado; a comparação desta etapa usa essa linha de base, não o diff inteiro contra HEAD.

Evidências privadas:

```text
C:\Users\yurit\Lastro-backups\etapa10-4-20261023T110842Z
```

Contém `source-before`, `test-app`, banco isolado, scripts CDP, JSONs de resultados, logs e 29 capturas, incluindo tentativas intermediárias. Nenhum backup anterior foi sobrescrito. O diretório não deve ser publicado integralmente: a cópia isolada contém registros recuperados além dos dados sintéticos dos cenários.

Banco isolado criado com backup SQLite a partir de `etapa8-20261022T234013Z/isolated-final.sqlite`; o D1 operacional não foi aberto. Runtime compilado separadamente com os adaptadores simulados de autenticação/GLPI já usados nas etapas anteriores, sem `.env` operacional. Edge real headless com perfil próprio, CDP 9333 e Worker em `127.0.0.1:8899`. Inventário e falhas foram fixtures CDP; outras mutações foram bloqueadas, exceto autenticação sintética. Perfil admin simulado apenas na apresentação, sem promover usuários no servidor.

Ao final, os seis hashes do D1 operacional, incluindo WAL/SHM e metadata, coincidiram com os iniciais (`operational-before.json`/`operational-after.json`). `.env` também inalterado. Não foram alterados arquivos de API, serviços, banco, migrations ou journal; sem migrations, credenciais reais transmitidas, operações GLPI reais, commit ou push. Worker e Edge exclusivos da homologação encerrados, sem listeners nas portas 8899/9333.

## V11 — Contrato dos painéis

**Causa:** a Etapa 10.3 padronizou os campos cadastrais, mas os painéis ainda montavam labels, ajuda, erros e loading separadamente. O componente só identificava controles com `name`, enquanto os painéis operacionais usam estado controlado e IDs. A RFO tem requisitos condicionais, que não podem ser apresentados como obrigatórios durante toda investigação.

**Correção:** expandido o `FormField` existente para reconhecer controles por ID/tipo/propriedades controladas, sem exigir novos nomes de envio. Preserva ID, valor, callbacks, required nativo e descrições anteriores. Label, indicação de obrigatoriedade, ajuda e erro conhecido possuem associação explícita. Erros nativos de validação agora são anunciados junto ao controle e limpam ao editar; não houve substituição dos validadores do servidor.

Migrados campos de acompanhamento, RFO, passagem, integração GLPI, abertura e filtros do dashboard. Seletores de situação mantêm sua semântica de seleção, sem serem chamados indevidamente de opcionais. Na RFO, causa é anunciada como obrigatória ao confirmar a investigação ou concluir; descrição técnica e solução, ao concluir. Essas indicações usam `aria-required` e ajuda, sem acrescentar bloqueios nativos de submissão. A causa continua opcional em investigação. Na pendência, somente a justificativa conserva `required`; observações e orientações continuam opcionais.

Erros gerais continuam gerais: ligados ao formulário por `aria-describedby`, sem adivinhar qual campo falhou por interpretar mensagens da API. Os painéis reutilizam `Alert`/`AlertStatus` para erro, sucesso e carregamento, preservando estados de integração e mensagens de resultado incerto. Salvar, confirmar, recarregar, recolher e sair mantêm suas regras; não foi criado um novo fluxo de cancelamento ou descarte de rascunho.

**Validação individual no Edge:** labels e ajuda da RFO associados, mudanças investigação/causa confirmada/conclusão, requisito de pendência, erro nativo junto ao select e rascunhos preservados após falhas simuladas em RFO, passagem e integração. Formulários cadastrais novamente verificados nos cinco tipos. Capturas: `before-rfo-*`, `after-rfo-*`, `after-native-error-*`, `after-handoff-error` e `confirmed-rfo-dark`.

## V19 — Fluxo da Visão geral

**Causa:** composição sequencial com filtros extensos e resultados do NOC antes da base; em celular a primeira área visível era dominada pelos filtros, e o acesso à base variava conforme o volume de chamados. Reproduzido no build anterior, em `before-overview-mobile-false.png`.

**Correção mínima:** navegação local entre “Painel operacional” e “Base de conhecimento”, com foco no título correspondente; as duas seções permanecem montadas. Os filtros do `TicketDashboard` usam expansão nativa, recolhida inicialmente, e indicam quando há filtros aplicados. Agrupamento, paginação, indicadores, resultados e passagem permanecem na composição. Como o dashboard é reutilizado, a expansão de filtros também se aplica a Chamados.

Não foram alteradas consultas, contagens, estado dos filtros, acesso a detalhes, fuso, seleção de ocorrências antigas ou dados GLPI. Recolher filtros não limpa nem reaplica a consulta. Ir à base e voltar não desmonta o dashboard nem gera outra leitura; não há troca de tela, modal ou novo dashboard.

**Validação individual no Edge:** filtros inicialmente recolhidos, expansão e aplicação funcionais, foco nos dois destinos, dashboard preservado e ausência de nova consulta ao saltar de seção. Desktop e celular, claro/escuro. Evidências: `verified.json`, `after-knowledge-*`, `after-overview-*`, `confirmed-overview-mobile-dark.png` e `confirmed-knowledge-mobile-dark.png`.

## Matriz final V01–V21

| ID | Estado no escopo original | Regressão efetivamente conferida nesta etapa |
|---|---|---|
| V01 | Encerrado | Erro dentro do modal nos cinco formulários; 28 asserções cadastrais incluem esses casos |
| V02 | Encerrado | Valores preservados em 400/409/503; nova tentativa com um envio; resultado incerto bloqueado; recarga de conflito explícita |
| V03 | Encerrado | Erro de RFO com contraste computado acima de 4,5:1 nos dois temas; alertas nativos/painéis examinados |
| V04 | Encerrado | Legenda escura mantém foreground legível existente; formulário a 320 px e capturas em ambos os temas |
| V05 | Encerrado | CTA laranja mantém foreground escuro; razão computada acima de 4,5:1; sem mudança de paleta |
| V06 | Encerrado | Hover forçado no Edge não recupera o fundo azul conflitante; captura `after-hover-dark` |
| V07 | Encerrado | Consulta atrasada sem falso vazio; erro e recuperação da coleção; suíte de componente cobre vazio real |
| V08 | Encerrado | Busca acompanha rolagem e fica fora da área visível ao consultar painéis inferiores |
| V09 | Encerrado | Superfícies de RFO/acompanhamento computadas iguais nos dois temas; integração e passagem examinadas |
| V10 | Encerrado | Inputs/selects cadastrais com 40 px nos dois temas; ausência de overflow no diálogo a 320 px |
| V11 | Encerrado | Contrato compartilhado nos painéis; requisitos condicionais, ajuda, erro nativo, feedback geral e rascunho validados individualmente |
| V12 | Encerrado | Destino móvel ativo totalmente visível; barra e seus ícones preservados |
| V13 | Encerrado | Nome estável da busca, foco ao expandir e foco/valor ao limpar |
| V14 | Encerrado | Enter real via CDP ativa Rotas, atualiza título/aria-current e leva foco ao título |
| V15 | Encerrado | Resumo e títulos completos permanecem nas listas; conferência em celular e no DOM |
| V16 | Encerrado | Detalhes incluem número GLPI/local no nome acessível; revisões mantêm identificação por chamado/revisão |
| V17 | Encerrado | Duas novas navegações de login com preferência dark/light; `login-results.json` |
| V18 | Encerrado | Último campo acima do rodapé a 320 px; Tab contido e Escape funcional; capturas dos painéis longos |
| V19 | Encerrado | Atalhos entre seções e filtros expansíveis testados individualmente, sem remontagem/nova consulta |
| V20 | Encerrado | Disponibilidade “Modelos de chamado (em breve)” permanece explícita; modelos não implementados |
| V21 | Encerrado | Preferência de movimento reduzido emulada: transições próprias computadas em 0s |

Não existem menus dropdown nas telas principais auditadas: foram verificados navegação, diálogo, seletores e expansões nativas existentes, sem introduzir um menu novo. Revisão de IDs não equivale a auditoria WCAG integral ou validação de toda combinação de dados e permissões.

## Arquivos alterados

- `components/form-field.tsx`: contrato de campo, ajuda/erro e indicação condicional.
- `components/ticket-operations-panel.tsx`, `components/rfo-panel.tsx`, `components/handoff-panel.tsx`, `components/glpi-integration-panel.tsx`, `components/tickets-section.tsx`: adoção do contrato e feedbacks existentes.
- `components/ticket-dashboard.tsx`: campos/feedbacks compartilhados e filtros expansíveis.
- `app/page.tsx`: atalhos e foco das seções da Visão geral.
- `tests/visual-refinements.test.ts`: quatro regressões adicionais.
- Documentação: este capítulo, acompanhamento 14, índice e notas de atualização nos documentos 21/24 e acompanhamento 13. Os relatos anteriores permanecem históricos.

Não houve nova paleta, ícone, CSS global, API, dependência ou migration nesta etapa. As alterações anteriores foram mantidas.

## Testes executados

| Verificação | Resultado |
|---|---|
| `npm test` | **200 testes aprovados, zero falhas**; 196 anteriores e quatro novos |
| `oxlint` | Aprovado |
| `tsc --noEmit --incremental false` | Aprovado |
| `vinext build` | Aprovado; também na cópia isolada |
| Edge — `critical-regression.mjs` | 28 asserções aprovadas |
| Edge — `verify.mjs` | 40 asserções aprovadas |
| Edge — `supplement.mjs` | 10 asserções aprovadas |
| Edge — login | Duas verificações aprovadas; total **80 verificações de navegador** |

Novos testes renderizam componentes reais: controle operacional sem name; erro associado sem perder ajuda/descrição prévia; requisito condicional sem alterar validação nativa; filtros recolhidos mantendo controles e passagem. A suíte completa mantém cobertura de autorização, persistência, concorrência, históricos, dashboard, RFO, passagem e integração simulada.

Logs finais: `tests-confirmed.log`, `lint-confirmed.log`, `typecheck-confirmed.log`, `build-confirmed.log`, `build-isolated-confirmed.log`. Resultados de navegador: `browser-regression-results.json`, `verified.json`, `supplement-results.json`, `login-results.json`. Capturas de falhas de sonda e JSONs `*-failure` são intermediários; a evidência aprovada corresponde às execuções finais. A primeira tentativa de Enter da sonda não incluía o caractere requerido pelo CDP; a sequência foi corrigida sem mudar a aplicação. Uma tentativa de integração foi interrompida corretamente pelo campo obrigatório vazio; o teste de falha remota foi repetido com conteúdo preenchido.

O build mantém o aviso conhecido do Vinext sobre classificação estática de algumas rotas, sem falha de compilação.

## Limitações e pendências remanescentes

Edge real headless com viewports emulados: 1440×1000, 390×844 e verificação adicional a 320×740. Não houve aparelho físico, leitor de tela, zoom exaustivo, todos os estados/cores de categorias ou base volumosa. Sucesso de cada transação de negócio e persistência após recarga não foram repetidos integralmente no navegador; esses casos têm cobertura automatizada e evidências anteriores. Gravações cadastrais e falhas operacionais desta rodada foram respostas simuladas, sem efeito no banco operacional.

Permanecem separadas: HTTPS oficial do GLPI e homologação real autorizada; idempotência cadastral entre abas/recargas; navegação por URL/Voltar e decisões de volume de inventário; limitação conhecida do Worker isolado em determinadas recargas da homologação anterior. Nenhuma dessas pendências foi declarada resolvida por alteração visual. O login operacional pode continuar retornando 503 enquanto não houver configuração HTTPS válida; o teste de login desta etapa usou exclusivamente o provedor simulado.

Não iniciar automaticamente outra etapa.


## Atualização da Etapa 11 — 23/10/2026

A pendência funcional de idempotência cadastral entre abas e recargas recebeu implementação persistente e validação isolada na Etapa 11. A ativação da migration 0012 no D1 operacional permanece pendente de autorização específica. O estado histórico acima registra a conclusão da Etapa 10.4. Consulte o [relatório da Etapa 11](26-Confiabilidade-e-Idempotencia-Cadastral.md) para contrato, testes, evidências e limites.

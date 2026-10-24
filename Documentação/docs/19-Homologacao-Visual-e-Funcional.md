# Etapa 8 — Homologação visual e funcional

## Resultado e limites

Execução em 22/10/2026, horário de São Paulo. Homologação funcional **aprovada nos cenários isolados descritos abaixo**, após duas correções pequenas. **Acesso autenticado ao ambiente operacional e integração GLPI real permanecem sem homologação.** Não houve publicação, commit, push, migration nova ou avanço para outra etapa.

Foi utilizado Microsoft Edge real em modo headless, controlado pelo protocolo CDP, com perfil separado e capturas PNG da aplicação renderizada. Desktop: 1440×1000; móvel: viewport emulado de 390×844. Isso não equivale a teste em aparelho físico, inspeção humana interativa ou certificação de acessibilidade.

## Retomada após interrupção

O diretório existente foi reaproveitado somente depois de conferir seu conteúdo:

```text
C:\Users\yurit\Lastro-backups\etapa8-20261022T234013Z
```

Não havia runtime Lastro/Workerd em execução nem escuta nas portas de homologação. Processos Node dos conectores e instâncias pessoais do Edge foram preservados. Existiam `manifest.json`, `operational-before`, `source-before`, `test-app`, `dist-before` e `screenshots`; não existiam resultados de navegador ou testes desta etapa. Nenhum backup foi sobrescrito.

Foram comparados 458 arquivos, considerando o código preservado contra o projeto e os diretórios de aplicação da cópia de teste. A coorte física de seis arquivos do banco, incluindo WAL/SHM e metadados, coincidiu integralmente com `after-files.json` da Etapa 7. Uma nova **cópia de verificação**, separada do backup preservado, foi aberta com SQLite. Confirmou `integrity_check=ok`, zero violações FK e 12 migrations (0000–0011). Catálogo SQL e todas as linhas coincidiram com `etapa7-20261022T232249Z/after.sqlite`.

O snapshot canônico `verified.sqlite` foi produzido pela API SQLite de backup a partir dessa cópia completa. Não se usou o arquivo principal isoladamente: o WAL operacional contém parte do estado migrado. `resume-verification.json` registra a validação. A pasta da Etapa 7, seu backup anterior e seus artefatos finais permaneceram intactos.

## Ambientes e proteção dos dados

| Ambiente | Execução | Permissões efetivamente utilizadas |
|---|---|---|
| Projeto `C:\Users\yurit\meus projetos\lastro` | Build atual; Worker local em `127.0.0.1:8787` | Somente página pública e GET anônimo `/api/auth/me`; sem login ou escrita |
| `etapa8-…/test-app` | Cópia do código; Worker em `127.0.0.1:8899` | Login, leitura e escrita exclusivamente sintéticos |
| `etapa8-…/test-state` | Cópia do snapshot migrado | Usuários de teste novos, chamados e históricos sintéticos |

Binding **DB**, ID local `00000000-0000-4000-8000-000000000000`, persistência operacional `.wrangler/state/v3/d1/miniflare-D1DatabaseObject` e arquivo `faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite` conferidos. O runtime operacional utilizou caminhos absolutos de configuração e persistência do projeto, `--local`, `--env-file` existente e `--ip 127.0.0.1`. Não se usou D1 remoto.

Na cópia descartável, apenas os adaptadores de runtime de autenticação e GLPI foram substituídos por simuladores locais. O `AuthService`, cookies, sessões, guards, handlers, repositórios, validações e formulários reais continuaram em uso. Foram acrescentados três usuários sintéticos à cópia, sem modificar usuários recuperados. A configuração/credenciais operacionais não foram copiadas para `test-app`. Os simuladores não fazem requisições de rede; o navegador permitiu apenas o servidor local em teste. Na inspeção operacional, a interceptação permitiu somente GETs de recursos públicos e `/api/auth/me`.

Não foram usadas sessões recuperadas para autenticar. Leituras autenticadas atualizam `last_seen_at`; por isso os testes autenticados ocorreram exclusivamente na cópia. Os dois Workers e a instância separada do Edge foram encerrados ao terminar.

## Validação efetiva em navegador

| Tela / fluxo | Resultado observado no Edge |
|---|---|
| Login isolado | Entrada e saída de operadores sintéticos; perfil de visualização identificado. Entrada por eventos de teclado CDP também validada. Senha não aparece nas capturas |
| Dashboard | Indicadores distintos de estado operacional, abertura confirmada/incerta e status GLPI; chamados antigos continuam visíveis; aviso e acesso aos detalhes |
| Filtros e agrupamento | Número GLPI exato reduz a lista a um registro; agrupamento por situação; filtro sem resultado mostra lista vazia. Demais combinações de filtros são cobertura automatizada |
| Acompanhamento | Pendência sem justificativa bloqueada pela validação nativa; justificativa preenchida salva; orientações vazias aceitas; normalização registrada sem exigir conclusão prévia da RFO |
| Histórico | Movimentações anteriores permanecem visíveis; dados e estado persistem ao recarregar e reabrir o detalhe |
| RFO | Investigação existente sem causa definitiva consultada; edição para causa confirmada/concluída; revisão 2 e revisão 1 consultáveis; solução persiste após recarga |
| Passagem de turno | Prévia, observações/orientações opcionais, confirmação da entrega por operador 1, aviso discreto e recebimento por operador 2; navegação não bloqueada |
| Turno noturno | Seleção/atualização de prévia mostra término às 07h do dia seguinte; prévia não foi entregue novamente |
| Snapshot da passagem | Após atualização simulada do título do chamado, o resumo entregue mantém o título anterior e o recebimento registrado |
| GLPI simulado | Reconciliação, sincronização, atualização de título/descrição, solução em status 5 e fechamento confirmado em status 6. O acompanhamento local Pendente permaneceu independente, com divergência explícita |
| Abertura simulada | Novo chamado confirmado e registrado; outra criação simulada retorna Resultado incerto, sem botão de reenvio automático |
| Perfil de visualização | Ação de abertura ausente; tentativa PUT de movimentação pelo navegador recusada com HTTP 403 |
| Erros e carregamento | HTTP 503 e atraso de resposta injetados pelo CDP no dashboard exibem erro e carregamento específicos; retorno à consulta normal verificado |
| Responsividade e tema | Dashboard claro/escuro em desktop e 390 px; detalhes/RFO e passagem inspecionados em viewport móvel. Sem expansão horizontal do documento nos pontos medidos |
| Teclado e acessibilidade básica | Labels/required dos formulários inspecionados, bloqueio nativo da pendência observado; Tab desloca foco para controle da aplicação. Não foi executado percurso completo exclusivamente por teclado |

As capturas foram abertas e inspecionadas visualmente; não se substituiu essa inspeção por renderização estática. Houve ajustes no roteiro CDP por seletores, método HTTP e temporização de preenchimento. Falhas dessas primeiras asserções não foram tratadas como bugs comprovados: os estados foram consultados antes de prosseguir, evitando repetir gravações já concluídas.

## Problemas comprovados e correções

1. **Contraste do título do login:** o seletor global `main h1` impunha texto escuro sobre o painel escuro no tema claro. Foi acrescentada uma classe específica e uma regra de cor branca restrita ao título. A captura posterior e o estilo computado `rgb(255, 255, 255)` confirmaram a correção. Sem mudança de identidade visual ou fluxo de autenticação.
2. **Contagem de alterações D1 com triggers de integração:** a reserva esperava `meta.changes === 1`, embora a escrita também registre histórico por trigger. Uma reserva nova era reconhecida como repetida e permanecia pendente; a finalização podia gravar o resultado e ainda reportar conflito. A verificação agora reconhece zero como ausência de escrita, mantendo CAS por revisão, triggers, batch e índices existentes. O `changes()` usado dentro do SQL permanece sem alteração. Novo teste simula contagens que incluem triggers e verifica execução, confirmação, cache e replay sem eventos duplicados. Repetição dos fluxos no Worker real local confirmou a correção.

Nenhuma mudança estrutural, alteração de migration ou correção automática de configuração operacional foi feita. Instrumentação temporária de diagnóstico existiu somente em `test-app` e foi removida antes do build final. Simuladores e fixtures não foram incorporados ao projeto.

## Impedimento operacional observado

No runtime original, o Edge exibiu **“Não foi possível verificar a sessão. Tente novamente.”**. GET anônimo `/api/auth/me` retornou **503 / AUTH_PROVIDER_UNAVAILABLE**. Foi conferido somente o protocolo da configuração, sem imprimir endereço, tokens ou credenciais: o GLPI local está configurado como **HTTP**, enquanto o código exige **HTTPS**.

Não houve POST de login nesse ambiente nem contato com o GLPI real. Não foi alterada a configuração para contornar o bloqueio. Portanto, dashboard e demais telas **não foram homologados com a identidade operacional**, embora tenham sido exercitados com sessão/autorização reais do Lastro e provedor simulado na cópia. Disponibilizar endpoint GLPI HTTPS válido, certificados, permissões e conectividade exige procedimento próprio autorizado. Não aprovar a disponibilização operacional com base apenas nos testes isolados.

## Testes automatizados e verificações de banco

Executados após as correções:

| Verificação | Resultado |
|---|---|
| Suíte completa | **187 testes aprovados**, zero falhas, cancelamentos ou skips |
| Regressão GLPI | Contagem com triggers, confirmação e replay aprovados |
| Oxlint | Exit code 0 |
| TypeScript `--noEmit --incremental false` | Exit code 0 |
| Build do projeto original | Exit code 0 |
| Build da cópia com simuladores | Exit code 0 |
| Integridade inicial e final da cópia | `integrity_check=ok`; zero violações FK |
| Catálogo e migrations da cópia | Schema igual ao snapshot inicial; 12 migrations, nenhuma nova |
| Registros recuperados na cópia | **38 linhas integrais comparadas e preservadas**, incluindo as 12 do ledger |
| Banco operacional após runtime público | Todos os seis arquivos com SHA-256 idêntico à Etapa 7, inclusive WAL/SHM e metadados |

Comandos utilizados no projeto, com logs privados no diretório de evidências:

```powershell
node --experimental-strip-types --test tests/*.test.ts tests/*.test.mjs
node node_modules/oxlint/bin/oxlint
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/vinext/dist/cli.js build
```

Permanece o aviso conhecido do Vinext sobre classificação estática de rotas. Nenhum teste automatizado utilizou GLPI real. Os testes de concorrência, rollback, idempotência, paginação com múltiplas páginas, fronteiras de data/fuso e filtros combinados pertencem à suíte automatizada; não se atribui a eles homologação visual.

| Dados operacionais | Antes | Depois |
|---|---:|---:|
| Usuários | 1 | 1 |
| Sessões | 7 | 7 |
| Tickets | 3 | 3 |
| Categorias / informações | 7 / 7 | 7 / 7 |
| Bootstrap / ledger de migrations | 1 / 12 | 1 / 12 |
| Tabelas das implementações novas | Vazias | Vazias |

Na cópia sintética final: 4 usuários, 11 sessões, 9 tickets, 3 acompanhamentos, 6 eventos operacionais, 1 RFO/2 revisões, 1 passagem/1 recebimento e 6 operações GLPI/12 eventos. Esses números **não são do banco operacional**. A cópia final canônica está em `isolated-final.sqlite`. Não houve necessidade de recuperação.

## Evidências e capturas

No diretório privado da Etapa 8:

- `manifest.json`, `resume-verification.json`, `operational-before/`, `verified.sqlite`: origem e consistência confirmadas.
- `tests-final.log`, `regression-glpi.log`, `lint-final.log`, `typecheck-final.log`, `build-project-final.log`, `build-final.log`: validações.
- `operational-public-result.json`: retorno 503 e protocolo verificado, sem credenciais.
- `browser-final-state.json`, `isolated-final-verification.json`: persistência, integridade e preservação.
- `final-operational-preservation.json`: hashes finais dos seis arquivos operacionais.
- `screenshots/`: capturas reais, incluindo tentativas intermediárias; nomes não substituem a leitura do conteúdo.

Capturas representativas: `24-login-desktop-corrected.png`, `11-dashboard-desktop-light.png`, `12-dashboard-desktop-dark.png`, `14-dashboard-mobile-light.png`, `04-pending-required.png`, `05-rfo-completed.png`, `10-handoff-received.png`, `18-glpi-solution-and-close-simulated.png`, `19-ticket-created.png`, `20-creation-uncertain.png`, `21-empty-dashboard.png`, `22-dashboard-api-error.png`, `23-dashboard-loading.png`, `26-viewer-read-only.png`, `33-rfo-mobile-confirmed-light.png`, `34-rfo-mobile-confirmed-dark.png`, `36-glpi-update-confirmed.png`. A captura `28-operational-public-login-only.png`, apesar do nome inicial, mostra a **indisponibilidade de sessão**, não um login operacional aprovado.

O diretório contém cópias de dados recuperados e artefatos privados. Não publicar seu conteúdo integral. Nenhuma credencial operacional foi incluída no relatório ou nas capturas selecionadas.

## Arquivos do projeto alterados nesta etapa

- `components/auth-provider.tsx`: classe do título de login.
- `app/globals.css`: contraste restrito ao título.
- `db/glpi-integration.ts`: interpretação da contagem D1 em reserva/finalização.
- `tests/helpers/d1-memory.ts`: modo opcional de contagem incluindo triggers.
- `tests/glpi-integration.test.ts`: regressão de execução/confirmação/replay.
- Este capítulo, índice da documentação, referência no capítulo 16 e acompanhamento da auditoria.

Builds atualizaram artefatos gerados em `dist`; o estado anterior foi preservado em `dist-before`. Alterações preexistentes foram mantidas. Migrations, snapshots e journal não foram modificados.

## Pendências e funcionalidades não verificadas

- Resolver, por procedimento autorizado, o impedimento HTTPS do provedor operacional; depois homologar login real e permissões efetivas. Nenhuma operação real de chamado está autorizada por esta entrega.
- Versão efetiva do GLPI, certificados, plugins, templates, campos obrigatórios, políticas de solução/fechamento e falhas de transporte real não foram testados. O simulador não certifica esses contratos remotos.
- Busca flutuante pode sobrepor títulos/campos ao rolar; revisar posicionamento e contexto de navegação no redesign. Navegação inferior móvel requer rolagem horizontal para acessar todas as áreas.
- Navegação por URL/Voltar, preservação de contexto ao recarregar, indicação de página atual no desktop e modelos de chamado continuam pendências da auditoria. Recarregar retorna à visão geral; os dados salvos persistem.
- Não houve teste em telefone físico, outros navegadores, leitor de tela, percurso completo por teclado, zoom 200%, medição abrangente WCAG/contraste, base volumosa no navegador, latência sustentada ou concorrência entre duas instâncias visuais.
- O perfil admin e os formulários gerais de inventário não foram homologados visualmente nesta rodada. As permissões correspondentes permanecem cobertas pela suíte existente, dentro dos casos nela definidos.
- Filtros combinados, múltiplas páginas e rollback/concorrência foram validados automaticamente, sem reivindicar inspeção visual de todos esses cenários.

O acompanhamento da auditoria está em [09-Acompanhamento-Etapa-8.md](../auditoria-2026-10-22/09-Acompanhamento-Etapa-8.md). A Etapa 8 termina com ambientes encerrados, banco recuperado preservado e sem início automático de outra implementação.

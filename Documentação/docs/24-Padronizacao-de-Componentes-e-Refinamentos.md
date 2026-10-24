# Etapa 10.3 — Padronização dos componentes e refinamentos

Atualização posterior: V11 e V19 concluídos na [Etapa 10.4](25-Conclusao-da-Padronizacao-Visual.md), com validação individual. O texto abaixo preserva o resultado e as pendências existentes ao terminar a Etapa 10.3.

Data: **23/10/2026**, America/Sao_Paulo. Escopo: P2/P3 V09–V21 da auditoria visual. Identidade, Geist, cores principais, Lucide, sidebar, barra móvel, listas acionáveis e diálogo nativo preservados. Não foram criadas tabelas, menus ou novas telas para substituir os componentes atuais.

## Preparação e preservação

Lidos os capítulos 21, 22, 23 e o acompanhamento 12; código atual e evidências anteriores confrontados com nova reprodução no Edge. Git inspecionado com alterações preexistentes extensas; não foi usado reset nem o diff contra HEAD como delimitação desta etapa.

Linha de base, cópia de fontes sem `.env`/`.dev.vars`, ambiente isolado, scripts e capturas:

```text
C:\Users\yurit\Lastro-backups\etapa10-3-20261023T104110Z
```

O banco isolado foi produzido com o mecanismo de backup SQLite a partir de `etapa8-20261022T234013Z/isolated-final.sqlite`, sem abrir o D1 operacional. Nenhuma migration foi executada. O build isolado usa os adaptadores simulados de autenticação e GLPI da homologação anterior. O Edge acessou somente loopback, porta 8899, com perfil separado/CDP 9333. Inventário e falhas de gravação vieram de fixtures CDP; demais mutações foram bloqueadas, exceto login/logout sintéticos. O perfil admin foi simulado apenas na apresentação do frontend, sem alterar permissões no servidor.

A primeira cópia do build operacional foi descartada como runtime de teste antes de qualquer navegação; foi feita compilação própria com os adaptadores simulados. Os testes visuais aqui relatados usam esse build isolado. Não houve autenticação ou operações GLPI reais, nem alteração de credenciais, commit ou push.

## Resultado por achado original

| ID | Situação | Reprodução/causa | Menor correção e evidência |
|---|---|---|---|
| V09 · P2 | Corrigido | RFO computava superfície neutra, enquanto acompanhamento usava RGB(17,29,44) no mesmo detalhe | `--card` escuro e seu foreground reutilizam o azul/texto existentes. RFO e acompanhamento agora computam RGB(17,29,44); integração e passagem também consomem esse token. `before-measurements.json`, `confirmed-measurements.json`, `before-detail-true.png` e `confirmed-detail-true.png` |
| V10 · P2 | Corrigido nos controles atuais | No formulário de câmera: select 36 px e inputs 32 px; textarea cadastral tinha implementação própria | Input padrão e select de formulário alinhados em 40 px; login preserva override de 48 px e ações compactas continuam compactas. Textarea cadastral reutiliza a primitiva. Campos medidos em 40 px nos dois temas; capturas `before-camera-*`/`confirmed-camera-*` |
| V11 · P2 | Parcial; pendente de conclusão | Labels cadastrais de 12 px, required sem indicação uniforme e ajuda junto ao label implícito | Criado `FormField`: label de 14 px com htmlFor/id, obrigatório/opcional segundo o required existente, ajuda ligada por aria-describedby, preservando associação anterior. Título/descrição de abertura indicam obrigatoriedade. A migração integral dos contratos condicionais e de erros por campo dos painéis operacionais permanece pendente; não se inventou associação de erro de negócio a um campo quando a API só fornece erro geral |
| V12 · P2 | Corrigido | Barra com oito destinos, 552 px de conteúdo em viewport de 390 px; scrollbar escondida | Scrollbar fina visível, descrição de navegação com orientação de deslize, foco com contorno e item ativo revelado ao navegar/redimensionar. Edge confirmou último destino completamente visível, mantendo a barra e seus ícones; `after-mobile-nav-last.png` |
| V13 · P2 | Corrigido | Input dependia de placeholder; expansão sem foco e limpeza manual | Nome estável “Pesquisar na base de conhecimento”, foco após renderização da expansão, botão “Limpar pesquisa” que mantém foco. Corrigida corrida de foco observada na primeira verificação; `browser-assertions.json` |
| V14 · P2 | Corrigido no shell existente | Sidebar não tinha aria-current e título do documento não seguia o módulo | aria-current nos dois contextos; título “Módulo · Lastro”; navegação iniciada com foco no nav leva ao título sem rolar a página. Sem nova arquitetura de URLs/Voltar. Título confirmado no Edge; sem leitor de tela físico nesta rodada |
| V15 · P2 | Corrigido | Título truncado e metadados ocultos abaixo de sm | Títulos quebram linha; resumo prioritário por tipo e atualização ficam disponíveis também no celular, mantendo a lista e o detalhe completos. `before-mobile-list-*`/`confirmed-mobile-list-*` |
| V16 · P2 | Corrigido | Nomes de detalhes podiam coincidir para títulos iguais; consulta de revisão genérica | Nome acessível inclui GLPI # ou ID local + título; summary de RFO inclui revisão e chamado por texto sr-only. Texto visível e ícones preservados. Nomes do dashboard verificados no Edge; revisões cobertas pela suíte de componentes existente |
| V17 · P2 | Corrigido | Inicialização de tema dependia da Home, que não monta antes da autenticação | `ThemeInitializer` no layout aplica a chave já existente independentemente do login; funciona com armazenamento indisponível e observa evento storage. Novas navegações com preferência salva dark/light confirmadas no Edge, `login-results.json` e `confirmed-cold-login-*.png`. Não se afirma eliminação de qualquer flash antes da hidratação |
| V18 · P2 | Corrigido nos formulários/detalhes tratados | Ações exigiam alcançar o final de conteúdo longo | Rodapé sticky compartilhado nos cadastros/detalhes, RFO, movimentações e confirmação de entrega. Reserva de rolagem no diálogo evita esconder o último campo. Em celular, textarea final foi medido acima do rodapé e rascunho permaneceu após 400; `after-mobile-footer.png`. Fluxo de saída/descartes não foi alterado |
| V19 · P2 | Pendente de revisão de fluxo | Dashboard/filtros precedem a base e ocupam vários viewports; reproduzido novamente no celular | A auditoria exige revisão antes de mudar hierarquia. Preservada a composição e as consultas. Pendência: decidir acesso à base e comportamento dos filtros móveis sem esconder ocorrências ativas ou alterar o fluxo do plantão; não implantar nova hierarquia por preferência estética |
| V20 · P3 | Corrigido quanto à disponibilidade | A ação abria apenas explicação de recurso futuro | “Modelos de chamado (em breve)” informa disponibilidade antes do acesso. Placeholder continua explicativo, sem implementar modelos. Verificado no Edge |
| V21 · P3 | Corrigido para transições próprias | Transições/deslocamento próprios não tinham política de redução | Media query prefers-reduced-motion reduz transições/animações dentro de main e retira deslocamento do indicador. Edge com preferência emulada confirmou transitionDuration 0s. Não se afirma cobertura de todas as dependências instaladas |

V11 permanece explicitamente aberto de forma parcial; não se apresenta a extração do campo cadastral como migração de todos os formulários. Regras condicionais de RFO, pendência e confirmação de integração continuam com os validadores e rótulos atuais. A continuidade deve definir o contrato de mensagem por campo mantendo o feedback geral quando não houver identificação confiável. Isso não justifica alterar APIs ou regras nesta rodada.

## Padrões efetivamente estabelecidos

- Superfície de painel `bg-card` usa branco no claro e o azul existente `#111d2c` no escuro, com foreground pareado. Feedbacks da Etapa 10.2 preservam pares próprios.
- Input normal e select de formulário: 40 px; login: 48 px; busca: altura do shell. Button conserva suas variantes/dimensões por contexto, sem impor tamanho único a todas as ações.
- `FormField` cadastral preserva name, valor, required e ID fornecidos; gera ID quando necessário e mantém ajuda fora do nome acessível. Não muda payload nem validação.
- Textarea única para os cadastros e painéis. Rodapé reutiliza `.lastro-form-actions` e o token de superfície, mantendo posição no fluxo e rolagem. Não há nova política de descarte obrigatório.
- Listas mantêm seleção por linha, conteúdo integral no detalhe e metadados legíveis no celular. Sem nova paginação de inventário ou conversão artificial para tabela.
- Navegação mantém os destinos, ícones e interação existentes, com item atual semântico, nome do módulo, foco e rolagem móvel. Busca ganhou nome e limpeza explícitos.
- Movimento reduzido respeita a preferência no âmbito das transições próprias.

## Arquivos

Criados: `components/form-field.tsx`, `components/theme-initializer.tsx`, `tests/visual-refinements.test.ts`, este capítulo e o acompanhamento 13.

Alterados: `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, `components/ui/input.tsx`, `components/ticket-dashboard.tsx`, `components/rfo-panel.tsx`, `components/handoff-panel.tsx`, `components/ticket-operations-panel.tsx`, `components/tickets-section.tsx`, `package.json`, índice e acompanhamentos/documentos 21/22/12. Histórico anterior preservado por notas de atualização, sem reescrever suas conclusões originais.

## Testes e evidências

| Verificação | Resultado efetivo |
|---|---|
| Suíte completa (`npm test`, mesmo script do package.json) | **196 aprovados, zero falhas**; 193 existentes + 3 novos |
| Lint (`oxlint`) | Aprovado |
| TypeScript (`tsc --noEmit --incremental false`) | Aprovado |
| Build (`vinext build`) | Aprovado, também na cópia isolada |
| Edge funcional | **10 asserções aprovadas**: busca/foco, título, limpeza, destino móvel, labels, rascunho após 400, campo final/rodapé, movimento reduzido, nomes de detalhes, disponibilidade de modelos |
| Edge tema inicial | **2 verificações aprovadas**: login em nova navegação com preferência dark e light |
| Comparação visual | Desktop 1440×1000 e celular 390×844 nos dois temas: dashboard, detalhe e superfícies operacionais, câmera/lista/formulário; capturas antes/depois e estilos computados |

Os três novos testes renderizam o `FormField` real: ajuda associada sem perder aria-describedby prévio; campo opcional com nome acessível/rascunho; select obrigatório preservando nome e seleção de envio. Os testes existentes de falhas, concorrência, histórico, autenticação, dashboard, GLPI simulado, passagem e RFO também passaram. Não houve alteração da API ou persistência para satisfazer testes visuais.

Arquivos de evidência: `tests-confirmed.log`, `typecheck-confirmed.log`, `lint-confirmed.log`, `build-confirmed.log`, `build-isolated-confirmed.log`, `browser-assertions.json`, `login-results.json`, medições `before`/`confirmed`, scripts CDP e PNGs em `screenshots`. Capturas intermediárias e de falha estão separadas pelo nome e não devem ser tratadas como versões finais aprovadas. Diretório privado: não publicar integralmente, pois a cópia do banco inclui dados recuperados além dos sintéticos usados nos cenários.

O Edge era real/headless; viewports e preferência de movimento foram emulados. Não houve aparelho físico, leitor de tela, avaliação exaustiva de zoom, todos os estados de todos os controles ou teste de grande volume. Não se declara conformidade WCAG integral. A abertura de detalhes do chamado usa leitura do banco isolado; gravações cadastrais foram simuladas pelo CDP, não testes de persistência real no navegador.

Não foram repetidas no navegador todas as transações de RFO, entrega/recebimento de turno, integração ou autorização administrativa real; essas áreas têm cobertura automatizada e evidências anteriores. O aviso conhecido do Vinext sobre classificação estática de rotas permanece. A sequência logout + location.reload fez o Worker isolado encerrar com “Network connection lost”; foi registrada e a leitura do tema foi repetida em navegações separadas após reiniciar o Worker. Não se atribuiu essa falha à preferência de tema nem se atualizou a infraestrutura/dependências para contorná-la.

## Pendências preservadas

V11 parcial e V19 aguardam continuidade conforme acima. Idempotência cadastral persistente entre abas/recargas e HTTPS operacional GLPI continuam pendências separadas; nenhuma solução visual substitui essas garantias. O 503 operacional não foi contornado com HTTP, credenciais falsas ou desativação TLS.

Sem migrations, operações GLPI reais, commit ou push. Conferência final em `operational-after.json`: os seis arquivos do D1 operacional, incluindo WAL/SHM e metadata, possuem hashes idênticos aos iniciais. Nenhum arquivo de API, serviço de autenticação/GLPI, persistência ou migration foi alterado nesta etapa; a cópia isolada contém somente as substituições simuladas já descritas. Edge e Worker exclusivos da homologação encerrados, sem listeners nas portas 8899 e 9333 ao final. Não iniciar a próxima etapa automaticamente.

# Etapa 10.1 — Auditoria e diagnóstico de padronização visual

**Situação após a Etapa 10.4:** V11/V19 concluídos e validados individualmente; V01–V21 encerrados no escopo original e nos cenários verificados. Ver [matriz individual, evidências e limitações](25-Conclusao-da-Padronizacao-Visual.md) e [acompanhamento 14](../auditoria-2026-10-22/14-Acompanhamento-Etapa-10-4-Conclusao.md). As atualizações anteriores e o diagnóstico abaixo são registros históricos.

Atualização em 23/10/2026: V01–V08 tratados na Etapa 10.2. Na Etapa 10.3, V09/V10/V12–V18/V20/V21 corrigidos no escopo documentado; V11 parcial e V19 pendente de revisão de fluxo. Ver [acompanhamento atual](../auditoria-2026-10-22/13-Acompanhamento-Etapa-10-3-Refinamentos.md) e [evidências/limitações](24-Padronizacao-de-Componentes-e-Refinamentos.md). O diagnóstico original abaixo foi preservado.

## Resultado e escopo

Auditoria de 22/10/2026, horário de São Paulo, baseada no código atual da pasta `lastro`, documentação, capturas anteriores e nova inspeção no Microsoft Edge. **Nenhuma correção de interface foi implementada.** Nome, marca Eidos/Lastro, paleta, ícones Lucide, componentes, regras operacionais e arquivos funcionais foram preservados.

Foram identificados **21 achados: 1 P0, 7 P1, 11 P2 e 2 P3**. As prioridades mais altas são a ilegibilidade do feedback de erro no tema escuro, a perda de rascunho após falha cadastral, o feedback fora do modal e problemas de contraste em títulos de grupos, botões e hover. A proposta para revisão e o plano incremental estão em [22-Proposta-de-Padrao-Visual.md](22-Proposta-de-Padrao-Visual.md).

Prioridades: P0 = bloqueio funcional ou acessibilidade grave; P1 = afeta o uso de maneira importante; P2 = consistência visual/experiência; P3 = refinamento opcional. O P0 abaixo é de acessibilidade do feedback em estado de erro, não uma afirmação de indisponibilidade de todas as telas.

## Método, isolamento e evidência

- Estado do Git inspecionado, com alterações anteriores extensas. Inventário de hashes de **258 arquivos** registrado antes do trabalho; sem reset, commit ou push.
- Lidos relatório da [Etapa 8](19-Homologacao-Visual-e-Funcional.md), diagnóstico [HTTPS](20-Diagnostico-e-Preparacao-HTTPS-GLPI.md), arquitetura e visão geral, componentes atuais e auditoria de 22/10/2026 com seus acompanhamentos.
- Localizadas as **35 capturas da Etapa 8**, todas conferidas contra os hashes do manifest final. As 35 foram examinadas em quatro pranchas; capturas de detalhes foram consultadas para interpretar problemas. Elas incluem estados intermediários e o login anterior à correção: não se confundiu evidência histórica com defeito atual.
- Nova inspeção no **Edge real headless, via CDP**. Desktop 1440×1000; desktop baixo 1440×600; tablet 768×1024; celular 390×844; formulário de câmera adicional em 320×740. Viewports emulados, não aparelhos físicos.
- Cópia dos artefatos compilados da homologação anterior em diretório novo, sem `.env` operacional. **14 arquivos da interface**, incluindo página, CSS, layout, oito componentes de módulo e três primitivas, coincidiram por hash com o código da cópia que originou esse build.
- Persistência em cópia descartável do snapshot sintético da Etapa 8. Nenhuma migration executada. Inventário cadastral substituído por respostas JSON sintéticas no CDP, com oito registros e quatro categorias; nenhuma gravação cadastral chegou ao servidor. Testes de erro retornaram 503 sintético. Outras mutações funcionais foram bloqueadas pela interceptação; login/logout usaram exclusivamente provedor e usuário sintéticos da cópia.
- Apresentação administrativa examinada com resposta de sessão **simulada no frontend**. Isso permitiu inspecionar o painel existente, mas **não é teste de autorização admin**, nem criação/promoção de usuário. Não foram acionadas as operações desse painel.
- Gerados **61 PNGs nesta rodada**: 60 capturas da aplicação e uma captura de falha do Worker isolado durante recarga. Todos foram examinados em sete pranchas; capturas relevantes também em tamanho original. A falha do Worker foi separada dos achados visuais, o processo foi reiniciado e a inspeção pendente foi concluída. Não houve atualização de bibliotecas ou correção de runtime.

Evidências privadas:

```text
C:\Users\yurit\Lastro-backups\etapa10-1-20261023T013945Z
```

O diretório contém hashes iniciais/finais, métricas, scripts CDP, fixture de apresentação, capturas e pranchas. A cópia isolada também contém registros recuperados; não publicar o diretório integralmente. Os backups anteriores e as capturas originais não foram sobrescritos. O nome da pasta usa UTC; a data local desta auditoria é 22/10.

## Cobertura por tela

| Área | Inspeção efetiva | Diagnóstico / oportunidade |
|---|---|---|
| Login e sessão | Capturas anteriores, desktop claro/escuro, tablet escuro, celular escuro, entrada sintética e nova abertura da página | Marca e campos rotulados coerentes; título corrigido na Etapa 8. Preferência escura não aplicada no carregamento inicial do login; controles maiores que os demais módulos |
| Visão geral | Desktop claro/escuro; código de composição e estados | Dashboard NOC vem antes da base cadastral. Preservar separação entre indicadores operacionais e cadastrais; avaliar hierarquia e acesso à segunda seção |
| Dashboard operacional | Etapa 8 e novas telas desktop/tablet/celular; filtros, estados e hover | Contagens e rótulos independentes são positivos. Filtros longos dominam o primeiro viewport móvel; cartões/seletores usam tokens diferentes dos cadastros |
| Chamados e detalhes | Etapa 8 completa e novas consultas de detalhe | Metadados e ações explícitas preservados; superfície de integração/RFO difere do acompanhamento no escuro; nomes de ações repetidos e densidade elevada |
| Pendências e histórico | Capturas anteriores, leitura atual, erro de gravação sintético | Justificativa obrigatória e orientações opcionais claras; histórico preservado. Feedback de erro escuro quase ilegível |
| Passagem de turno | 35 capturas anteriores; resumo existente aberto em tablet e celular nesta rodada | Aviso discreto, sem modal/bloqueio, é acerto. Resumos e ações precisam compartilhar superfície, tipografia e espaçamento dos demais painéis |
| RFO | Capturas de leitura, formulário e revisões em ambos os temas, código atual | Distinção investigação/conclusão é clara; manter versões. Cartão neutro escuro destoa do azul dos painéis; formulário extenso e ações no fim |
| Rotas | Lista e cadastro nos dois temas; tablet/celular; detalhe longo | Modal funciona com rolagem; títulos longos truncados na lista; responsável oculto no celular; falha limpa rascunho e mostra aviso fora do modal |
| VLANs | Lista e cadastro nos dois temas; tablet/celular | Formulário curto e reutilizado; altura de select/input e indicação de obrigatoriedade diferentes dos chamados; listas não possuem filtros específicos |
| Câmeras | Lista e cadastro nos dois temas; tablet/celular e formulário a 320 px | Agrupamentos técnicos úteis; legendas escuras com contraste baixo; longa rolagem até ações. Sem overflow horizontal no ponto medido |
| Pontos atendidos | Lista/cadastro nos dois temas; edição em tablet; celular | Agrupamentos preserváveis; campos técnicos extensos, legendas e ações com os mesmos problemas de câmera |
| Categorias | Grade/cadastro nos dois temas; edição, tablet/celular; análise do vazio no código | Escopo, nome e descrição contextualizam a cor. Estado vazio não tem mensagem própria; cartões não são links para seus registros, o que é oportunidade opcional, não funcionalidade presumida |
| Navegação lateral/móvel e pesquisa | Temas, expandir/recolher, viewport baixo, busca expandida e filtros de texto | Sidebar possui rolagem própria e mantém acesso em janela baixa. Mobile tem oito destinos com rolagem horizontal pouco evidente. Busca fixa sobrepõe conteúdo ao rolar |
| Configurações / administração existentes | Código e painel “Integração GLPI — teste inicial” aberto por apresentação admin simulada | Não há tela geral de Configurações nem gestão de usuários/perfis na UI atual. O ícone Settings2 acompanha cartão informativo “Base operacional”, não uma tela. Tema, categorias e diagnóstico GLPI são os controles existentes |

Não se atribuíram a esta rodada testes visuais de todo status, de todos os perfis nem de todas as combinações de dados. A matriz combina a inspeção anterior validada com os novos casos, sem alegar repetição integral da homologação funcional.

## Inventário de componentes e padrões atuais

| Família | Implementação efetivamente usada | Consistência atual |
|---|---|---|
| Botão | `components/ui/button.tsx`, Base UI + CVA; default, outline, secondary, ghost, destructive, link | Foco e disabled compartilhados; ações locais sobrescrevem cores/altura. Hover global escuro conflita com a variante default |
| Input | `components/ui/input.tsx`, Base UI | 32 px padrão, overrides no login; bom mínimo de largura, foco e disabled |
| Textarea | `components/ui/textarea.tsx` nos módulos de chamados; `TextArea()` local em `app/page.tsx:518` nos cadastros | Duas implementações com borda, padding e foco distintos |
| Select | HTML nativo em cadastros, dashboard, acompanhamento, RFO e passagem | Varia entre 36 e 40 px, raios e fundos distintos; labels em geral presentes |
| Campos/grupos/ações | `Field`, `FormSection`, `FormActions`, `FormTitle` locais em `app/page.tsx:518–522`; labels/fieldsets repetidos nos módulos | Boa estrutura inicial; não existe contrato único de ajuda, erro, optional/required e envio |
| Listas cadastrais | `RecordList` em `app/page.tsx:448`, quatro tipos e pesquisa | Reuso real entre módulos. Linha inteira acionável, título truncado; resumo escondido abaixo de `sm`. Sem paginação/ordenação por coluna |
| Cartões | `.noc-stat-card`, `.noc-list-panel`, `.noc-panel-card`; utilitários locais e `bg-card` | Há famílias sobrepostas, sem um componente de superfície comum |
| Indicadores NOC | `TicketDashboard`, seis indicadores, filtros e resultados agrupados | Reuso na visão geral e em Chamados; loading/erro/vazio próprios são acertos |
| Modal de cadastro/detalhe | `<dialog>` nativo e handlers em `app/page.tsx:89–172,433` | Nome, foco inicial, Tab, Escape e restauração funcionaram nos casos testados; rolagem interna; ações apenas no fim |
| Históricos/expansões | `<ol>`, `<details>` e `<summary>` nos painéis operacionais | Cronologia e consulta progressiva preserváveis; tipografia, paginação e nomes de ações variam |
| Navegação | Sidebar e barra inferior próprias; busca expansível fixa | Item ativo visual consistente, sem `aria-current` desktop; mobile tem semântica de item atual |
| Mensagens | Alertas/outputs definidos por módulo, banner global cadastral | Sem componente comum de feedback; cascata global quebra cores de alguns estados |

O catálogo `components/ui/` contém **60 arquivos**. No caminho de telas auditado, somente **Button, Input e Textarea** são importados diretamente. Table, Dialog, Dropdown, Alert e demais primitivas instaladas não devem ser tratados como componentes já adotados pela aplicação. Não foram encontradas tabelas de dados HTML nem menus dropdown nas telas principais: são listas, grids, selects nativos e expansões. Não se recomenda converter tudo em tabelas ou substituir o diálogo nativo apenas para usar o catálogo.

## Achados priorizados

### V01 · P1 — Erro cadastral fora do contexto modal

**Tela/arquivo:** criação/edição de inventário e categorias; `app/page.tsx:277–316,408,433`. **Evidência:** 503 sintético ao cadastrar rota; modal continuou aberto, zero alerts internos e mensagem apenas no banner externo (`error-outside-modal.png`, `error-contrast-focus.json`). **Impacto:** o técnico não recebe feedback útil no contexto em que está operando; mensagem pode persistir em outro módulo. **Correção/reuso:** feedback local junto de `FormActions`, reaproveitando o aviso de conflito interno. **Risco:** médio; preservar fechamento, foco e tratamento 409.

### V02 · P1 — Rascunho limpo após falha de gravação

**Tela/arquivo:** formulário de rota e família cadastral; `app/page.tsx:277–316,465`. **Evidência:** após 503 simulado, título e categoria voltaram a vazio, embora o modal permanecesse aberto. A action captura o erro e resolve; o form não controlado é resetado pelo runtime React. **Impacto:** retrabalho/perda de texto em uma falha recuperável. **Correção/reuso:** preservar valores até confirmação de sucesso, com estado de envio/erro compartilhado; validar os quatro formulários e categorias. **Risco:** médio; não alterar payloads ou regras de persistência.

### V03 · P0 — Feedback de erro quase ilegível no escuro

**Tela/arquivo:** banner global e acompanhamento operacional; `app/globals.css` (seletores amplos de herança), `app/page.tsx:408`, `components/ticket-operations-panel.tsx:82`. **Evidência:** texto efetivo RGB(231,237,245) sobre RGB(254,242,242), **1,08:1**, em erro simulado de movimentação (`operational-error-dark.png`). O banner global reproduz a mesma aparência. **Impacto:** falha operacional torna-se praticamente imperceptível para quem depende do texto visual. **Correção/reuso:** mensagem semântica compartilhada, com foreground/background pareados por tema; retirar interferência global de forma gradual. **Risco:** alto se a cascata for alterada globalmente; começar pelos estados comprovados, com regressão de todos os módulos. Não foi alterada nesta etapa.

### V04 · P1 — Legendas de grupos com contraste insuficiente

**Tela/arquivo:** câmera/ponto, `FormSection` em `app/page.tsx:519`. **Evidência:** legendas de 14 px, RGB aproximado (49,65,88) sobre (17,29,44), **1,64:1** (`legend-dark-low-contrast.png`, `mobile-320-camera-form-dark.png`). **Impacto:** perde-se a separação identificação/localização/rede. **Correção/reuso:** manter fieldset/legend e usar foreground semântico já existente para o tema. **Risco:** baixo, com verificação de ambos os temas e de todas as seções.

### V05 · P1 — Texto branco sobre laranja em ação habilitada

**Tela/arquivo:** CTA de cadastro e ações similares; `app/page.tsx:374,522`, classes locais em componentes. **Evidência:** “Nova rota” habilitado, 14 px, branco sobre `#ff6b2c`: **2,84:1**. **Impacto:** rótulos pequenos pouco legíveis; não é caso de componente inativo ou logotipo. **Correção/reuso:** preservar o laranja da marca e ajustar a combinação com foreground escuro existente, ou usar a variante primária já existente quando adequado; validar sem criar nova paleta. **Risco:** médio, pela abrangência das ações e estados hover/disabled.

### V06 · P1 — Hover escuro quebra contraste do botão padrão

**Tela/arquivo:** “Aplicar filtros” e variante default; `components/ui/button.tsx`, `app/globals.css` em `html.dark button:hover`. **Evidência:** movimento de ponteiro real no Edge manteve texto escuro e mudou fundo para RGB(26,42,61) (`button-default-dark-hover.png`, `hover-dark.json`). **Impacto:** a ação fica menos legível justamente durante a interação. **Correção/reuso:** devolver hover/foco às variantes do Button, removendo conflito global de forma delimitada. **Risco:** médio; testar outline, ghost, laranja e botões nativos.

### V07 · P1 — Estados de coleção inconsistentes

**Tela/arquivo:** rotas/VLANs/câmeras/pontos/pesquisa/categorias, `app/page.tsx:179–191,416–424,449`. **Evidência:** consulta sintética atrasada e navegação para Rotas mostrou “Nenhum cadastro encontrado”, sem loading; depois vieram os registros (`inventory-loading-as-empty.png`). A visão geral já possui loading próprio. Categorias, pelo código, têm grade vazia sem mensagem própria. **Impacto:** impressão falsa de base vazia ou dados perdidos. **Correção/reuso:** compartilhar estado loading/erro/vazio/resultados, aproveitando o contrato do dashboard/visão geral, sem copiar sua consulta. **Risco:** médio; diferenciar vazio real de filtro e falha.

### V08 · P1 — Busca fixa sobrepõe títulos e campos

**Tela/arquivo:** shell e painéis longos, `app/page.tsx:397–405`. **Evidência:** capturas anteriores e atuais mostram controle fixo a 16 px do topo sobre conteúdo rolado, incluindo RFO/passagem. **Impacto:** leitura e identificação de foco parcialmente encobertas. **Correção/reuso:** preservar a busca e organizar sua área/reserva e o posicionamento de rolagem, com escopo de layout; não trocar ícone nem remover acesso. **Risco:** médio; sidebar expandida/recolhida, modal e mobile.

### V09 · P2 — Duas famílias de superfícies no tema escuro

**Tela/arquivo:** acompanhamento versus RFO/integração/passagem; `app/globals.css`, `ticket-operations-panel.tsx:79`, `rfo-panel.tsx:210`, `handoff-panel.tsx:216`, `glpi-integration-panel.tsx`. **Evidência:** azul `bg-white` sobrescrito versus `bg-card` neutro quase preto, na mesma tela. **Impacto:** módulos parecem de sistemas diferentes. **Correção/reuso:** alinhar tokens de superfície ao azul já usado no Lastro e adotar contrato comum de painel. **Risco:** médio/alto na cascata; migrar um painel por vez.

### V10 · P2 — Dimensões e variantes de controles divergentes

**Tela/arquivo:** `components/ui/{button,input,textarea}.tsx`, `app/page.tsx:467,518,522`, selects dos painéis. **Evidência:** inputs 32 px, selects 36/40 px, login 48 px e CTAs 44 px; textarea local usa outro foco/padding. **Impacto:** desalinhamento e experiência de toque variável. **Correção/reuso:** dimensões por contexto e reutilização de Input/Textarea/Button; select nativo pode continuar. **Risco:** médio. Ter 32 px não constitui, isoladamente, falha de tamanho mínimo WCAG.

### V11 · P2 — Labels, ajuda e erro sem contrato único

**Tela/arquivo:** `Field` cadastral, formulários de chamados/RFO/passagem. **Evidência:** labels 12/14 px, required nativo em alguns campos sem indicação visual equivalente, optional explícito em outros; mensagens nem sempre associadas ao campo. **Impacto:** obrigações e erros menos previsíveis. **Correção/reuso:** contrato de campo com label/id, ajuda, optional/required e erro associado; manter regras de negócio atuais, especialmente pendência com apenas justificativa obrigatória. **Risco:** médio; nomes acessíveis e validação.

### V12 · P2 — Descoberta dos destinos móveis

**Tela/arquivo:** `.mobile-nav`, `app/page.tsx:428–430`, final de `globals.css`. **Evidência:** oito itens mínimos de 68 px excedem 390 px; barra oculta scrollbar, destinos finais exigem rolagem horizontal. Em 768 px todos couberam. **Impacto:** categorias/chamados podem ficar fora da primeira área visível. **Correção/reuso:** melhorar indicação de continuidade e visibilidade do item ativo dentro da barra existente. **Risco:** médio; safe area, foco e toque.

### V13 · P2 — Busca depende de placeholder e não tem limpeza explícita

**Tela/arquivo:** `app/page.tsx:397–403`. **Evidência:** input sem label/aria-label, placeholder “Pesquisar...”; botão vizinho tem nome próprio. Consulta muda a área para Pesquisa e a limpeza depende de apagar o texto. **Impacto:** identificação e escopo da busca pouco consistentes; placeholder pode servir como fallback, mas não substitui label estável. **Correção/reuso:** nome explícito, gestão de foco ao expandir e ação de limpar com Button existente. **Risco:** baixo/médio; preservar pesquisa e teclado.

### V14 · P2 — Contexto da navegação não anunciado uniformemente

**Tela/arquivo:** sidebar `app/page.tsx:380`, título e navegação por estado. **Evidência:** desktop sem `aria-current`; mobile o possui. Documento mantém título “Lastro” durante mudança de módulos. **Impacto:** orientação por teclado/tecnologia assistiva inferior à indicação visual. **Correção/reuso:** semântica de item atual, nome de página e foco coerente no shell existente. **Risco:** médio. Navegação por URL/Voltar é dependência arquitetural separada, não alteração automática desta proposta.

### V15 · P2 — Metadados e títulos extensos nas listas

**Tela/arquivo:** `RecordList`, `app/page.tsx:449`. **Evidência:** título longo truncado; resumo/data ocultos abaixo de `sm` (`mobile-light-cameras.png`, `record-detail-long-desktop.png`). Conteúdo integral continua no detalhe. **Impacto:** comparação rápida exige abrir mais registros. **Correção/reuso:** definir metadados prioritários por tipo e apresentação responsiva na lista atual; manter detalhe e evitar nova tabela sem necessidade aprovada. **Risco:** baixo/médio; nomes longos, categorias e volume.

### V16 · P2 — Ações repetidas pouco específicas

**Tela/arquivo:** resultados do dashboard, RFO e históricos. **Evidência:** vários botões “Detalhes” / “Consultar esta versão” com texto genérico; contexto fica no cartão e no conteúdo vizinho. **Impacto:** navegação por lista de controles fica menos clara. **Correção/reuso:** associar nome da ação ao número do chamado/revisão com labels/ids, preservando texto visível e ícones. **Risco:** baixo; verificar nomes acessíveis finais.

### V17 · P2 — Preferência de tema não aplicada no login inicial

**Tela/arquivo:** tema em `app/page.tsx:32–49,98`; `AuthProvider`. **Evidência:** nova abertura válida do login mostrou tema claro com `localStorage` em `dark`; a tela anterior ao reload respeitava o escuro. Confirmado após reiniciar a sonda (`login-cold-reload-light.png`). **Impacto:** alternância inesperada entre autenticação e área interna. **Correção/reuso:** inicialização do tema comum à autenticação e ao shell, mantendo chave e preferência existentes. **Risco:** médio; hidratação e flash inicial.

### V18 · P2 — Ações no fim de formulários/detalhes longos

**Tela/arquivo:** `FormActions`, detalhes, câmera/ponto e painéis técnicos. **Evidência:** câmera a 320 px possui conteúdo de 1773 px em área de 696 px; detalhe longo tem ações abaixo da rolagem. Escape funciona. **Impacto:** deslocamento extenso para cancelar/salvar; não foi demonstrado bloqueio de saída. **Correção/reuso:** padronizar localização/visibilidade das ações e saída identificável, sem perder rolagem, foco ou dados. **Risco:** médio; eventual rodapé persistente não pode encobrir campos.

### V19 · P2 — Hierarquia da visão geral e filtros extensos

**Tela/arquivo:** composição em `app/page.tsx:414–421`, `TicketDashboard`. **Evidência:** ocorrências/filtros podem ocupar várias telas antes da base de conhecimento; em celular, filtros vêm antes dos indicadores. **Impacto:** acesso rápido varia conforme quantidade de chamados. **Correção/reuso:** revisar hierarquia, identificação de seções e acesso dentro da composição atual, preservando ocorrências antigas ativas, indicadores e dados. **Risco:** médio; mudança de fluxo requer revisão antes de implementação.

### V20 · P3 — Modelos expostos como área futura

**Tela/arquivo:** `components/tickets-section.tsx`, view `templates`. **Evidência:** “Modelos de chamado” abre explicação de funcionalidade ainda não configurada (`ticket-models-placeholder.png`). **Impacto:** desvio sem ganho operacional. **Correção/reuso:** sinalizar disponibilidade de forma consistente; implementar modelos só com requisitos próprios aprovados. **Risco:** baixo para rótulo; funcionalidade futura fora da padronização.

### V21 · P3 — Movimento sem política local uniforme

**Tela/arquivo:** transições próprias em `app/page.tsx` e `app/globals.css`. **Evidência estática:** transições 180/300 ms e deslocamento de cartões, sem regra local explícita de redução de movimento. Não se afirma ausência em todas as dependências. **Impacto:** experiência pode ser desconfortável para pessoas sensíveis. **Correção/reuso:** política de `prefers-reduced-motion` aplicada às transições próprias, mantendo comportamento funcional. **Risco:** baixo; não afetar gerenciamento de foco ou estados.

## Medições e interpretação de acessibilidade

As cores foram extraídas do estilo computado, após estabilizar transições, e convertidas para sRGB em canvas do navegador; calculada luminância relativa. Razões arredondadas apenas para apresentação. Não são medidas de pixels antialiasados de texto e não constituem auditoria WCAG completa.

| Caso | Texto / fundo sRGB | Razão | Situação |
|---|---|---:|---|
| Erro operacional escuro | (231,237,245) / (254,242,242) | 1,08:1 | Texto normal quase ilegível |
| Legend escura | (49,65,88) / (17,29,44) | 1,64:1 | Grupo de campos pouco legível |
| CTA laranja habilitado | (255,255,255) / (255,107,44) | 2,84:1 | Rótulo de 14 px insuficiente |

A referência [W3C 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) define 4,5:1 para texto normal, com exceções próprias para texto grande e componentes inativos. Não se aplicou a exigência a logos ou botões desabilitados. [Tamanho mínimo de alvo](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) considera tamanho e exceções de espaçamento; portanto, não se declarou que todo botão abaixo de 44 px falha. Sobreposição parcial observada também não foi convertida automaticamente em falha do critério de [foco não encoberto](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html), que tem condições específicas.

## Padrões consistentes que devem ser preservados

- Marca Lastro/Eidos, azul escuro e laranja, tipografia Geist e ícones Lucide existentes.
- Labels do login, controle de visibilidade da senha e feedback de autenticação; título de marca corrigido na Etapa 8.
- Diálogo nativo nomeado: foco inicial, Tab contido, Escape e retorno ao acionador funcionaram; rolagem interna também em 320 px.
- Navegação lateral com rolagem própria em janela baixa; tema disponível no mobile, corrigindo limitação da auditoria histórica.
- Reuso de `RecordList`, Input/Button e campos agrupados com fieldset/legend.
- Dashboard distingue loading/erro/vazio, rótulos de situação e estado GLPI; cor não é o único identificador desses estados.
- Justificativa de pendência sem obrigações adicionais; RFO e passagem mantêm semânticas e históricos independentes.

## Relação com a auditoria anterior e dependências

UX01 foi reproduzido; UX04 ganhou evidência nova de perda de rascunho. UX03 está parcialmente resolvido na visão geral/dashboard, mas persiste em outras listas. UX05/UX06 permanecem com achados específicos; tema mobile já existe, e o antigo contraste do título do login está corrigido. Não repetir esses itens como se estivessem todos abertos. UX07 possui melhorias de dashboard/paginação e estados; modelos continuam futuros.

O 503 de autenticação por configuração HTTP continua uma dependência de infraestrutura/segurança, detalhada na Etapa 9; **não é um defeito de paleta ou layout**, e não autoriza relaxar HTTPS. Navegação por URL, volume/paginação de inventário, administração de usuários, políticas de descarte e modelos exigem decisões funcionais/arquiteturais separadas. Esta auditoria não reabre automaticamente esses escopos.

## Limitações, verificações e entrega

Não houve telefone físico, leitor de tela, zoom 200% real, avaliação de todas as cores de categorias possíveis, todos os estados de hover/foco, todos os navegadores ou base volumosa. O admin foi simulado apenas para apresentação. Erros e atrasos cadastrais foram injetados; não comprovam falha do banco ou da API operacional. Nenhum GLPI real foi consultado. A captura `login-mobile-after-reload.png` mostra falha da sonda, não tela Lastro; foi excluída das conclusões de tema, confirmadas depois numa abertura válida.

As verificações desta etapa são inspeção estática, revisão de 35 capturas, 60 novas capturas válidas da aplicação, interações/métricas CDP e hashes. **Não foi reexecutada a suíte funcional completa, lint, TypeScript ou build**: não houve alteração funcional; a auditoria reutilizou build cuja interface foi conferida. Resultados de 187 testes da Etapa 8 e 54 testes da Etapa 9 permanecem históricos, não execuções novas desta etapa.

Ao finalizar: Edge separado e Worker isolado encerrados; arquivos funcionais/configuração e seis arquivos do D1 operacional conferidos por hash; sem migrations, commit ou push. Novos documentos: este relatório, proposta de padrão e acompanhamento da auditoria. Índice atualizado. **Aguardar revisão do diagnóstico; não iniciar implementação das correções.**

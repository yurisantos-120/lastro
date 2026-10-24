# Interface e experiência de uso

## Método

Todas as áreas e subfluxos encontrados em `app/page.tsx`, AuthProvider, TicketsSection e GlpiTestPanel foram examinados pelo código, incluindo estados, classes responsivas, formulários e eventos de teclado. **Não houve renderização visual em navegador, teste com leitor de tela, medição de contraste ou interação humana.** As observações abaixo distinguem implementação verificável de hipóteses que precisam de avaliação visual posterior. Nenhum design foi alterado.

## Inventário de telas e fluxos

| Tela / estado | Hierarquia e comportamento encontrados | Reformulação recomendada |
|---|---|---|
| Verificação de sessão | Bloqueia conteúdo autenticado; em falha oferece tentar novamente | Preservar distinção entre sessão inexistente e serviço indisponível; validar anúncio de progresso |
| Login | Marca, identificação, senha com alternância acessível, erro com alert, botão de envio ocupado | Refinamento; feedback e estados já existem. Confirmar contraste, autofill e layout móvel em navegador |
| Shell desktop | Sidebar recolhível, usuário/perfil, oito destinos, CTA global, tema | Separar navegação de ações específicas; indicar página atual semanticamente também no desktop |
| Shell móvel | Barra inferior rolável com oito destinos e `aria-current`; sidebar oculta | Rever descoberta dos destinos fora da área visível e acesso ao tema, hoje dentro da sidebar desktop |
| Dashboard | Cinco cartões e oito recentes | Distinguir carregando/vazio/erro; adicionar contexto operacional apenas após definir métricas |
| Pesquisa | Campo expansível fixo; digitar muda para Pesquisa; resultados em lista única | Campo com label acessível explícito, limpar consulta, filtros e preservação de estado/URL |
| Rotas | Lista e detalhe textual com edição | Expor dados essenciais na listagem; esclarecer diferença entre rota documental e futuro trecho de fibra |
| VLANs | Lista, modal curto de número/bairro/categoria | Formatos e domínio claros; futura visão tabular se apoiar consulta real |
| Câmeras | Lista e formulário dividido em identificação/localização/rede/descrição | Preservar agrupamentos; reduzir ambiguidade de referências textuais e padronizar formatos |
| Pontos | Lista e formulário dividido em identificação/localização/conectividade/datas | Definir unidades, IP e significado de datas; facilitar consulta dos campos prioritários |
| Categorias | Cartões com descrição, escopo, contagem e edição | Abrir consulta de registros ao selecionar categoria; explicar a semântica variável por escopo |
| Modal de detalhe | Título, definição de campos e botões fechar/editar | Exibir informação de alteração/origem quando existir; validar navegação de teclado e textos extensos |
| Cadastro/edição | Form por tipo, required e categoria compatível | Prioridade alta: erros locais ao modal, andamento, sucesso e descarte consciente |
| Conflito de edição | Alert no formulário e botão de recarregar que avisa substituição | Preservar; considerar comparação entre alterações antes de substituir o rascunho |
| Chamados: histórico | Carregamento, erro, vazio, lista, estados e última sincronização | Paginação e filtros; distinguir atualização de histórico local de consulta ao GLPI |
| Chamados: abertura | Título/descrição, envio ocupado, sucesso, falha e incerteza | Preservar o aviso de incerteza; persistir operação/rascunho durante navegação |
| Chamados: detalhe | Metadados, conteúdo como texto, status e sincronização manual | Tratar resposta atrasada ao trocar seleção e exibir autoria existente de maneira útil |
| Chamados: modelos | Texto dizendo que será configurado futuramente | Decidir remover da navegação operacional até implementar ou concluir modelos com requisitos aprovados |
| Integração GLPI | Details expansível só para admin; conexão e ticket real de teste | Isolar diagnóstico do fluxo cotidiano; não exibir versão presumida como descoberta |
| Logout / expiração | UserSession e handler de 401 retornam ao login | Especificar recuperação de navegação e rascunhos sem expor dados após logout |

## Problemas comprovados na implementação

### UX01 — Erro fora do modal

`app/page.tsx:274–313` encaminha falhas gerais para `storageError`; o banner está em `:404`, fora de `dialog` aberto com `showModal()` em `:87`. Apenas o 409 possui aviso dentro do formulário. O contexto modal torna inadequado depender desse banner como feedback principal. Mover feedback para a área da ação e associar erros aos campos é prioridade alta.

### UX02 — Navegação sem endereço e CTA ambíguo

Todas as áreas usam estado `active` em uma única URL (`page.tsx:67`). Atualizar/reabrir a página retorna a início; links não representam módulo ou registro; Voltar do navegador não percorre esses estados. `startNewRecord` seleciona rota como fallback fora das quatro áreas cadastrais. No desktop o CTA permanece inclusive em Chamados. Recomenda-se ação contextual ou escolha explícita de tipo e navegação endereçável.

### UX03 — Carregamento confundido com vazio

Cadastros começam como arrays vazios e não há `loading` específico dos dados. Dashboard pode mostrar zero e lista “Nenhum cadastro encontrado” enquanto carrega. Categorias não têm vazio guiado próprio. Falha de carga usa banner geral. Separar estados para impedir interpretação equivocada da base.

### UX04 — Cobertura desigual de validação e envio

Backend valida limites/formato com mais rigor que os inputs; erros são em geral globais. Formulários cadastrais não possuem estado explícito de envio como o de chamados; não há confirmação de descarte ao Escape, fundo ou cancelar. O comportamento exato de duplo envio/limpeza automática de campos pelo runtime precisa ser testado, não presumido.

### UX05 — Pesquisa e acessibilidade

O input de pesquisa tem placeholder, mas não label/`aria-label` próprio. O label no botão vizinho não rotula automaticamente o input. O menu móvel declara página atual; o desktop só alterna classe e label. Alterações de área não atualizam título/endereço nem possuem gestão explícita de foco ao novo conteúdo. Priorizar nome acessível, anúncio de resultados e indicação de contexto.

### UX06 — Tema e inconsistência de tokens

O tema é salvo em `localStorage` sob chave legada. `globals.css` contém variáveis, mas a página usa várias cores diretas e o tema escuro aplica overrides com `!important`. O controle de tema fica na sidebar `lg:flex`, oculta em telas pequenas. Não há regra local identificada para reduzir animações por `prefers-reduced-motion`. Risco de contraste/estilo inconsistente depende de avaliação renderizada; não foi atribuído resultado WCAG sem medição.

### UX07 — Estados de chamados incompletos

Templates é placeholder. `notice` pode assumir pending, mas a tela de abertura não renderiza aviso específico desse estado como faz para failed/uncertain/created. Após failed, o botão de enviar pode reutilizar chave já encerrada; “Iniciar nova tentativa” é que troca a chave. A listagem limita 100 sem navegação. A operação fica só no estado do componente e desaparece ao sair da área. Esses pontos devem anteceder refinamentos cosméticos.

## Acertos que devem sobreviver à reformulação

Modal nativo com nome acessível, foco inicial, contenção de Tab, Escape e restauração de foco; labels envolvendo os campos; fieldsets e legends em formulários longos; login com controles rotulados; sessão/perfil visíveis; erro 409 explícito; alertas de falha/resultado incerto e opção de consulta manual; adaptação de grid e navegação móvel; conteúdo textual sem HTML remoto bruto.

Não remover a contenção/restauração de foco ao extrair componentes. Não transformar um estado uncertain em mensagem de falha confirmada para simplificar o layout.

## Validação visual posterior proposta

Em ambiente descartável com API simulada: 320/375 px, tablet e desktop; claro/escuro; zoom 200%; teclado sem mouse; leitor de tela; nomes acessíveis; textos longos; base vazia/volumosa; offline, 400/401/403/409/500; envio lento; cancelar durante envio; mudança rápida de chamado; retorno de foco e descarte de rascunho. Medir contraste antes de classificar conformidade. A presente auditoria não substitui essa rodada.

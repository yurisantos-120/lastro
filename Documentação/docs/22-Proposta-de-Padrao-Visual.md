# Etapa 10.1 — Proposta de padrão visual do Lastro

Atualização: os padrões efetivamente adotados nas Etapas 10.2/10.3 e seus limites estão nos capítulos [23](23-Correcoes-Criticas-e-Padronizacao-Inicial.md) e [24](24-Padronizacao-de-Componentes-e-Refinamentos.md). O texto abaixo conserva a proposta original; não implica adoção automática de todos os seus lotes.

**Status: proposta para revisão, não implementada nem aprovada como norma definitiva.** Baseada exclusivamente na interface atual, em seus tokens e na [auditoria visual](21-Auditoria-de-Padronizacao-Visual.md). Não propõe nova identidade, ícones, biblioteca visual ou reconstrução de telas.

## Princípios de continuidade

Preservar Lastro/Eidos, azul e laranja, Geist, Lucide, sidebar escura, cartões arredondados, listas acionáveis, modal nativo e painéis operacionais progressivos. Padronização significa usar as mesmas regras para a mesma função; login, formulário longo e indicador não precisam ter tamanho idêntico. Nenhuma simplificação visual pode fundir estado NOC, resultado de abertura, integração e status GLPI.

## Linha de base observada

### Paleta e tokens

| Papel | Valores existentes | Proposta de utilização |
|---|---|---|
| Marca / destaque | `#ff6b2c`; hover `#e85b20`; ícone ativo `#ff9d6c` | Preservar cores. Separar papel de marca de variante default do Button. Corrigir combinação foreground/background sem inventar novo laranja |
| Sidebar / marca escura | `#0a1729`, gradiente `#0b1728` → `#0d1a2e`; login `#101b2a` | Manter família e sidebar escura nos dois temas |
| Fundo claro | token `--background: #edf3f8`; página efetiva `#f4f6f8` | Escolher e documentar um papel por superfície existente; evitar literal concorrente sem finalidade |
| Texto claro | `--foreground: #17212b`; página `#17202a`; títulos `#182334` | Usar foreground/título como papéis, com variação explícita apenas quando necessária |
| Superfície clara | `--card: #fff`; `.noc-*` branco com alpha | Convergir cartões e painéis para contrato de superfície, borda e texto |
| Fundo escuro efetivo | `#08111e` | Preservar como fundo da aplicação |
| Superfície azul escura | `#111d2c`; inputs `#0c1725` | Candidato à superfície semântica comum dos painéis, por já predominar nos módulos legados |
| Superfície neutra escura | `.dark --card: oklch(.205 0 0)` | Hoje difere dos painéis azuis. Proposta: alinhar o token de painel ao azul existente, após validar consumidores; não espalhar novos overrides |
| Texto escuro efetivo | `#e7edf5`; títulos `#ecf4ff`; secundário `#91a1b5` | Preservar combinações legíveis; aplicar por papel em vez de seletores globais por tag |
| Bordas | claro `#dce5ee` / slate; escuro `#26374b`, campos `#31445a` | Consolidar papéis border/input mantendo os tons existentes |
| Categorias e indicadores | ciano `#0891b2`, azul `#4f7cff`, verde `#20a57a`, violeta `#8b5cf6` e cor cadastrada | Preservar sem transformá-los em status exclusivos por cor; manter escopo/nome textual |
| Feedback | cores atuais red/amber/emerald e token destructive | Definir pares de texto/fundo/borda para ambos os temas; não herdar foreground genérico sobre fundo claro sem validação |

`globals.css` combina tokens shadcn/Tailwind, família `.noc-*`, literais nos módulos e **15 ocorrências de `!important`**. Há também herança ampla em `main p/span/div`. A migração proposta é gradual: corrigir consumidores comprovados, depois centralizar valores; não remover toda a cascata de uma vez. Tokens de chart e componentes não usados não precisam ser reformulados para padronizar as telas atuais.

### Tipografia

Família computada: **Geist**, com fallback Geist Fallback/Arial/Helvetica/sans-serif; Geist Mono já configurada para contextos técnicos. Nenhuma fonte nova.

| Função | Escala existente a consolidar |
|---|---|
| Título da página | 24 px; 30 px a partir de `sm` |
| Mensagem de marca do login | 30/36 px; exceção de contexto, não padrão de painel |
| Título de painel / modal | 20 px, semibold |
| Título de lista / seção compacta | 16/18 px conforme hierarquia |
| Corpo / ação | 14 px; 16 px em campos móveis |
| Label | Hoje 12 ou 14 px; propor regra única por densidade, sem label excessivamente apagado |
| Metadados | 12 px como padrão preferencial já existente; 10/11 px restritos a contexto secundário, nunca informação operacional essencial |

Títulos, rótulos e textos de apoio precisam ter cor semântica explícita. Remover herança ampla somente depois de registrar os consumidores: ela hoje altera tanto hierarquia quanto cores de alertas.

### Espaçamento, bordas e sombras

- Escala predominante de 4 px: 4, 8, 12, 16, 20, 24 e 32; há passos de 2/6 px em controles compactos. Preservar a escala e evitar novos valores arbitrários.
- Campos/grupos: gaps 12/16; painéis com padding 16 ou 20/24; shell 16/20/32 conforme breakpoint. Adotar variantes explícitas compacta e normal.
- `--radius: .75rem` = 12 px. Derivações existentes: sm 7,2; md 9,6; lg 12; xl 16,8; 2xl 19,2; 3xl 24 px. Button medido em 12 px. Proposta: controle `lg`, painel `xl/2xl` conforme família, login `3xl`; documentar exceções, sem impor novo desenho de cantos.
- Borda normalmente 1 px. Preservar distinção entre borda de superfície, campo, foco e estado inválido.
- Sombras existentes leves em cartões (`0 10px 24px .../.04`), mais fortes na busca, e `shadow-2xl` em modal/login. Não aplicar sombra de modal a todos os cartões.

### Controles e variantes

| Controle / contexto | Base existente | Contrato proposto |
|---|---|---|
| Button default | 32 px; xs 24, sm 28, lg 36; ícone 24/28/32/36 | Manter variantes semânticas existentes. Hover/foco/disabled pertencem à variante, sem override global de todo `button:hover` |
| Ação principal / toque frequente | CTAs de 44 px já existentes | Utilizar variante de toque derivada dos 44 px existentes, quando necessário; não declarar todo controle 32 px inadequado |
| Input | 32 px padrão, 48 px login | Preservar contexto do login; alinhar formulário normal e selects no mesmo grid |
| Select nativo | 36 px cadastro, 40 px operações | Escolher dimensão por densidade e alinhar aos campos pares. Não exigir troca por select de biblioteca |
| Textarea | Primitiva compartilhada min 64 px; implementação local rows=3/padding 12 | Reutilizar a compartilhada com variante/rows equivalente e mesmo tratamento de foco/erro |
| Ícones | Lucide; 16 px em ações, 20 em navegação móvel/painéis, 24 em marca | Preservar desenhos e tamanhos por papel; decoração com aria-hidden, ação só com ícone sempre nomeada |

Para o texto branco sobre laranja comprovadamente insuficiente, a proposta é **recombinar cores já existentes**: foreground escuro da marca no laranja, ou ação primária azul/foreground claro conforme contexto. A solução exata deve ser revisada nas duas aparências antes de adotada; não escurecer toda a paleta ou trocar a cor da marca por iniciativa desta etapa.

## Contratos de componentes para implementação futura

### Campo e formulário

Reutilizar Input, Textarea, Button e a estrutura local Field/FormSection/FormActions. Consolidar label associado, descrição opcional, required/optional coerente, mensagem de campo quando aplicável e feedback geral da action dentro do formulário. Não acrescentar novas exigências de negócio. Preservar rascunho em erro e conflito; limpar somente no sucesso confirmado. Estado de envio deve impedir repetição acidental sem esconder o motivo ou sugerir confirmação inexistente.

### Feedback

Contrato de erro, aviso, informação e sucesso com pares de cor testados nos dois temas, texto explícito e sem depender só de ícone/cor. Reaproveitar estrutura de conflito e alertas existentes; associar erro ao campo quando conhecido. Alert/status/output conforme urgência, sem transformar todo texto de apoio em anúncio insistente. O aviso de resultado incerto GLPI conserva sua semântica e bloqueio de repetição.

### Painel, cartão e indicador

Separar papéis: cartão de navegação/indicador, painel de formulário e item de histórico. Mesmos níveis de título, gaps e superfície para o mesmo papel; ícones atuais permanecem. Painéis de RFO/passagem/integração devem usar a família de superfície do Lastro; os significados e APIs continuam separados. Não alterar contagens, fuso ou seleção de ocorrências para simplificar a apresentação.

### Coleções e tabelas

Priorizar `RecordList` e o agrupamento do dashboard já existentes. Coleção tem estados loading, erro, vazio sem filtro, vazio filtrado e resultado; ações de tentar novamente/limpar só quando aplicáveis. Metadados prioritários definidos por módulo, títulos extensos acessíveis no detalhe e nomes de ações específicos. Paginação/ordenação de inventário dependem do contrato de dados e volume; não adicionar uma tabela apenas para padronizar aparência. Caso uma tabela futura seja aprovada, usar a primitiva instalada, cabeçalhos semânticos, sort explícito, ações nomeadas e alternativa móvel validada.

### Modal, expansões e menus

Manter diálogo nativo: nome, foco inicial, Tab, Escape, retorno ao acionador e rolagem interna. Padronizar ações de saída/envio e avaliar ações persistentes somente se não cobrirem campos. Política de descarte de rascunho precisa de decisão funcional; não introduzir confirmação obrigatória automaticamente. Manter details/summary para histórico, RFO e diagnóstico; não substituir tudo por modal ou menu. Não há dropdown principal a uniformizar hoje.

### Shell, responsividade e tema

Preservar sidebar, sua rolagem em janela baixa, marca e barra móvel. Adicionar indicação semântica desktop, melhorar descoberta da rolagem móvel e eliminar sobreposição da busca. Tema inicial deve atender login e área interna, mantendo preferência atual. Breakpoints existentes: `sm` 640, `md` 768, `lg` 1024, `xl` 1280; validar 320/390, 768 e 1440 px, também em altura reduzida. Não transformar 320 px em simples ocultação de overflow: dados/ações precisam continuar alcançáveis.

## Plano incremental por dependência

Este plano **não autoriza implementação**. Cada lote deve ser revisado antes de avançar; não é um redesign geral.

| Lote | Componentes / módulos | Achados | Critério de aceitação | Risco |
|---|---|---|---|---|
| A — Feedback legível | Alertas de acompanhamento e banner cadastral; pares semânticos locais | V03 | Erro legível nos dois temas, sem regressão de sucesso/aviso/conflito e sem novas chamadas GLPI | Médio/alto na cascata |
| B — Falha e rascunho | Field/FormActions e actions cadastrais, depois categorias | V01,V02,V07 | 400/409/503/rede preservam valores; erro dentro do modal; loading não vira vazio; sucesso só após resposta válida | Médio |
| C — Primitivas e estados | Button, Input, Textarea, select, FormSection | V04,V05,V06,V10,V11 | Contraste de normal/hover/foco; grids alinhados; required e optional mantidos; nenhum payload alterado | Médio |
| D — Shell e tema | Busca, sidebar, barra móvel, inicialização de tema | V08,V12,V13,V14,V17 | Busca não cobre controles; navegação por teclado; item atual nomeado; tema do login respeita preferência | Médio |
| E — Superfícies operacionais | Um painel por vez: acompanhamento, RFO, passagem, integração | V09,V16,V18 | Mesma família visual; sem fundir estados, perder revisões ou mudar confirmação; testar textos extensos | Médio |
| F — Coleções e hierarquia | RecordList, categorias, visão geral e filtros NOC | V15,V19 e conclusão de V07 | Metadados legíveis em celular/tablet; antigos ativos visíveis; vazios/contextos claros; sem mudança automática de consulta | Médio |
| G — Refinamentos | Placeholder/modelos e transições próprias | V20,V21 | Disponibilidade clara e movimento reduzido; nenhum fluxo futuro implementado sem requisito | Baixo, se estritamente visual |

Antes de mudanças amplas de CSS, registrar capturas e consumidores. Em cada lote, testar a regra central uma vez e seus consumidores reais; evitar corrigir os mesmos estilos por overrides em cada módulo. Só extrair um componente comum quando seu contrato estiver claro; nenhuma refatoração geral é necessária para começar.

## Validação futura e critérios para revisão

- Repetir cenários de contraste medidos e hover real, com cores computadas; verificar labels e anúncios sem depender só de screenshots.
- Formulários: erro e rascunho, conflito, sucesso, dupla ação, Escape, Tab/Shift+Tab, foco de retorno e rolagem. Persistência só em cópia isolada e GLPI simulado.
- Telas: desktop claro/escuro, tablet, 390/320 px e altura baixa; completar zoom 200% real e leitor de tela, ainda não executados.
- Manter status/incerteza GLPI, RFO e passagem, datas/fuso e permissões. Testes funcionais adequados ao lote, lint, TypeScript e build quando houver código alterado.
- Comparar com baseline e preservar dados, migrations e trabalho anterior. Não usar autenticação real para validar estilo.

Dependências de HTTPS operacional, endereço/Voltar, volume de consulta, gestão de usuários e modelos continuam separadas. A revisão deve aprovar a ordem dos lotes e as combinações de cor/dimensão propostas antes de qualquer implementação. **Esta entrega encerra o diagnóstico.**

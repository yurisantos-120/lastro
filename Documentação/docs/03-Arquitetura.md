# 3. Arquitetura

## Visão de alto nível

```text
Navegador
  │
  │ interface, busca e formulários
  ▼
React — app/page.tsx
  │
  │ HTTP JSON: GET, POST e PUT
  ▼
API — app/api/data/route.ts
  │
  │ funções de leitura e gravação
  ▼
Armazenamento — db/storage.ts
  │
  │ SQL parametrizado
  ▼
Cloudflare D1 / SQLite
```

## Tecnologias

| Camada | Tecnologia | Responsabilidade |
|---|---|---|
| Interface | React 19 + TypeScript | Estado da tela, navegação, formulários e pesquisa |
| Framework | Vinext | Rotas no estilo Next.js sobre Vite/Cloudflare |
| Estilo | Tailwind CSS + componentes shadcn/Base UI | Layout, tema, controles e acessibilidade |
| Ícones | Lucide React | Ícones da navegação e ações |
| API | Route Handlers | Receber requisições JSON e devolver respostas HTTP |
| Banco | Cloudflare D1 | Armazenamento persistente compatível com SQLite |
| Esquema | Drizzle ORM/Kit | Descrever tabelas e gerar migrações SQL |
| Build | Vite + plugin Cloudflare | Gerar cliente e Worker compatíveis com hospedagem |

## Estrutura relevante

```text
app/
  api/data/route.ts       API de categorias e informações
  globals.css             tokens, tema claro/escuro e estilos globais
  layout.tsx              metadados e estrutura HTML principal
  page.tsx                interface, módulos, formulários dinâmicos e regras de interação
components/ui/            componentes visuais reutilizáveis
db/
  env.d.ts                tipagem da variável DB do ambiente
  index.ts                criação do cliente Drizzle
  schema.ts               definição das tabelas
  storage.ts              consultas SQL e dados iniciais
drizzle/                   migrações versionadas do banco
public/                    favicon e imagem de compartilhamento
.openai/hosting.json       vínculo lógico com D1 e projeto hospedado
vite.config.ts             Vinext, Sites e ambiente local Cloudflare
```

## Fluxo de leitura

1. `app/page.tsx` é carregado no navegador.
2. A interface solicita `GET /api/data` com `resource` explícito: `summary`, `records`, `categories`, `routes` ou um item individual.
3. A API valida autorização, filtros, página e tamanho antes de consultar o D1.
4. `storage.ts` chama consultas preparadas e limitadas em `catalog-pagination.ts`; não cria tabelas.
5. A API devolve JSON com a página, total e dados filtrados. A Visão geral recebe agregados e oito atualizações recentes.
6. O React mostra os resultados e solicita outra página ou busca ao servidor quando necessário.

## Fluxo de cadastro

1. O usuário preenche um formulário.
2. A interface envia `POST /api/data` com `kind: "category"` ou `kind: "record"`.
3. A API direciona a operação para a função correspondente.
4. A camada de armazenamento executa um `INSERT` parametrizado.
5. A API consulta novamente o banco e devolve o estado atualizado.
6. A interface substitui seu estado pelo retorno confirmado do servidor.

## Fluxo de edição

O processo é igual ao cadastro, mas utiliza `PUT /api/data` e um identificador existente. A relação entre informação e categoria é preservada pelo campo `category_id`. O campo `kind` identifica se o cadastro é geral, VLAN, câmera ou ponto. Os campos próprios de cada módulo são serializados em `details_json`, mantendo um esquema comum sem misturar os formulários na interface.

## Rotas (compatibilidade temporária)

A seção antes chamada Informações agora aparece como **Rotas**, incluindo navegação móvel, listagem, cadastro e detalhes. A identificação permanece `kind === 'general'`; o estado interno `informacoes`, as categorias `scope: 'general'`, a tabela `information` e os contratos da API foram preservados. A tela exclui VLANs, câmeras e pontos; a Pesquisa continua abrangendo todos os módulos.

Não há marcador independente que diferencie procedimentos de rotas dentro de `general`. Nesta fase todos os registros desse tipo são tratados como rotas, conforme o uso operacional atual. Categorias livres e nomes dos registros não são usados como heurística. Se existirem registros genéricos que não sejam rotas, será necessário classificá-los explicitamente em uma próxima etapa.

Evolução recomendada: inventariar e classificar o legado, definir uma entidade Route com vínculo aos IDs atuais e preparar uma migração aditiva com compatibilidade de leitura/edição. Não foi criada migração nesta etapa.

## Estado local versus persistente

### Área de Chamados

O item **Chamados** usa o mesmo estado de navegação `ActiveView` da página principal e aparece na sidebar e na navegação móvel. O conteúdo fica em `components/tickets-section.tsx`, com três estados locais: resumo, abertura e modelos. Os botões levam a telas preparatórias com retorno para Chamados; ainda não enviam solicitações nem criam modelos.

Não há fonte de histórico persistido nesta etapa. “Últimos chamados” apresenta estado vazio e esclarece que tickets criados pelo teste GLPI não são registrados ali. O painel de teste permanece separado na Visão geral. Não houve alterações em banco, API ou autenticação. Ao sair da seção, a navegação interna volta ao resumo; não há novas URLs.

Próximo passo: implementar a abertura com validação/prévia, reutilizando a API interna GLPI; definir a persistência do vínculo e tratamento de resultados incertos antes de preencher o histórico local.

- O React mantém uma cópia temporária para renderizar a tela.
- A fonte permanente de categorias e informações é o D1.
- O `localStorage` é usado somente para a preferência de tema.
- Ao recarregar a página, os dados operacionais são buscados novamente no banco.

## Decisões arquiteturais

- Uma única API atende o escopo atual, reduzindo complexidade.
- As consultas ficam em `db/storage.ts`, evitando SQL espalhado pela interface.
- As migrações ficam versionadas em `drizzle/`.
- Queries usam parâmetros, evitando interpolação direta de conteúdo do usuário.
- Índices em categoria e título atendem os padrões atuais de consulta.

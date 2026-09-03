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
2. Um `GET /api/data` solicita categorias e informações.
3. `route.ts` chama `readAll()`.
4. `storage.ts` garante que as tabelas existam e executa consultas preparadas.
5. A API devolve JSON.
6. O React atualiza a interface e a busca passa a usar esses registros.

## Fluxo de cadastro

1. O usuário preenche um formulário.
2. A interface envia `POST /api/data` com `kind: "category"` ou `kind: "record"`.
3. A API direciona a operação para a função correspondente.
4. A camada de armazenamento executa um `INSERT` parametrizado.
5. A API consulta novamente o banco e devolve o estado atualizado.
6. A interface substitui seu estado pelo retorno confirmado do servidor.

## Fluxo de edição

O processo é igual ao cadastro, mas utiliza `PUT /api/data` e um identificador existente. A relação entre informação e categoria é preservada pelo campo `category_id`. O campo `kind` identifica se o cadastro é geral, VLAN, câmera ou ponto. Os campos próprios de cada módulo são serializados em `details_json`, mantendo um esquema comum sem misturar os formulários na interface.

## Estado local versus persistente

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

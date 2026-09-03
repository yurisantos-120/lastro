# 4. Banco de dados e persistência

## Banco utilizado

O sistema usa Cloudflare D1, um banco relacional compatível com SQLite. No desenvolvimento, o plugin da Cloudflare fornece uma instância local. Na publicação, a plataforma injeta o banco associado ao binding `DB`.

## Tabela `categories`

| Coluna | Tipo | Uso |
|---|---|---|
| `id` | INTEGER | Identificador primário |
| `name` | TEXT | Nome exibido |
| `description` | TEXT | Explicação da categoria |
| `color` | TEXT | Cor hexadecimal |
| `scope` | TEXT | Uso da categoria: `general`, `vlan`, `camera` ou `point` |
| `created_at` | TEXT | Data de criação ISO 8601 |
| `updated_at` | TEXT | Última alteração ISO 8601 |

## Tabela `information`

| Coluna | Tipo | Uso |
|---|---|---|
| `id` | INTEGER | Identificador primário |
| `title` | TEXT | Título ou trecho |
| `category_id` | INTEGER | Categoria relacionada |
| `responsible` | TEXT | Responsável operacional |
| `validation` | TEXT | Validação ou designação |
| `contact` | TEXT | Contato ou canal de acionamento |
| `notes` | TEXT | Observações operacionais |
| `kind` | TEXT | Tipo do cadastro: geral, VLAN, câmera ou ponto |
| `details_json` | TEXT | Campos específicos do tipo em formato JSON |
| `updated_at` | TEXT | Última alteração ISO 8601 |

## Relacionamento

Cada informação pertence a uma categoria:

```text
categories (1) ─────────── (N) information
        id  <──────── category_id
```

## Inicialização

`ensureDatabase()` cria tabelas e índices caso ainda não existam. Se a tabela de categorias estiver vazia, cadastra os exemplos iniciais. A inicialização é idempotente: executá-la novamente não duplica os dados iniciais.

## Migrações

O esquema declarado fica em `db/schema.ts`. Após uma alteração estrutural:

```powershell
pnpm db:generate
```

O Drizzle Kit compara o esquema com os snapshots e cria uma nova migração em `drizzle/`. Nunca altere uma migração que já tenha sido aplicada em produção; crie outra.

## Índices

- `idx_information_category_id`: acelera consultas por categoria.
- `idx_information_title`: prepara a tabela para consultas frequentes pelo título.

## Cuidados

- Não armazene senhas ou segredos nas tabelas atuais.
- Faça backup/exportação antes de alterações destrutivas.
- Não apague `.wrangler` se precisar conservar o banco local.
- Não trate o estado React como fonte permanente.
- Valide campos na API antes de ampliar o acesso do sistema.

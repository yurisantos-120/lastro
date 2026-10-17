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
| `revision` | INTEGER | Versão para controle otimista de concorrência; começa em `1` e incrementa ao editar |
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
| `revision` | INTEGER | Versão para controle otimista de concorrência; começa em `1` e incrementa ao editar |
| `updated_at` | TEXT | Última alteração ISO 8601 |

## Relacionamento

Cada informação pertence a uma categoria:

```text
categories (1) ─────────── (N) information
        id  <──────── category_id
```

## Inicialização

`ensureDatabase()` cria tabelas e índices com `CREATE TABLE/INDEX IF NOT EXISTS`. A leitura inicial (`GET /api/data`) ainda chama essa rotina; portanto, uma leitura em banco novo pode criar schema e inserir os exemplos iniciais. Em banco já inicializado, os comandos de schema são idempotentes e os inserts de seed ficam condicionados à tabela de categorias estar vazia.

As categorias e registros iniciais são inseridos em um único `D1Database.batch()`. No D1, batch é uma transação sequencial: se uma instrução falhar, o batch inteiro é revertido. Isso evita o estado parcial (categorias sem registros iniciais) na nova inicialização. A criação dos seeds não substitui nem migra registros de uma inicialização anterior incompleta.

As tabelas usam `INTEGER PRIMARY KEY`, que no SQLite/D1 é uma chave inteira associada ao `rowid`. Novos cadastros omitem a coluna `id` para o banco gerar o identificador. Não usamos `AUTOINCREMENT`: não há requisito de nunca reutilizar IDs após exclusões (o sistema não oferece exclusão) e o auto incremento nativo já evita colisões entre inserções concorrentes.

`revision` é a versão autoritativa para edição concorrente. O GET retorna essa coluna em categorias e registros; PUT exige a versão lida e faz um `UPDATE ... WHERE id = ? AND revision = ?`, incrementando-a na mesma instrução. Versão divergente retorna `409 Conflict`; ID inexistente continua `404`. `updated_at` permanece apenas como data/hora informativa. O frontend mantém o formulário aberto no conflito e permite recarregar os dados atuais ou cancelar; não há merge automático.

## Migrações

### Fontes e responsabilidades

- `db/schema.ts` é a definição atual desejada do schema.
- `drizzle/0000_*.sql`, `0001_*.sql` e `0002_*.sql` são o histórico incremental, em ordem lexicográfica.
- `drizzle.config.ts` configura `drizzle-kit generate` para comparar `db/schema.ts` e gerar SQL em `drizzle/`.
- Wrangler D1 aplica os arquivos SQL e registra o histórico na tabela `d1_migrations`.
- `ensureDatabase()` é bootstrap/compatibilidade da aplicação. `CREATE TABLE IF NOT EXISTS` não atualiza tabela existente e não é migration.

O binding da aplicação é `DB`. O plugin local definido em `vite.config.ts` usa o banco local lógico `site-creator-d1` e ID placeholder; não é a identidade do D1 de produção. `wrangler.d1.local.jsonc` expõe esse binding ao CLI, aponta `migrations_dir` para `drizzle/` e é exclusivamente configuração local.

### Comparação do schema atual

| Elemento | `db/schema.ts` | Migration final (`0000`–`0002`) | DDL de bootstrap | Compatível? |
|---|---|---|---|---|
| Tabelas | `categories`, `information` | As duas criadas em `0000` | As duas criadas | Sim |
| Colunas de `categories` | `id`, `name`, `description`, `color`, `scope`, `revision`, `created_at`, `updated_at` | Campos base em `0000`; `scope` em `0002`; `revision` em `0003` | Todas | Sim |
| Colunas de `information` | `id`, `title`, `category_id`, `responsible`, `validation`, `contact`, `notes`, `kind`, `details_json`, `revision`, `updated_at` | Campos base em `0000`; `kind` e `details_json` em `0002`; `revision` em `0003` | Todas | Sim |
| Tipos, PKs e defaults | `INTEGER`/`TEXT`; IDs PK; defaults `general` e `{}` | Equivalentes após `0002` | Equivalentes | Sim |
| FK `information.category_id` | Referência a `categories.id`, ações padrão SQLite | `NO ACTION` explícito | Ações padrão SQLite | Sim; semântica equivalente |
| Índices | Categoria e título | Criados em `0001` | Criados | Sim |

Não identifiquei divergência funcional entre as três definições no estado final. Os snapshots Drizzle fazem parte da geração; não são aplicados ao banco.

### Gerar e revisar

Após alterar `db/schema.ts`:

```powershell
pnpm db:generate
```

Revise o SQL novo em `drizzle/`, os snapshots e o efeito sobre dados existentes antes de aplicá-lo. Nunca edite uma migration já aplicada; gere outra.

### Aplicar no D1 local

Em uma base local limpa, aplique as migrations antes de iniciar a aplicação (antes de um GET criar o schema pelo bootstrap):

```powershell
pnpm db:migrations:list:local
pnpm db:migrate:local
pnpm db:migrations:list:local
```

Os dois scripts sempre usam `--local` e `wrangler.d1.local.jsonc`; a persistência padrão fica em `.wrangler`. O script `pnpm start` aponta explicitamente para `.wrangler/state`, garantindo que a aplicação use a mesma base local. O primeiro comando lista migrations pendentes, o segundo aplica, e o último deve confirmar que não restaram pendências. `pnpm dev` e `pnpm start` não aplicam migrations automaticamente.

**Atenção à base local existente:** o bootstrap atual pode já ter criado o schema final sem histórico `d1_migrations`. Nesse caso, Wrangler considerará `0000` pendente e tentará criar tabelas existentes. Não execute `pnpm db:migrate:local` nessa base antes de resolver o baseline. Faça primeiro uma cópia/backup e use um ambiente temporário para validação. O mesmo cuidado será obrigatório para uma base remota preexistente.

#### Baseline de uma base local já inicializada pelo bootstrap

Use somente quando a inspeção confirmar que o schema e os dados já correspondem integralmente a `0000`–`0002`, mas a tabela `d1_migrations` não existe. Wrangler 4.92 não oferece comando dedicado de baseline. A tabela padrão que essa versão cria é `d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)`; o CLI compara os nomes de arquivo registrados com os arquivos em `drizzle/`.

1. Pare a aplicação e faça uma cópia física de `.wrangler` fora do repositório. Compare hashes SHA-256 dos arquivos e valide a integridade SQLite da cópia.
2. Em uma cópia descartável, teste o procedimento completo e confirme que só `0003` aparece pendente.
3. Apenas no banco local confirmado, registre os nomes das migrations já refletidas no schema. Isso altera somente o ledger; não executa `0000`–`0002` nem modifica tabelas operacionais:

```powershell
pnpm exec wrangler d1 execute DB --local --config wrangler.d1.local.jsonc --command "CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL); INSERT INTO d1_migrations (name) VALUES ('0000_blushing_kitty_pryde.sql'), ('0001_reflective_leper_queen.sql'), ('0002_elite_overlord.sql');"
```

4. Execute `pnpm db:migrations:list:local` e prossiga somente se listar exclusivamente `0003_loud_amazoness.sql`.
5. Aplique com `pnpm db:migrate:local`, liste novamente e compare schema, contagens, IDs, chaves estrangeiras e índices com o backup.

Esse procedimento é um baseline manual, específico à tabela/nomeação confirmados na versão Wrangler instalada. Não o use se qualquer parte do schema estiver diferente, se já existir histórico parcial, ou em D1 remoto. Em caso de dúvida, pare e investigue; não marque migrations como aplicadas apenas para fazer a listagem passar.

### Aplicar remotamente

Não existe configuração Wrangler de produção no repositório nem nome/ID real do D1 remoto; o arquivo local contém somente o binding placeholder. Por isso não há script remoto. Quando a configuração de produção for fornecida e revisada, use o nome real do banco (evita ambiguidade de binding):

```powershell
$databaseName = 'NOME_REAL_DO_D1'
$config = 'CAMINHO_PARA_CONFIG_WRANGLER_DE_PRODUCAO'
pnpm exec wrangler d1 migrations list $databaseName --remote --config $config
pnpm exec wrangler d1 migrations apply $databaseName --remote --config $config
```

Esses comandos são apenas referência e **não foram executados**. `--remote` é obrigatório para deixar o destino explícito. Antes de produção: backup manual, conferência do ambiente/conta/database name, revisar cada SQL, listar pendências, aplicar com operador presente, listar novamente e validar schema e CRUD. Não automatize isso em inicialização ou CI nesta etapa.

Wrangler registra migrations aplicadas em `d1_migrations`; a listagem retorna as pendentes, e uma migration já registrada não deve ser reaplicada. O `apply` pede confirmação interativa e, segundo a documentação D1, captura backup; se uma migration falhar, ela é revertida e as anteriores permanecem aplicadas. Um erro exige revisar SQL/estado antes de tentar novamente; não remova manualmente a tabela de histórico nem marque versões aplicadas sem comparar o schema.

### Migration, bootstrap e seeds

Migration altera estrutura e mantém histórico; seed/população de dados é outra responsabilidade. Os seeds operacionais são inseridos por `ensureDatabase()`, não pelos arquivos Drizzle. Migration não corrige seeds parcialmente inseridos por versões antigas.

O `GET /api/data` ainda chama `ensureDatabase()` e pode criar schema/seeds em uma base vazia. Em produção futura, migrations precisam ser aplicadas antes de liberar o app; o bootstrap não consegue evoluir estrutura já existente. Uma base antiga criada pelo bootstrap, mas sem registro de migrations, requer um plano de baseline separado e verificado — não aplique `0000` às cegas.

### Procedimento de atualização de uma base

1. Faça backup/exportação conforme política do ambiente.
2. Confirme que a configuração aponta para o banco correto; liste migrations pendentes.
3. Revise o SQL e valide antes em uma cópia/base temporária representativa.
4. Aplique explicitamente no ambiente pretendido (`--local` ou `--remote`).
5. Liste novamente, compare o schema e execute smoke CRUD.
6. Libere o uso somente após validação; se houver falha, preserve o banco e o histórico para diagnóstico/recuperação.

### Controle otimista de concorrência

Novos registros e categorias recebem `revision = 1` pelo default do banco. O cliente não escolhe esse valor na criação. Na edição, o campo recebido pelo GET é devolvido no PUT. A migration `0003` adiciona as colunas com default `1`, preservando linhas anteriores. Se dois clientes editarem a mesma versão, apenas o primeiro UPDATE condicional poderá gravar; o segundo recebe conflito `409` e deve recarregar antes de tentar novamente. Não aplique `0003` em um banco sem baseline das migrations; valide primeiro em cópia/ambiente temporário.

## Índices

- `idx_information_category_id`: acelera consultas por categoria.
- `idx_information_title`: prepara a tabela para consultas frequentes pelo título.

## Cuidados

- Não armazene senhas ou segredos nas tabelas atuais.
- Faça backup/exportação antes de alterações destrutivas.
- Não apague `.wrangler` se precisar conservar o banco local.
- Não trate o estado React como fonte permanente.
- Valide campos na API antes de ampliar o acesso do sistema.

### Identidade local vinculada ao GLPI (`0006`)

A migration `0006_closed_black_bird` adapta `users` para guardar a identidade GLPI (`glpi_user_id`, obrigatório, positivo e único), além do nome/login normalizado, role local (`viewer`, `operator` ou `admin`), estado ativo, revisão e datas. O username também permanece único para impedir identidades locais ambíguas; `glpi_user_id` é a referência estável para a conta GLPI. Os campos `password_hash` e `password_reset_required` deixam de fazer parte do schema funcional: no fluxo planejado, o GLPI autentica e o Lastro mantém sessão, autorização local e autoria.

A migration não inventa correspondências para contas antigas: uma linha legada sem ID GLPI faz a cópia falhar, exigindo um mapeamento deliberado antes de aplicar em qualquer base que contenha usuários locais. Ela não cria usuários. `sessions` mantém a FK restritiva para `users.id`. `auth_bootstrap` é preservada como estado singleton da inicialização do primeiro administrador local e não deve ser removida com base apenas na futura delegação de autenticação ao GLPI.

`tickets.created_by` continua nullable e sem FK nesta etapa: quando usuários Lastro forem implementados, guardará o ID local (`users.id`), nunca o ID técnico GLPI. O registro existente e qualquer `NULL` legado permanecem intactos.

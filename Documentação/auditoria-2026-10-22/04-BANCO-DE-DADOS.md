# Banco de dados e persistência

## Método de inspeção sem alterações

O código SQL, esquema e journal foram lidos estaticamente. Nenhum comando Drizzle/Wrangler de geração ou aplicação de migrations foi executado. A aplicação não foi iniciada sobre o estado recuperado.

Foram encontrados cinco arquivos `.sqlite` sob `.wrangler`. Os arquivos WAL presentes tinham tamanho zero no momento da inspeção; cada SQLite foi copiado para a pasta temporária isolada e aberto com `node:sqlite`, `DatabaseSync(..., { readOnly: true })`. Foram consultados apenas nomes de tabelas/colunas, contagens, histórico de migrations, `PRAGMA quick_check` e `PRAGMA foreign_key_check`. Não foram reproduzidos valores de usuários, tokens, títulos, contatos, conteúdos ou sessões.

Quatro arquivos continham apenas a tabela auxiliar `_cf_ALARM`. Um continha as tabelas operacionais. Trata-se de fotografia dos arquivos locais encontrados, não de comprovação do destino remoto nem de qual instância um servidor recuperado ainda em execução esteja utilizando.

## Resultado do snapshot operacional

| Objeto | Situação observada |
|---|---|
| `categories` | 7 linhas, com `scope` e `revision` |
| `information` | 7 linhas, com `kind`, `details_json` e `revision` |
| `users` | 1 linha; esquema já usa `glpi_user_id`, sem colunas de senha local |
| `sessions` | 7 linhas; contagem não indica quantas estão válidas |
| `tickets` | 3 linhas; não foram lidos conteúdos ou IDs externos |
| `auth_bootstrap` | Tabela presente; não foi lido seu estado |
| `d1_migrations` | Arquivos `0000` a `0006` registrados |
| `import_batches`, `import_records` | **Ausentes** |
| Integridade SQLite | `quick_check = ok` |
| Relacionamentos declarados | `foreign_key_check`: zero violações |

Integridade física e FKs sem violações não demonstram validade semântica de todo JSON, ausência de duplicatas, correção cadastral ou completude da recuperação.

## Esquema atual

Fonte: `db/schema.ts`.

| Tabela | Finalidade e invariantes |
|---|---|
| `categories` | Nome, descrição, cor, escopo, revisão e timestamps |
| `information` | Cadastro genérico por tipo, FK de categoria, detalhes JSON, revisão e timestamp |
| `users` | Identidade GLPI única, username normalizado único, role/active/revision com checks |
| `sessions` | FK restritiva de usuário, hash único de token, criação/último acesso/expiração/revogação; índices de usuário e expiração |
| `auth_bootstrap` | Singleton de ID 1 para permitir bootstrap de administrador uma única vez |
| `tickets` | Chave de operação e ID GLPI únicos; estado local limitado por check; autoria numérica opcional, revisão e timestamps |
| `import_batches` | UUID, manifesto/hash, estado, contadores e finalização coerente por checks |
| `import_records` | FK restritiva para lote e registro, identidade de origem única, hashes, fingerprint e estados coerentes |

Relações: categoria 1:N informações; usuário 1:N sessões; lote 1:N origens importadas; origem pode apontar para informação inserida. `tickets.created_by` não declara FK para usuários. Referências técnicas de ONU/OLT/VLAN e parceiros são texto no JSON, não relacionamentos.

`categories.scope`, `information.kind`, revisão das tabelas operacionais e conteúdo de `details_json` não têm todos os checks de domínio que a API implementa. A compatibilidade categoria/tipo é garantida nas instruções de escrita de `persistence.ts`, não por uma FK composta. Escritas alternativas precisam repetir as invariantes ou compartilhar a camada de domínio.

## Migrations e journal

| Migration | Propósito estático | Snapshot local |
|---|---|---|
| `0000_blushing_kitty_pryde` | Tabelas de categorias e informações | Registrada |
| `0001_reflective_leper_queen` | Índices de categoria e título | Registrada |
| `0002_elite_overlord` | Escopo, tipo e detalhes JSON | Registrada |
| `0003_loud_amazoness` | Revisões otimistas | Registrada |
| `0004_noisy_rictor` | Histórico de chamados e índices únicos | Registrada |
| `0005_fast_brood` | Autenticação inicial com senha local, sessões e bootstrap | Registrada |
| `0006_closed_black_bird` | Substitui modelo de usuário por identidade GLPI | Registrada |
| `0007_import_tracking` | Lotes e registros de importação | **Não registrada; tabelas ausentes** |

`drizzle/meta/_journal.json` contém oito entradas, índices 0–7, e há snapshots até `0007_snapshot.json`. A presença desses arquivos não aplica SQL automaticamente. Migrations 0003–0007 e seus snapshots ainda estavam não rastreados no Git inicial.

**Risco de recuperação:** `0006` insere `NULL` em `glpi_user_id NOT NULL` ao copiar usuários legados. O comentário explica a intenção de abortar quando não há mapeamento seguro. Isso é proteção deliberada, não motivo para inventar IDs ou remover dados. Uma instalação antiga com usuários de senha local exige estratégia própria. O snapshot encontrado já possui o esquema GLPI; não se deve reaplicar migrations às cegas.

## Inicialização

`db/storage.ts` chama `ensureDatabaseSchema()` antes de leitura e escrita. `db/persistence.ts:4` executa `CREATE TABLE IF NOT EXISTS` de apenas `categories` e `information`, além de dois índices. Não insere demonstração e não aplica migrations de autenticação, chamados ou importação.

Consequências comprovadas pelo código:

- Um GET de dados pode emitir DDL, embora seja consulta do ponto de vista da UI.
- `IF NOT EXISTS` não acrescenta colunas a uma tabela antiga.
- Um banco vazio pode receber as duas tabelas operacionais, mas continuar incapaz de autenticar e operar chamados/importação.
- A definição atual das duas tabelas inclui colunas adicionadas por migrations posteriores; não existe coordenação automática entre esse atalho de inicialização e o histórico de migrations.

Recomendação: em implementação futura, tornar o histórico de migrations a autoridade, validar versão esperada e falhar com diagnóstico seguro. O procedimento concreto depende de backup e homologação; não foi executado nesta auditoria.

## Importação: implementado e pendente

`db/import-storage.ts` valida metadados, rejeita padrões de credencial, cria lote, reserva origem, insere informação e atualiza contadores em `db.batch()`. A identidade é hash de versão fixa + arquivo lógico + aba + linha; hash do arquivo e fingerprint são comparadores, não parte da chave de origem. Reprocessar a mesma localização retorna `already_processed` mesmo quando os comparadores diferem.

As tabelas têm checks úteis de hashes, caminhos proibidos em nomes, limites de linha, estados e consistência de referência. Não há unicidade do fingerprint global: duas origens diferentes com o mesmo conteúdo podem ser inseridas. Isso pode ser correto; definir política antes de mudar.

Lacunas: a validação de registro importado não equivale à API manual; finalização pode usar status calculado a partir de leitura anterior aos últimos processamentos concorrentes; não há parser/entrada autorizada nem UI de rastreabilidade. Não classificar como importador pronto para uso.

## Demonstração e persistência

A inicialização atual não semeia exemplos. O teste isolado de persistência confirmou que inicializar um banco vazio permanece sem dados de demonstração e que inicializar um banco preenchido preserva as linhas sintéticas. **Não foi determinado se as sete informações recuperadas são exemplos ou dados operacionais**, pois seus conteúdos não foram examinados. Nenhuma exclusão ou classificação por suposição é recomendada.

`scripts/start-worker.mjs` usa `--local --persist-to .wrangler/state`; `vite.config.ts` fornece binding a partir do hosting e usa ID placeholder no ambiente local. `wrangler.d1.local.jsonc` define binding `DB`, diretório `drizzle` e ID placeholder. Essa configuração não identifica o D1 remoto real. Os valores de `.env` não foram abertos. O diagnóstico não certifica backup remoto nem persistência em produção.

## Próximas verificações autorizáveis

Antes de qualquer migração futura: identificar qual banco a instância usa, preservar backup consistente, reconciliar journal/histórico/tabelas, ensaiar em cópia descartável, verificar diferenças de dados e preparar retorno. A aplicação da 0007 é uma recomendação condicionada a essa análise, não uma ação realizada ou autorização implícita.

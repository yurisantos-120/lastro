# Etapa 14.4 — revisão arquitetural pontual

Data: 23/10/2026. Base: auditoria consolidada da Etapa 13 e relatórios das Etapas 14.1–14.3. Os IDs **A14-01 a A14-04** foram atribuídos nesta etapa para acompanhar observações arquiteturais sem ID no relatório original; não substituem os IDs originais da auditoria.

## Achados investigados

| ID | Evidência, impacto e decisão |
|---|---|
| D13-01 | DDL em GET já corrigido na Etapa 14.1. A leitura atual continua sem bootstrap; testes de schema até 0012 permanecem aprovados. |
| D13-02 | Listagem sem paginação já corrigida na Etapa 14.2. `GET /api/data` mantém os recursos, limites, filtros, ordenação, totais e autorização descritos no contrato daquela etapa. |
| Q13-01 | Teste intermitente já corrigido na Etapa 14.3; a suíte completa passou nesta revisão. |
| A14-01 | O §6 da auditoria citava métodos legados de escrita em `db/storage.ts`. Busca de referências confirmou que `createCategory`, `updateCategory`, `createRecord` e `updateRecord` dessa camada não tinham consumidores no runtime. Eles ofereciam uma segunda entrada de escrita sem a reserva/recibo de `DataOperations`, com risco de reutilização acidental. Removidos. Os adaptadores necessários apenas a `tests/persistence.test.ts` foram movidos de `db/persistence.ts` para `tests/helpers/legacy-persistence.ts`; comportamento de testes preservado. |
| A14-02 | Os seletores de categoria e rota repetiam debounce, paginação de 30 itens, cancelamento de requisição, erro/nova tentativa e recuperação do item selecionado fora da página. Correções anteriores precisaram ser feitas nos dois arquivos. A lógica foi reunida em `components/use-catalog-picker.ts`; rótulos, campos e recursos de API permanecem nos componentes específicos. |
| A14-03 | `RecordKind` e sua lista de valores eram declarados em `db/data-types.ts`, `db/catalog-pagination.ts` e `app/page.tsx`. Isso permitiria divergência entre cadastro e filtro ao adicionar um tipo. A consulta e a interface agora reutilizam o tipo e a lista existentes em `db/data-types.ts`. |
| A14-04 | Com o Worker isolado desligado, o seletor exibiu a mensagem bruta `Failed to fetch`. O hook compartilhado passou a apresentar a mensagem contextual do Lastro para falha de rede ou resposta inesperada, preservando a seleção e o botão de nova tentativa. Nenhum erro de API ou contrato HTTP foi alterado. |

Arquivos grandes foram analisados por responsabilidade: `app/page.tsx` coordena navegação, outbox cadastral e formulários; dashboard, chamados, RFO e passagem de turno já possuem componentes/serviços separados. **O tamanho isolado não provou defeito** que justificasse divisão ampla. A dependência entre recuperação de intenção e estado de navegação continua um risco de manutenção, mas extraí-la junto com URL/Voltar (UX02) exigiria redesenhar testes de rascunho, modal, histórico do navegador e acessibilidade. Essa mudança fica para implementação específica. O uso de `ParsedDataPayload` em `db/data-operations.ts` é importação apenas de tipo: não há dependência de runtime do banco na rota de API. Não se demonstrou ciclo de imports, consulta duplicada adicional ou código morto nos demais módulos inspecionados.

S13-01 (limite de login por instância) e S13-02 (dependência RSC) permanecem itens de segurança com risco maior que esta revisão; UX02 permanece mudança funcional de navegação. O endpoint HTTPS/infraestrutura GLPI continua pendência externa. Nenhum desses itens foi alterado aqui.

## Compatibilidade e validação

- Testes dirigidos de paginação, API de dados, idempotência, persistência e interface GLPI simulada: **48/48 aprovados** após a extração inicial. Testes dirigidos de persistência, operações e paginação após mover os adaptadores: **32/32 aprovados**.
- Suíte completa final: **231/231 aprovados**. Lint e TypeScript aprovados. Build final aprovado em cópia temporária com D1 exclusivamente sintético e sem `.env`/`.dev.vars`.
- Edge real em `127.0.0.1:8788` com **38 categorias, 57 informações, um usuário/sessão e um chamado sintéticos** em banco isolado. O seletor de categoria mostrou 36 opções gerais em duas páginas e manteve a categoria 38 ao mudar a busca. O seletor de rota no detalhe do chamado mostrou 53 rotas em duas páginas e manteve a rota 1 após busca diferente. A consulta dos detalhes mostrou a mensagem de dados locais; **nenhuma consulta ou operação no GLPI ocorreu**.
- Desligar apenas o Worker isolado durante o teste fez o seletor mostrar erro contextual em português e manter a rota 1. Após reiniciá-lo, “Tentar novamente” eliminou o erro e preservou a seleção. Temas claro/escuro e lista móvel de 390 px foram conferidos sem rolagem horizontal. Nenhum formulário foi enviado.
- Capturas: [categoria na página 2](../evidencias-etapa-14-4/edge14-4-form-picker-page2.png), [rota no tema escuro](../evidencias-etapa-14-4/edge14-4-route-picker-visible.png), [rota no tema claro](../evidencias-etapa-14-4/edge14-4-route-picker-light.png).

Uma tentativa de build no diretório operacional recebeu `EPERM` porque o `dist` estava em uso; não concluiu. O build final isolado passou. Depois, `GET /api/auth/me` anônimo na porta operacional 8787 respondeu HTTP 200 com `user:null`. A instância temporária foi encerrada.

## Arquivos modificados

`db/storage.ts`; `db/catalog-pagination.ts`; `app/page.tsx`; `components/catalog-category-picker.tsx`; `components/catalog-route-picker.tsx`; novo `components/use-catalog-picker.ts`; `db/persistence.ts` movido para `tests/helpers/legacy-persistence.ts`; `tests/persistence.test.ts`; este relatório, índice da documentação, acompanhamento da auditoria e capturas em `Documentação/evidencias-etapa-14-4/`.

Não houve migration, modificação do D1 operacional, chamada real ao GLPI, alteração de autenticação/credenciais, mudança de design, commit ou push. O contrato público paginado de `/api/data` e a escrita idempotente continuam os mesmos.

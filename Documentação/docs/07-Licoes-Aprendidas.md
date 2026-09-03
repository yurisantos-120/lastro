# 7. Lições aprendidas

## Estado de tela não é armazenamento

A primeira versão mantinha categorias e informações somente no `useState` do React. Isso permitia interagir com a interface, mas os dados desapareciam ao recarregar. A correção foi definir D1/SQLite como fonte permanente e recarregar os dados pela API.

## Botão visual precisa de comportamento completo

O botão inicial de edição de categoria não tinha evento conectado. Uma funcionalidade deve ser validada de ponta a ponta: abrir formulário, preencher dados existentes, salvar, receber confirmação do banco e atualizar a tela.

## Dados operacionais exigem cuidado

A planilha contém contatos e orientações de operação. Antes de publicar, compartilhar ou importar toda a base, é necessário confirmar o público autorizado e revisar dados pessoais ou sensíveis.

## Separar responsabilidades simplifica manutenção

A interface não executa SQL. A rota HTTP não contém detalhes de apresentação. A camada `db/storage.ts` concentra persistência. Essa separação reduz o risco de alterações em uma área quebrarem outra.

## Preferências podem ser locais

O tema claro/escuro não é dado operacional. Por isso, pode ficar no `localStorage`. Categorias e informações, por outro lado, pertencem ao banco persistente.

## Migrações devem acompanhar o código

Alterar apenas a definição TypeScript do esquema não atualiza bancos existentes. Toda mudança estrutural deve gerar e versionar uma migração SQL.

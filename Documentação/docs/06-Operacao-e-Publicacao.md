# 6. Operação e publicação

## Desenvolvimento

Use `pnpm dev`. As alterações em React e CSS são recarregadas automaticamente. O banco local é fornecido pelo ambiente Cloudflare configurado em `vite.config.ts`.

## Verificação

Antes de publicar:

```powershell
pnpm build
pnpm lint
```

O build é o critério mínimo de execução. Atualmente, o lint possui pendências conhecidas no scaffold e na página principal; consulte a observação no guia de execução antes de utilizá-lo como bloqueio automático.

Também valide manualmente:

- Pesquisa com e sem resultados.
- Cadastro e edição de categoria.
- Cadastro e edição de informação.
- Persistência depois de atualizar a página.
- Tema claro e escuro.
- Uso em largura de celular e desktop.

## Configuração da hospedagem

`.openai/hosting.json` contém:

- `project_id`: identificador do site na plataforma.
- `d1: "DB"`: nome lógico do banco usado pelo código.
- `r2: null`: indica que não há armazenamento de arquivos.

Não coloque tokens, senhas ou chaves nesse arquivo.

## Ambientes

Desenvolvimento e produção usam bancos diferentes. Para levar dados de um ambiente a outro, é necessário um processo explícito de importação ou migração; copiar o código não copia os registros.

## Logs e diagnóstico

Erros de API retornam status HTTP e uma mensagem JSON. Na interface, falhas de armazenamento aparecem em um alerta. Durante o desenvolvimento, consulte o terminal onde `pnpm dev` está executando para ver erros do servidor.

## Backup

Antes de uso operacional amplo, defina:

- Frequência de exportação.
- Local seguro de armazenamento.
- Responsável pelo backup.
- Procedimento de restauração.
- Teste periódico de recuperação.

# NOC Megalink — Eidos

Sistema interno para organizar, pesquisar, cadastrar e editar informações operacionais do NOC Megalink por categorias.

## Início rápido

Requisitos: Node.js 22.13 ou superior, pnpm e VS Code.

```powershell
pnpm install
pnpm dev
```

Abra `http://localhost:3000`.

Para instruções detalhadas, arquitetura, banco de dados e solução de problemas, consulte o [Manual do projeto](Documentação/README.md).

## Comandos

| Comando | Finalidade |
|---|---|
| `pnpm dev` | Inicia o ambiente local com recarregamento automático |
| `pnpm build` | Gera e valida a versão de produção |
| `pnpm start` | Executa localmente o build de produção |
| `pnpm lint` | Analisa problemas no código |
| `pnpm format` | Formata o código |
| `pnpm db:generate` | Gera migrações após mudanças no esquema do banco |

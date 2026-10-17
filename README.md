# Lastro

Sistema interno da Eidos para organizar, pesquisar, cadastrar e editar informações operacionais por categorias.

## Início rápido

Requisitos: Node.js 22.13 ou superior, pnpm e VS Code.

```powershell
pnpm install
pnpm dev
```

Abra `http://localhost:3000`.

Para instruções detalhadas, arquitetura, banco de dados e solução de problemas, consulte o [Manual do projeto](Documentação/README.md).

## Iniciando no Windows

Instale Node.js estavel **22.13.0 ou superior**. O projeto fixa **pnpm 11.19.0**, versao usada para validar o lockfile atual (`lockfileVersion: 9.0`). O formato do lockfile sozinho nao identifica uma unica versao do pnpm.

Na primeira configuracao, instale o pnpm se necessario (acao manual, uma vez por computador):

```powershell
npm.cmd install -g pnpm@11.19.0
pnpm.cmd -v
pnpm.cmd install
```

`npm install -g pnpm` instala globalmente; aqui usamos a versao fixa para manter o ambiente previsivel. Usar `npm.cmd`/`pnpm.cmd` evita bloqueios dos atalhos `.ps1` pela politica do PowerShell. Reabra o terminal apos a instalacao.

Depois, dentro da pasta do projeto:

```powershell
cd "C:\analista de redes\OpusLog"
.\start-dev.ps1
```

Ou execute `start-dev.bat` com duplo clique (no PowerShell: `.\start-dev.bat`). Se a politica local bloquear o `.ps1`, use o `.bat`: ele aplica `ExecutionPolicy Bypass` somente ao processo filho, sem modificar a politica permanente. Politicas corporativas podem continuar bloqueando scripts; nesse caso, solicite orientacao da TI, sem alterar a politica global.

O inicializador verifica Node e pnpm, instala dependencias com `pnpm install --frozen-lockfile` quando ausentes/incompletas e executa `pnpm dev`. Sempre trabalha na pasta do proprio script, mesmo se iniciado de outro diretorio. Use Ctrl+C para encerrar.

Para apenas diagnosticar, sem instalar nem iniciar:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\check-environment.ps1
```

`pnpm dev` continua funcionando normalmente: chama `vinext dev`, que carrega `vite.config.ts` e os plugins Vinext, Sites e Cloudflare. A verificacao adicional pertence ao inicializador.

### Permissoes e instalacao no perfil do usuario

`corepack enable` pode falhar com `EPERM` ao criar atalhos em `C:\Program Files\nodejs`. Ele **nao e necessario** para iniciar o sistema e nao e executado pelos scripts. Nenhum script altera PATH, instala ferramentas globalmente, modifica Program Files ou solicita Administrador.

Se `npm.cmd install -g` tambem falhar por um prefixo protegido, uma alternativa manual e instalar em uma pasta do seu perfil:

```powershell
npm.cmd install -g pnpm@11.19.0 --prefix "$env:LOCALAPPDATA\pnpm"
```

Depois adicione essa pasta ao PATH **do usuario** pela interface de variaveis de ambiente do Windows, se permitido pela TI, e reabra o terminal. O projeto nao faz essa mudanca. Nao e necessario alterar o PATH do sistema nem executar como Administrador.

### Diagnostico

| Codigo | Orientacao |
|---|---|
| `NODE_NOT_FOUND` | Instalar Node compativel e reabrir o terminal |
| `NODE_VERSION_INVALID` | Verificar a versao minima e usar Node estavel |
| `PNPM_NOT_FOUND` | Instalar o pnpm fixado e conferir o PATH do usuario |
| `PNPM_VERSION_INVALID` | Instalar pnpm 11.19.0 e verificar `pnpm.cmd -v` |
| `DEPENDENCY_INSTALL_FAILED` | Conferir o erro original do pnpm, rede e permissoes locais |
| `DEV_SERVER_FAILED` | Conferir o erro original do Vinext; Ctrl+C tambem pode produzir retorno nao zero |

O verificador tambem informa `PROJECT_CONFIG_INVALID` para manifesto invalido e retorna codigo 14 se faltarem dependencias no modo diagnostico. Ele verifica a presenca de `node_modules` e do executavel Vinext, nao a integridade de todos os pacotes. Se houver inconsistencias, execute `pnpm.cmd install` manualmente.

## Comandos

Integração e fluxo local: [Chamados e GLPI](Documentação/docs/10-Chamados-e-Integracao-GLPI.md). Configuração técnica: [Integração inicial GLPI](Documentação/docs/09-Integracao-GLPI.md).

| Comando | Finalidade |
|---|---|
| `pnpm dev` | Inicia o ambiente local com recarregamento automático |
| `pnpm dev:check` | Verifica Node, pnpm e dependencias no Windows |
| `pnpm build` | Gera e valida a versão de produção |
| `pnpm start` | Executa localmente o build de produção |
| `pnpm lint` | Analisa problemas no código |
| `pnpm format` | Formata o código |
| `pnpm db:generate` | Gera migrações após mudanças no esquema do banco |

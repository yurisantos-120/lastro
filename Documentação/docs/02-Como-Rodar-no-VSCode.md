# 2. Como executar no VS Code

## Pré-requisitos

Instale:

- [Visual Studio Code](https://code.visualstudio.com/)
- Node.js 22.13 ou uma versão mais recente da linha 22
- pnpm

Confira as versões no terminal:

```powershell
node --version
pnpm --version
```

Se o pnpm não estiver disponível, habilite-o pelo Corepack fornecido pelo Node.js:

```powershell
corepack enable
corepack prepare pnpm@latest --activate
```

## Abrir o projeto

1. Abra o VS Code.
2. Acesse **File > Open Folder**.
3. Selecione `C:\analista de redes\gerencia de informações`.
4. Abra o terminal integrado com **Terminal > New Terminal**.

## Primeira execução

Instale as dependências:

```powershell
pnpm install
```

Inicie o ambiente de desenvolvimento:

```powershell
pnpm dev
```

O terminal exibirá o endereço local, normalmente:

```text
http://localhost:3000
```

O servidor também escuta em todas as interfaces da máquina. Para testar pelo celular, conecte computador e celular à mesma rede Wi-Fi e abra `http://IP-DO-COMPUTADOR:3000`.

Mantenha esse terminal aberto enquanto utiliza o sistema. Para interromper, pressione `Ctrl+C`.

## Executar pela tarefa do VS Code

1. Acesse **Terminal > Run Task**.
2. Selecione **NOC Megalink: iniciar desenvolvimento**.
3. Use o endereço exibido no terminal.

## Validar antes de entregar uma alteração

```powershell
pnpm build
pnpm lint
```

O build precisa terminar sem erro. O lint ajuda a detectar padrões problemáticos no código.

> Estado atual: o build do sistema passa. O lint ainda aponta avisos de acessibilidade e tipagem em componentes gerados pelo scaffold, além de alguns pontos da página principal. Eles não impedem a execução, mas devem ser tratados antes de adotar o lint como bloqueio obrigatório de publicação.

## Executar a versão de produção local

```powershell
pnpm build
pnpm start
```

O comando `start` utiliza os arquivos gerados na pasta `dist`.

## Banco local

O ambiente de desenvolvimento cria o banco D1 local por meio do simulador da Cloudflare. Seu estado fica dentro da pasta de trabalho do projeto, sob `.wrangler`. Não apague essa pasta se quiser preservar os cadastros locais.

O banco local e o banco publicado são ambientes separados. Um cadastro feito em `localhost` não aparece automaticamente no sistema publicado, e vice-versa.

## Problemas comuns

### `pnpm` não é reconhecido

Feche e reabra o terminal depois de ativar o Corepack. Confirme com `pnpm --version`.

### Porta 3000 ocupada

Encerre a outra aplicação que utiliza a porta ou use o endereço alternativo mostrado pelo terminal.

### Dependências inconsistentes

Execute novamente:

```powershell
pnpm install
```

### Cadastros desapareceram no ambiente local

Verifique se a pasta `.wrangler` foi removida, se o projeto foi aberto a partir de outra cópia ou se você está comparando o banco local com o publicado.

### Mudança no banco não foi aplicada

Depois de alterar `db/schema.ts`, execute:

```powershell
pnpm db:generate
```

Revise o SQL criado em `drizzle/` e reinicie o servidor de desenvolvimento.

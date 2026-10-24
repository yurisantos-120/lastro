# Lastro — visão geral da auditoria

Data: 22/10/2026, America/Sao_Paulo. Repositório: `C:\Users\yurit\meus projetos\lastro`.

## Diagnóstico executivo

O Lastro recuperado possui uma base funcional aproveitável: cadastros de quatro tipos, categorias com escopo, pesquisa, autenticação GLPI com sessão local, autorização por perfil, histórico local de chamados e persistência com controle otimista de concorrência. A reformulação deve ser incremental. Não há evidência técnica que justifique uma reescrita completa.

Os pontos prioritários são a diferença entre código e banco recuperado, a segurança do transporte das credenciais, a rastreabilidade das alterações e os fluxos de erro dos formulários. O modelo atual de rotas é documental; não representa uma topologia de fibra com trechos, terminações e conexões. A importação possui infraestrutura de persistência, mas não um fluxo disponível ao usuário.

**Achado comprovado mais importante:** `0007_import_tracking.sql` está no repositório e no journal, mas o snapshot local inspecionado registra migrations somente até `0006` e não contém `import_batches` nem `import_records`. Isso não demonstra falha nos cadastros existentes; impede usar a infraestrutura de importação nesse banco sem uma etapa futura de preparação autorizada.

Os 44 testes selecionados passaram, assim como lint, typecheck e build isolados. A suíte completa não foi executada porque quatro arquivos de teste executam SQL de migrations. Não foram feitas chamadas ao GLPI nem avaliações visuais em navegador. Esses limites impedem afirmar homologação integral ou segurança de produção.

## Método e classificação

- **Comprovado (C):** observado no código atual, metadados Git, snapshot somente leitura ou execução isolada registrada.
- **Risco (R):** mecanismo ou lacuna real cujo impacto depende de volume, configuração, concorrência ou política ainda não confirmada.
- **Sugestão (S):** evolução de produto/arquitetura; não é defeito demonstrado.

Prioridade e classificação são independentes: uma medida preventiva pode ter prioridade alta sem representar incidente ou exploração comprovada. Não foi demonstrada vulnerabilidade crítica explorada. Não foram consultadas bases externas de CVEs; versões instaladas não foram declaradas livres de vulnerabilidades.

## Stack reconhecida

Versões declaradas em `package.json` e confirmadas nos respectivos `node_modules/*/package.json`:

| Camada | Tecnologia / versão |
|---|---|
| Interface | React, React DOM e React Server DOM Webpack `19.2.6` |
| Framework / build | Vinext `1.0.0-beta.5`, Vite `8.0.13`; convenções App Router e imports `next/*` |
| Worker | Cloudflare Vite Plugin `1.37.1`, Wrangler `4.92.0` |
| Plataforma auxiliar | Sites Vite Plugin `0.2.0` |
| Banco | Cloudflare D1 / SQLite, Drizzle ORM `0.45.2`, Drizzle Kit `0.31.10` |
| Estilos / componentes | Tailwind CSS e PostCSS `4.2.1`, Base UI `1.7.0`, Shadcn React `0.3.0`, CLI Shadcn `4.18.0`, tw-animate-css `1.4.0` |
| Ícones / utilitários | Lucide React `1.31.0`, clsx `2.1.1`, class-variance-authority `0.7.1`, tailwind-merge `3.6.0` |
| Bibliotecas de UI presentes | Recharts `3.8.0`, date-fns `4.1.0`, react-day-picker `9.8.1`, cmdk `1.1.1`, embla-carousel-react `8.5.2`, input-otp `1.4.2`, react-resizable-panels `4.5.8` |
| Qualidade | TypeScript `5.9.3`, Oxlint `1.76.0`, oxlint-tsgolint `7.0.2001`, Oxfmt `0.61.0`, runner `node:test` |
| Plugins adicionais declarados | vitejs/plugin-react `6.0.2`, vitejs/plugin-rsc `0.5.26` |
| Tipos | Node `22.19.19`, React `19.2.14`, React DOM `19.2.3`, Workers `4.20260515.1` |

O runtime observado foi Node `v24.22.0`; o projeto pede Node `>=22.13.0` e pnpm `11.19.0`. `pnpm.cmd` não estava disponível no PATH desta sessão. Os binários instalados foram invocados diretamente, sem instalar pacotes. A presença de `next.config.ts` não significa que o build seja executado por Next CLI: os scripts usam Vinext.

## Organização e responsabilidades

| Caminho | Responsabilidade atual |
|---|---|
| `app/page.tsx` | Shell autenticado, oito áreas, pesquisa, dashboard, cadastros, modais e tema; 514 linhas |
| `app/layout.tsx`, `app/globals.css` | Metadados Lastro, fontes, AuthProvider, estilos e adaptações de tema |
| `components/auth-provider.tsx` | Sessão no cliente, login/logout, tratamento de 401; 269 linhas |
| `components/tickets-section.tsx` | Histórico, abertura, modelos placeholder, detalhes e sincronização; 241 linhas |
| `components/glpi-test-panel.tsx` | Diagnóstico e criação de chamado real de teste, restrito a admin na UI; 162 linhas |
| `components/ui/` | Catálogo de componentes reutilizáveis, maior que o subconjunto utilizado pela página |
| `app/api/` | Adaptadores HTTP de dados, autenticação e GLPI |
| `services/auth/` | Serviço de identidade, política de acesso, cookies, erros e rate limit |
| `services/glpi/` | Configuração, cliente técnico, autenticação humana e normalização de erros |
| `services/tickets/` | Workflow durável de criação e consulta de chamados |
| `db/` | Esquema Drizzle, SQL D1, repositórios e infraestrutura de importação |
| `drizzle/` | Oito migrations SQL, snapshots e journal |
| `tests/` | Nove arquivos de teste de regras, serviços, persistência e inicialização |
| `scripts/`, `start-dev.*` | Verificação do ambiente e inicializadores Windows / Worker local |
| `.wrangler/` | Estado local ignorado pelo Git; contém SQLite, arquivos auxiliares e logs/estado de ferramentas |
| `.next/`, `.vinext/`, `dist/` | Artefatos recuperados de desenvolvimento/build; não garantem correspondência com o código atual |
| `Documentação/` | Manual, arquitetura, operação, GLPI, autenticação e esta auditoria |

## Git e recuperação

Branch: `main`. HEAD observado: `95b134f` — “Ajustes visuais e de contraste da sidebar”, 09/09/2026. Commits anteriores visíveis: `46e60c9` e `451d14d`.

Na entrada havia **31 arquivos versionados modificados e 68 arquivos não rastreados** quando estes foram enumerados individualmente. O resumo comum de `git status` agrupa algumas pastas. Entre os não rastreados estavam autenticação, GLPI, importação, testes, scripts e migrations `0003` a `0007`. Portanto, um checkout de HEAD não reproduz este sistema recuperado. Não foi consultado conteúdo histórico para procurar credenciais nem foi feito commit/push.

Foram preservadas as alterações anteriores. A comparação SHA-256 dos 140 arquivos nas pastas de código, testes, migrations e assets copiadas antes das verificações não apontou diferenças após os checks. Somente os oito documentos desta pasta foram adicionados ao projeto pela auditoria.

## Documentação preexistente e divergências

Existem `README.md`, índice do manual e capítulos `01` a `11`. São úteis para operação, mas precisam ser reconciliados com a implementação:

- `Documentação/docs/05-Roadmap.md` ainda coloca autenticação e integração entre objetivos futuros, embora já implementadas.
- `Documentação/docs/11-Autenticacao-Backend.md`, seção “Limitações desta fase”, afirma ausência de proteção nas rotas e de tela de login; o código atual já possui ambos.
- O README conserva um exemplo de diretório com nome antigo; há referências internas a OpusLog/NOC/Megalink. Não renomear cookies ou bindings automaticamente, pois são contratos operacionais.

## Scripts e limites de execução

`dev`: Vinext dev; `build`: Vinext build; `start`: Wrangler local sobre `dist/server/wrangler.json`; `dev:check`: diagnóstico PowerShell; `lint`: Oxlint; `typecheck`: TypeScript sem emissão; `test`: nove arquivos com Node; `format`: Oxfmt. Os comandos `db:generate`, `db:migrations:list:local` e `db:migrate:local` existem, mas **não foram executados**. O inicializador pode instalar dependências e abrir um servidor: também não foi executado.

Não foram lidos `.env`/`.dev.vars`, nem copiados para o ambiente de teste. A cópia temporária usou configuração sintética de hosting com binding `DB`, sem identificador de publicação, credenciais ou banco real. O build comprova compilação nessa configuração, não publicação nem acesso ao D1 remoto.

## Documentos entregues

1. [Visão geral](01-VISAO-GERAL.md)
2. [Auditoria funcional](02-AUDITORIA-FUNCIONAL.md)
3. [Arquitetura](03-ARQUITETURA.md)
4. [Banco de dados](04-BANCO-DE-DADOS.md)
5. [Segurança e GLPI](05-SEGURANCA-GLPI.md)
6. [Interface e UX](06-INTERFACE-UX.md)
7. [Testes e qualidade](07-TESTES-E-QUALIDADE.md)
8. [Plano priorizado](08-PLANO-DE-REFORMULACAO.md)

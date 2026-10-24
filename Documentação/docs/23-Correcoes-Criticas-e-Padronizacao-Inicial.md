# Etapa 10.2 — Correções críticas e padronização inicial

Execução em 22/10/2026, concluída na madrugada UTC de 23/10. Escopo: V01–V08 da [auditoria visual](21-Auditoria-de-Padronizacao-Visual.md), conforme a [proposta](22-Proposta-de-Padrao-Visual.md). Foram corrigidos o P0 e os sete P1 na interface. Não houve redesign, avanço para P2/P3, alteração de APIs de negócio ou migrations.

## Ambiente, preservação e evidências

Antes das alterações foi preservada uma cópia de 259 arquivos e do build anterior em `C:\Users\yurit\Lastro-backups\etapa10-2-20261023T020632Z`. O manifesto e `project-before.json` identificam a linha de base, incluindo alterações preexistentes. Segredos foram excluídos da cópia de fontes.

O Edge real, em processo separado e modo headless, acessou exclusivamente `http://127.0.0.1:8899`, com perfil próprio e CDP em loopback. O Worker foi compilado em `test-app`, com persistência em `state` nessa pasta de evidências. O banco foi copiado pelo mecanismo de backup SQLite a partir da cópia isolada da Etapa 8; o banco operacional não foi aberto. Autenticação e GLPI usaram os adaptadores simulados da Etapa 8, sem credenciais externas nem chamadas reais. Os cadastros e suas respostas de gravação foram fixtures sintéticas interceptadas pelo CDP. A apresentação de perfil administrador para categorias também foi simulada no navegador, sem modificar usuários ou permissões do servidor.

Todos os seis arquivos do D1 operacional, incluindo WAL, SHM e metadata, conservaram tamanho e SHA-256 da referência da Etapa 7: `operational-preservation.json`. O hash do `.env` permaneceu igual ao manifesto; migrations e arquivos de persistência/autenticação do projeto permaneceram iguais à linha de base. Nenhuma migration foi executada. Não houve commit ou push. O Worker e o Edge exclusivos desta homologação foram encerrados; portas 8899 e 9333 sem listener ao final.

As evidências são privadas, na pasta acima: `screenshots`, `browser-regression-results.json`, `contrast-after.json`, `mobile-hover-results.json`, logs `*-confirmed.log` e scripts CDP. Não são arquivos para publicação, pois a cópia isolada contém informações recuperadas além dos dados sintéticos usados nos cenários.

## Achados tratados

| ID original | Causa confirmada | Correção e arquivos principais | Evidência e resultado |
|---|---|---|---|
| V01 · P1 | O erro era capturado na página e exibido fora do diálogo | `PreservedForm` apresenta erro dentro do formulário; `app/page.tsx` propaga a falha e mantém o tratamento de conflito local | Nos cinco formulários, erro 400 aparece dentro do modal; `browser-regression-results.json` e `after-mobile-form-error-*.png` |
| V02 · P1 | A action React capturava a falha e resolvia, provocando reset do formulário não controlado | `components/preserved-form.tsx` usa submit nativo sem reset; `lib/form-submission.ts` bloqueia concorrência e resultado incerto; `app/page.tsx` classifica falhas e remonta somente ao recarregar explicitamente a versão conflitante | Todos os valores preservados em rota, VLAN, câmera, ponto e categoria após 400; tentativa corrigida tem um único envio mesmo com submit duplo. 503 e falha de rede mantêm rascunho e bloqueiam repetição; edição 409 preserva texto, recarga explícita substitui os campos |
| V03 · P0 | Seletores amplos do tema escuro impunham texto claro sobre fundo rosa | Variantes compartilhadas `Alert`/`AlertStatus` e pares de cores existentes, com escopo `.lastro-feedback` em `app/globals.css`; aplicadas a formulários, login, integração e movimentações | Contraste do erro passou de 1,08:1 para **7,64:1** nos dois temas; `after-operational-error-*.png`, `after-mobile-form-error-dark.png` |
| V04 · P1 | A legenda mantinha foreground escuro no tema escuro | Classe compartilhada `.lastro-form-legend` em `FormSection`, usando a cor de texto secundário já existente | Legenda escura de 1,64:1 para **9,40:1**; clara **10,36:1**; `after-camera-form-*.png` |
| V05 · P1 | Texto branco pequeno sobre o laranja da marca | Variante `brand` do `Button` usa o foreground escuro já existente, mantendo o laranja `#ff6b2c`; CTAs e submit passam a reutilizar a variante | De 2,84:1 para **6,10:1**, nos dois temas; capturas do dashboard e formulário. Ícones, cores principais e navegação preservados |
| V06 · P1 | `html.dark button:hover` sobrepunha o fundo definido pela variante sem ajustar o texto | Removidas as sobrescritas globais de hover; estados voltam às variantes existentes de `Button` | Edge com hover efetivo e pseudoestado forçado: texto escuro sobre fundo claro no botão default escuro, sem retornar ao azul escuro conflitante; `after-forced-hover-*.png` e `mobile-hover-results.json` |
| V07 · P1 | Listas renderizavam vazio antes de concluir a leitura; categoria não tinha estado vazio próprio | `components/collection-state.tsx` compartilha loading, erro com tentativa, vazio e resultados; `app/page.tsx` diferencia estados e ignora resposta de efeito obsoleto | Consulta atrasada não mostra falso vazio; erro de leitura e nova tentativa recuperam a lista no Edge. Vazio real validado pelo teste do componente; `after-collection-loading.png` |
| V08 · P1 | Busca com posição fixa permanecia sobre o conteúdo rolado | `app/page.tsx` posiciona a busca em relação ao main, preservando a área inicial e fazendo o controle acompanhar a rolagem | Nos dois temas, ao rolar até movimentações, limite inferior da busca em −825 px, fora da área visível; dashboard e detalhes em desktop e celular sem essa sobreposição |

### Limite da proteção de envio

Falha de validação confirmada permite corrigir os campos e tentar novamente. Um gate síncrono impede dois envios concorrentes antes da atualização do React. Para criação, erro de rede, HTTP 408/5xx ou resposta de sucesso inválida são tratados como resultado incerto: o formulário mantém os campos e bloqueia reenvio naquela instância, orientando conferir os cadastros. Não existe repetição automática.

Essa proteção de interface **não equivale a idempotência persistente do backend cadastral**: fechar/reabrir ou recarregar a página elimina o gate. Garantia entre recargas, abas e clientes exige um contrato de idempotência na API/persistência, fora desta correção visual; permanece pendente para diagnóstico específico. Não se presume duplicidade nem identidade de cadastro por similaridade de texto. Os controles já existentes de integração GLPI e concorrência por revisão não foram substituídos.

Conflito 409 conserva o rascunho. Somente a ação explícita “Recarregar versão atual (substitui o formulário)” descarta os campos e reabre a versão lida, com foco inicial restaurado. A política geral de descarte de modais, classificada em etapas posteriores, não foi reformulada.

## Arquivos desta etapa

Criados:

- `components/preserved-form.tsx`, `components/collection-state.tsx` e `lib/form-submission.ts`.
- `tests/visual-critical.test.ts`.
- Este documento e `auditoria-2026-10-22/12-Acompanhamento-Etapa-10-2-Correcoes.md`.

Modificados:

- `app/page.tsx`, `app/globals.css`.
- `components/ui/alert.tsx`, `components/ui/button.tsx`.
- `components/auth-provider.tsx`, `components/glpi-test-panel.tsx`.
- `components/tickets-section.tsx`, `components/ticket-operations-panel.tsx`.
- `package.json` para incluir os novos testes na suíte.
- `Documentação/README.md` e o acompanhamento 11, com ligação para o resultado atual sem reescrever o diagnóstico histórico.

A correção de feedback é delimitada por componente; não removeu globalmente a cascata legada do tema. A variante laranja centraliza a combinação já usada na identidade do Lastro, sem substituir ícones ou criar paleta.

## Testes efetivamente realizados

### Edge real

- Reprodução antes da correção: erro fora do modal, reset de campos após 503, contraste de erro/legenda/CTA, hover conflitante e falso vazio durante leitura.
- **28 asserções aprovadas** em `critical-regression.mjs`, com respostas sintéticas: retenção completa e erro interno nos cinco formulários, loading de gravação, tentativa corrigida com um envio, bloqueio após 503, conflito e recarga explícita, loading de coleção, erro e recuperação de leitura.
- Verificação adicional em 390×844 nos dois temas: erro 400 e falha de rede conservam o formulário de câmera; alerta interno; foco continua no diálogo após Tab; falha de rede não repete a requisição. Não houve gravação cadastral real nesses cenários.
- Desktop 1440×1000 e celular 390×844, claro/escuro: dashboard, detalhes/movimentações, feedback de erro, formulários, legibilidade e busca durante rolagem. Hover conferido com ponteiro e pseudoestado forçado do Edge. Login feito com conta sintética no adaptador isolado.
- 24 capturas nesta execução, incluindo antes/depois. As capturas `after-camera-form-*.png`, `after-dashboard-*.png`, `after-operational-error-*.png` e `after-mobile-form-error-*.png` foram comparadas com as evidências anteriores. O nome `after-form-error-light.png` não corresponde ao tema: a imagem é escura; usar o conteúdo e as capturas explicitamente separadas por tema, não esse nome para classificá-la.

As razões de contraste foram calculadas a partir das cores efetivas obtidas no Edge para os elementos indicados. Não constituem certificação de acessibilidade de todas as telas, nem uma medição de todos os estados desabilitados ou combinações de conteúdo. O hover tem evidência de cores e captura próprias; os valores numéricos destacados na tabela são do estado normal.

### Testes automatizados e compilação

| Comando | Resultado |
|---|---|
| `pnpm test` | **193 aprovados, 0 falhas**; 187 existentes e 6 novos |
| `pnpm lint` | Aprovado |
| `pnpm typecheck` | Aprovado |
| `pnpm build` | Aprovado |
| Build da cópia isolada | Aprovado, com adaptadores simulados |

Os seis novos testes cobrem gate concorrente, nova tentativa após validação, bloqueio de resultados incertos, conflito/revisão, estados de coleção e semântica de mensagens. Os testes de componentes utilizam os componentes reais renderizados, e os testes do navegador verificam a manutenção efetiva dos valores no DOM.

A suíte completa também cobre autenticação/autorização, chamados, dashboard, histórico, pendências, passagem de turno, RFO, persistência e integração GLPI simulada. O build mantém o aviso conhecido do Vinext sobre classificação estática de algumas rotas; não é falha de compilação.

### Não homologado novamente no navegador

Não foram repetidas nesta etapa todas as transações de entrega/recebimento de turno, revisões de RFO, encerramento GLPI, permissões reais de administrador ou persistência cadastral após sucesso e recarga: esses fluxos têm cobertura automatizada e evidências anteriores, mas as gravações cadastrais desta rodada foram respostas simuladas do CDP. Sucesso de movimentação operacional não foi novamente produzido no navegador; a variante de sucesso tem teste de componente, e o fluxo de negócio tem a suíte existente. Não se apresenta teste automatizado como homologação visual desses casos.

Não houve teste com GLPI real nem autenticação externa. O bloqueio HTTPS/503 diagnosticado na Etapa 9 depende de endpoint HTTPS e infraestrutura aprovados; não foi contornado. Nenhuma credencial, validação TLS ou configuração operacional foi alterada.

## Pendências

V09–V19 (P2) e V20–V21 (P3) permanecem pendentes. Acompanhamento: [12-Acompanhamento-Etapa-10-2-Correcoes.md](../auditoria-2026-10-22/12-Acompanhamento-Etapa-10-2-Correcoes.md). Permanecem também a idempotência persistente cadastral descrita acima e a dependência externa de HTTPS. Não iniciar a próxima etapa automaticamente.

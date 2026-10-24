# Segurança e integração GLPI

## Escopo e nível de evidência

Revisão estática dos fluxos de autenticação, autorização, dados e GLPI, mais testes selecionados com dependências simuladas. Sem login real, criação de sessão, operação em chamados, varredura de rede ou uso de credenciais. `.env` e `.dev.vars` não foram abertos. Não foi feito scan gerenciado do plugin: o fluxo exige artefatos adicionais, enquanto o pedido limita a criação aos documentos desta auditoria. Este documento não deve ser apresentado como relatório canônico selado do Codex Security.

Não foi demonstrado incidente, exploração ou falha crítica de acesso. Foram identificados mecanismos inseguros condicionais e limitações operacionais. Não foram consultadas fontes externas de vulnerabilidades ou comprovadas configurações efetivas de produção.

## Modelo de confiança

Ativos: credenciais humanas GLPI em trânsito, tokens técnicos, sessão local, inventário de rede, contatos e conteúdo de chamados. Entradas: login não autenticado; API de dados autenticada; abertura/consulta de chamados; respostas externas GLPI; futura importação. Fronteiras: navegador → Worker, Worker → GLPI, Worker → D1 e leitor do repositório → configuração de segredos.

O sistema funciona como área operacional compartilhada. Não foram encontrados tenants, organizações isoladas ou permissões por registro. Não é correto afirmar IDOR entre tenants sem essa política. Confirmar confidencialidade por perfil antes de ampliar o uso.

## Controles efetivos

- Sessão criada com 32 bytes aleatórios; no D1 persiste SHA-256, não o token bruto (`auth-service.ts:13–20`).
- Expiração absoluta de oito horas verificada no SQL; sessão revogada e usuário inativo não autenticam (`db/auth-storage.ts:84`).
- Cookie `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=28800`; `Secure` quando a URL da requisição é HTTPS (`auth-handlers.ts:23`).
- Bootstrap limitado a identidade GLPI allowlisted e singleton, em batch condicionado, sem promoção indiscriminada.
- Login exige JSON, limita corpo a 2 KiB por leitura de stream, valida campos, usa erro público uniforme e limita tentativas.
- Autorizações estão nos route handlers. Ocultar botão não é o único controle.
- Dados usam limite de corpo de 64 KiB, chaves permitidas, validações por tipo e SQL parametrizado.
- Clientes GLPI bloqueiam redirects, possuem timeout e não expõem texto upstream nos erros públicos.
- Sessões GLPI têm tentativa de encerramento; não há retry automático do POST de criação de chamado.
- Conteúdo de chamado é renderizado como texto React, sem HTML bruto nesse fluxo. O uso de `dangerouslySetInnerHTML` encontrado no catálogo de gráficos não é evidência de XSS em chamados.
- `.gitignore` exclui `.env*`, `.dev.vars*`, `.wrangler`, builds e chaves PEM; isso não comprova ausência de segredos em todo histórico.

## Matriz real de acesso

| Endpoint | Acesso mínimo / comportamento |
|---|---|
| `POST /api/auth/login` | Público; valida credencial GLPI e autorização local |
| `GET /api/auth/me` | Sem cookie retorna usuário nulo; com cookie válido consulta sessão e atualiza último acesso |
| `POST /api/auth/logout` | Valida Origin quando enviado; revoga sessão atual e limpa cookie |
| `GET /api/data` | viewer |
| `POST /api/data`, `PUT /api/data` | operator |
| `GET /api/glpi/tickets` | viewer; devolve linhas completas do histórico local, até 100 |
| `POST /api/glpi/tickets` | operator; JSON e Origin quando presente |
| `GET /api/glpi/tickets/:id` | operator; exige ticket conhecido localmente, consulta GLPI e escreve sincronização local |
| `GET /api/glpi/test` | admin; abre/encerra sessão técnica GLPI, sem criar ticket |

Fonte: `services/auth/api-access.ts`, rotas em `app/api`. Admin herda operator e viewer. Não há endpoint administrativo de usuários.

## Achados e riscos calibrados

### SEC01 — Transporte HTTP aceito para credenciais (prioridade alta)

**C:** `glpi-config.ts:21` e `glpi-user-auth.ts:43` aceitam HTTP e HTTPS. `glpi-user-auth.ts:120` envia credenciais humanas em Basic; `glpi-client.ts:29` envia token técnico. O manual de autenticação, seção “Sessão local e cookie”, registra aceitação operacional anterior de GLPI interno por HTTP.

**R:** um observador da rede entre Worker e GLPI pode obter credenciais quando o destino é HTTP; entre navegador e Lastro, HTTP também deixa login e cookie sem proteção de transporte. Não foi aberto `.env`, inspecionado proxy ou contatado GLPI: o uso efetivo hoje e sua topologia permanecem não confirmados. Rede interna não elimina esse risco.

**Medida:** estabelecer HTTPS ponta a ponta, validar o proxy e restringir exceções a desenvolvimento explícito. A prioridade é alta; não há evidência para declarar comprometimento crítico em produção. CWE-319 é aplicável ao cenário HTTP.

### SEC02 — Limite de login por instância (prioridade alta antes de exposição ampla)

**C:** `login-rate-limit.ts:12` mantém Map em memória, cinco tentativas por 15 minutos, no máximo 1024 chaves; sucesso limpa o bucket. `auth-handlers.ts:110` usa `CF-Connecting-IP`, com fallback `unknown`.

**R:** reinício/escala distribuem tentativas entre instâncias; fora de uma borda que reescreva o header, o IP fornecido não é autoridade. Ataque de força bruta depende de alcance do login e políticas GLPI. Fallback pode agrupar usuários legítimos e causar bloqueio coletivo.

**Medida:** limite compartilhado na borda/serviço, combinação cuidadosa de identidade e IP, métricas sem senha ou token; validar confiança do proxy. Não foi feita tentativa de bypass.

### SEC03 — Política de leitura de chamados inconsistente na granularidade (prioridade alta de decisão)

**C:** viewer não pode chamar detalhe, mas `GET /api/glpi/tickets` devolve `LocalTicket` incluindo conteúdo, autoria e chave de operação. `db/ticket-storage.ts:34`, `:132`; UI esconde botão Detalhes para viewer.

**R:** se o propósito do bloqueio de detalhe é impedir ler a descrição, essa política já não é efetiva na listagem. Se todo viewer pode ler todo conteúdo, não existe violação comprovada: a diferença protege apenas sincronização remota.

**Medida:** definir política e DTO de listagem mínimo; testar acesso por campo e endpoint. Não tratar simplesmente ocultação de botão como confidencialidade.

### SEC04 — CSRF com controles distintos entre endpoints (prioridade média)

**C:** dados fazem parse de JSON sem exigir Content-Type JSON nem validar Origin. Login/logout e POST de chamados têm verificação de Origin. Cookie Lax reduz cenários entre sites, mas não oferece a mesma barreira entre origens do mesmo site.

**R:** POST com corpo JSON sob `text/plain` pode ser enviado sem preflight por uma origem atacante; o ataque necessita que o cookie seja enviado, por exemplo em cenário de subdomínio do mesmo site controlado por terceiro. Não foi demonstrada essa condição no deployment. Sem cookie válido, o guard nega acesso.

**Medida:** política uniforme de Origin/Content-Type e, conforme arquitetura, token CSRF ou Fetch Metadata. CWE-352 é hipótese condicionada, não exploração demonstrada.

### SEC05 — Corpo de abertura de chamado sem limite de stream (prioridade média)

**C:** `app/api/glpi/tickets/route.ts:42` usa `request.json()` antes da validação de título/descrição. Exige operator e checks de tipo/origem, mas não tem limite local equivalente ao de dados/login.

**R:** operador autenticado pode enviar JSON grande para consumir recursos; limites externos da plataforma não foram verificados. Trata-se de risco de disponibilidade com ator já privilegiado, sem severidade crítica.

**Medida:** leitor limitado comum e testes de excedente por chunk, mantendo mensagens seguras.

### SEC06 — Ciclo de vida e auditoria incompletos (prioridade alta)

**C:** não há trilha de eventos de login, mudança de perfil, alteração de cadastro com autor/conteúdo anterior ou revogação administrativa global. `last_seen_at`, revisão e `created_by` de chamados são registros parciais. Logout revoga apenas sessão atual. Identidade/perfil local não é sincronizado ao GLPI em cada request.

**R:** investigação de erro/abuso e desligamento de usuário ficam dependentes de intervenção no banco e da expiração. Não há evidência de abuso ocorrido.

**Medida:** administração protegida, revogação global, retenção de sessões e log de auditoria com redaction; não registrar senhas/tokens ou payload completo indiscriminadamente.

## GLPI: confiabilidade e duplicidade

Uma operação com chave única é persistida antes do POST. Falha de rede, timeout, 5xx ou resposta de criação sem ID pode gerar uncertain. Se o GLPI cria, mas a gravação local falha, o workflow tenta registrar incerteza e conservar o ID conhecido; se isso também falhar, a linha pending continua impedindo repetição da mesma chave.

Limites reais: a chave não é comparada com autor/payload ao reutilizar; uma nova chave não é deduplicada por conteúdo; a UI perde a operação ao ser desmontada; não há rotina de reconciliação de pending/uncertain. Em `syncFromGlpi`, UPDATE só atua em `result_state='created'`; consultar um uncertain com ID não o transforma automaticamente em created. Não alterar isso sem regra de confirmação explícita.

O painel administrativo de “teste” pode criar chamado real e informa isso no texto. Nenhum botão dele foi acionado na auditoria. O endpoint de conexão retorna versão hardcoded `9.5.4`; isso não prova a versão GLPI instalada. Confirmar versão não exige revelar destino nem tokens no relatório.

## Dados confidenciais e limites da revisão

As heurísticas de credenciais na API e importação são úteis, mas não impedem todos os formatos de segredo em texto livre. Chamados aceitam descrição sem essa filtragem e podem conter informação confidencial legítima. Definir minimização, acesso, retenção e exportação em vez de prometer que regex evita todo vazamento.

Não foram reproduzidos valores de configuração ou registros pessoais. Não se atesta ausência de credenciais em todo arquivo histórico ou artefato recuperado. Os controles de hospedagem, TLS, cabeçalhos de segurança, backups e permissões da conta técnica GLPI precisam de homologação operacional posterior. Não foi realizada operação externa para inferi-los.

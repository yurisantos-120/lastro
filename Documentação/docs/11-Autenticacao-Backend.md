# Autenticação backend GLPI

## Diagnóstico posterior — Etapa 9

O [diagnóstico HTTPS](20-Diagnostico-e-Preparacao-HTTPS-GLPI.md) confirmou que o 503 da Etapa 8 é produzido pela rejeição da configuração HTTP. A fábrica valida o provedor antes de chamar `currentUser`; por isso até `/api/auth/me` anônimo pode retornar `AUTH_PROVIDER_UNAVAILABLE` quando a configuração é inválida. A porta HTTPS do IP configurado recusou conexão, sem certificado recebido. Credenciais/configuração foram preservadas; o plano depende de endpoint HTTPS oficial e autorização específica para homologação autenticada.

## Escopo

O GLPI autentica a pessoa e fornece a identidade; o Lastro decide se essa identidade está autorizada, qual role local possui e mantém a própria sessão. A autenticação humana usa `Authorization: Basic` em um cliente isolado. O cliente técnico atual, com `GLPI_USER_TOKEN`, permanece separado e continua sendo usado pelas operações de chamados.

Endpoints desta etapa:

- `POST /api/auth/login` recebe somente `username` e `password` em JSON.
- `GET /api/auth/me` devolve o usuário local associado ao cookie, ou `{ "user": null }` sem sessão válida.
- `POST /api/auth/logout` revoga a sessão local e limpa o cookie; não chama o GLPI.

O login exige JSON, rejeita campos extras e limita o corpo a 2 KiB. Senhas não são registradas, persistidas, retornadas ou mantidas na sessão. Como strings JavaScript são imutáveis, a implementação descarta referências após o uso, mas não afirma apagamento físico da memória.

## Identidade e autorização

O login usa `initSession` Basic, lê somente os campos de identidade da sessão GLPI (`glpiID`, `glpiname`, `glpifirstname` e `glpirealname`) e tenta `killSession` antes de criar a sessão Lastro. Não consulta o perfil GLPI: perfil GLPI não define role local. A identidade é vinculada exclusivamente por `glpi_user_id`; nome e username são preenchidos no primeiro vínculo e não são sincronizados automaticamente em logins posteriores. Roles locais (`viewer`, `operator`, `admin`) permanecem independentes.

Usuários GLPI desconhecidos, locais inativos, credenciais inválidas e bootstrap fechado não recebem sessão. A resposta pública para esses casos é uniforme para reduzir enumeração; indisponibilidade/configuração do provedor é reportada como falha temporária sem detalhes internos.

## Bootstrap do primeiro administrador

Por padrão, o bootstrap fica fechado. Para autorizar especificamente uma identidade GLPI como primeira administradora, configure temporariamente `OPUSLOG_BOOTSTRAP_GLPI_USER_ID` com o ID numérico GLPI previamente confirmado. O valor não é um username e não deve ser hardcoded. Se a variável estiver ausente ou inválida, nenhuma conta será promovida.

A criação inicial só ocorre se o ID autenticado corresponder ao allowlist, `auth_bootstrap.id = 1` ainda estiver com `completed_at IS NULL` e não houver usuário local. A marcação de conclusão e a inserção do usuário `admin` são enviadas juntas em um `D1.batch()` transacional; a inserção é condicionada à alteração real do singleton (`changes() = 1`). Uma segunda tentativa não pode repetir o bootstrap. Depois de homologar o primeiro administrador, remova a variável do ambiente. `auth_bootstrap` permanece como registro de uso único mesmo se o administrador for desativado ou removido.

O banco local desta etapa não recebe nenhum usuário real automaticamente. Não execute o bootstrap sem aprovação explícita do ID e sem uma tentativa manual controlada.

## Sessão local e cookie

Após autenticação e autorização, o Lastro gera 32 bytes aleatórios criptográficos e entrega o token apenas no cookie `opuslog_session`. O D1 armazena somente o SHA-256 do token em `sessions.token_hash`; o token puro não é salvo. A sessão tem expiração absoluta de 8 horas. `/api/auth/me` atualiza `last_seen_at`; não há idle timeout nesta fase. Sessões expiradas/revogadas não autenticam. Logout marca `revoked_at` e é idempotente.

Cookie: `HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`, sem `Domain`. `Secure` é incluído automaticamente quando a requisição chega por HTTPS; no ambiente HTTP interno fica desativado para manter o teste local funcional. **Habilite e verifique HTTPS antes de expor o login fora da rede interna.** SameSite e validação de Origin são proteções adicionais, não substitutos de HTTPS.

A [Implementação 5](16-Integracao-e-Reconciliacao-GLPI.md) remove a aceitação de HTTP para GLPI. Ambos os clientes exigem HTTPS nos leitores de configuração e construtores, copiam a configuração validada e rejeitam redirects. Essa regra inclui rede privada e localhost. Destino que ainda use HTTP precisa ter HTTPS preparado antes do login ou das operações de integração. A versão/infraestrutura atualmente instalada não foi consultada. O trecho navegador → Lastro também precisa de HTTPS em homologação/produção; o acesso HTTP de desenvolvimento local não comprova segurança do deployment.

## Limitação de tentativas

O endpoint permite até 5 tentativas por endereço IP em uma janela de 15 minutos. Usa somente `CF-Connecting-IP`, injetado pela borda Cloudflare; não confia em `X-Forwarded-For`. Em execução local sem esse header, as requisições compartilham a chave `unknown`. A resposta limitada inclui `Retry-After` e a janela expira automaticamente.

O contador atual é em memória por isolate/instância e tem limite de 1024 chaves; não é um rate limiter distribuído e pode reiniciar ou variar entre isolates. Antes de disponibilizar publicamente ou operar com múltiplos isolates, configure limitação compartilhada no Cloudflare ou serviço equivalente. Nenhuma tabela/migration de rate limit foi criada nesta etapa.

## Erros e dados sensíveis

Nenhum handler imprime body, senha, Authorization, App-Token ou Session-Token. Credenciais GLPI inválidas e identidades sem autorização compartilham resposta pública; falhas de rede/configuração ficam em categoria temporária sem mensagem do upstream. As APIs devolvem `Cache-Control: no-store`.

## Limitações desta fase

- As rotas existentes de dados e chamados ainda não exigem sessão nem aplicam roles.
- Não há tela de login, auditoria completa ou administração de usuários.
- Não há revogação global de sessões no logout de GLPI; cada login encerra a sessão GLPI usada para validar identidade.
- O cookie não é `Secure` em HTTP; uso externo depende de HTTPS.
- O rate limit em memória é apenas best-effort.

Próximo passo: homologar manualmente o primeiro login com `OPUSLOG_BOOTSTRAP_GLPI_USER_ID` aprovado; em seguida, integrar `/api/auth/me` e logout à interface e proteger rotas com autorização local.

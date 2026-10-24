# Opt-in explícito de HTTP para GLPI

Data: 23/10/2026. O pedido posterior autorizou aceitar a URL HTTP atualmente configurada. A autenticação continua sendo a API oficial do GLPI; a sessão, os perfis e as permissões locais do Lastro não foram substituídos.

## Configuração

`GLPI_BASE_URL` continua aceitando HTTPS por padrão, com a validação TLS normal do runtime. HTTP exige um host IPv4 canônico e exato em uma destas opções mutuamente exclusivas:

- `GLPI_PRIVATE_HTTP_HOST`: mantém a configuração anterior para um IPv4 RFC1918 em rota privada protegida.
- `GLPI_HTTP_HOST`: autoriza explicitamente HTTP para um IPv4 fixado, inclusive público. Deve ser igual ao host de `GLPI_BASE_URL`. Não aceita hostname, portas, curingas, loopback, link-local ou IPv4 ambíguo.

O validador continua recusando URL com usuário/senha embutidos, query, fragmento, barras invertidas ou caminho diferente de `apirest.php`. Os dois clientes GLPI validam a URL na construção, copiam a configuração e não seguem redirects. O usuário e a senha são enviados ao GLPI somente em `initSession`; tokens de sessão ficam no backend. Nenhuma autenticação paralela foi criada.

**Risco aceito nesta configuração:** HTTP público não oferece confidencialidade nem autenticação criptográfica do servidor. A senha Basic, App Token, User Token e Session Token podem ser observados ou alterados no percurso de rede. Fixar o IP impede desvio acidental pela configuração e redirects, mas não elimina esse risco. Também é necessário HTTPS no trecho navegador → Lastro para proteger credenciais humanas fora do computador local. A solução recomendada para operação permanente continua sendo um endpoint HTTPS confiável.

## Ativação local e validação

O `.env` local do projeto recebeu `GLPI_HTTP_HOST` com o mesmo IPv4 já presente em `GLPI_BASE_URL`; o valor não é reproduzido aqui. O Worker local foi recompilado e reiniciado em `127.0.0.1:8787`. O opt-in é exclusivo desse binding local; nenhuma migration ou alteração no D1 foi necessária. Os testes automatizados usam apenas GLPI simulado e credenciais sintéticas. Nenhum login real nem chamada de chamados ao GLPI foi realizado.

- Validação de configuração local, sem rede: leitores de autenticação e do cliente técnico aceitam a URL HTTP somente com o host fixado.
- Autenticação e GLPI simulados: 74 testes aprovados, inclusive URL divergente, ausência do opt-in, credenciais apenas em `initSession`, rejeição de redirects e preservação do fluxo de identidade.
- Suíte completa: 223 testes aprovados; lint, TypeScript e build aprovados.
- Worker reiniciado: `GET /api/auth/me` sem cookie respondeu HTTP 200 com `{"user":null}`.

O login pode continuar retornando `AUTH_PROVIDER_UNAVAILABLE` por conectividade, timeout ou resposta da API GLPI mesmo após a validação da URL passar. A autenticação real e as permissões da conta só podem ser confirmadas em homologação autorizada.

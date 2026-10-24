# Etapa 9 — Diagnóstico e preparação do HTTPS para GLPI

## Resultado

Diagnóstico realizado em **22/10/2026, horário de São Paulo**, sem autenticação real, alteração de configuração ou intervenção na infraestrutura. O 503 da Etapa 8 decorre da **configuração HTTP rejeitada pelo Lastro**, antes de consultar o GLPI. Há um segundo impedimento para simplesmente trocar o esquema: **a conexão TCP à porta 443 do IP configurado foi recusada** a partir deste computador.

Não foi recebido certificado desse destino. Portanto, **não foi demonstrado erro de certificado**, e não seria correto atribuir o 503 a certificado vencido, hostname incorreto ou CA desconhecida. Tampouco foi demonstrada inexistência de HTTPS em toda a infraestrutura: pode haver outro FQDN, porta ou gateway oficial ainda não informado.

HTTPS obrigatório, validação TLS e bloqueio de redirects permanecem intactos. Nenhuma configuração, credencial, usuário, sessão ou dado operacional foi modificado. Não houve commit, push, mudança de infraestrutura ou início de outra etapa.

## Configuração efetiva identificada

Foram lidos o relatório da [Etapa 8](19-Homologacao-Visual-e-Funcional.md), os capítulos de [autenticação](11-Autenticacao-Backend.md), [configuração GLPI](09-Integracao-GLPI.md) e [reconciliação](16-Integracao-e-Reconciliacao-GLPI.md), os clientes e handlers atuais e o acompanhamento da auditoria.

| Item | Estado encontrado |
|---|---|
| Projeto | `C:\Users\yurit\meus projetos\lastro` |
| Origem das variáveis no preview | `.env` da raiz, passado por caminho absoluto em `scripts/start-worker.mjs` |
| Alternativa `.dev.vars` | Ausente; não há dois arquivos locais concorrentes |
| Protocolo / destino / porta | `http` / `[IP público omitido]` / `80` |
| Caminho da API | `/glpi/apirest.php` |
| API configurada | `v1` |
| App Token / User Token | Presentes; valores não impressos, transmitidos ou copiados para a sonda |
| Timeout de leitura/autenticação | `10000` ms |
| Timeout de escrita | Padrão do código, `20000` ms |
| Variáveis GLPI no config compilado | Nenhuma sobreposição em `vars` |
| Variáveis GLPI no processo da sessão | Nenhuma |
| Proxy por variáveis de ambiente | Nenhum `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY` ou `NO_PROXY` encontrado |
| Proxy/PAC do usuário Windows | Sem configuração encontrada nos indicadores consultados |
| Exceções TLS por ambiente | Nenhum `NODE_TLS_REJECT_UNAUTHORIZED` ou `NODE_EXTRA_CA_CERTS` presente |

O aplicativo usa `env` de `cloudflare:workers`. No desenvolvimento Vite, o carregamento depende do plugin; no preview documentado, o launcher fornece explicitamente o arquivo. Não existe motivo para editar tokens ou ativar bootstrap para corrigir esse erro.

## Caminho causal do 503

1. A rota de sessão solicita `getAuthService()`.
2. A fábrica constrói o provedor com `readGlpiUserAuthConfig(env)` antes de executar `currentUser()`.
3. O leitor rejeita `GLPI_BASE_URL` com protocolo HTTP e lança falha `configuration`.
4. A fábrica a converte em `AUTH_PROVIDER_UNAVAILABLE`, apresentado como HTTP 503.

Isso explica por que a consulta **anônima**, sem cookie, já falha: embora `currentUser(null)` pudesse retornar nulo, o provedor precisa ser construído primeiro. Não houve tentativa de autenticação remota para chegar a esse resultado. O 503 é gerado pelo Lastro; não é uma resposta HTTP 503 recebida do GLPI.

A validação técnica de chamados também recusa a mesma configuração com `GLPI_CONFIG_ERROR`. Um teste offline com os valores efetivos, sem chamada de rede, confirmou as duas recusas. Alterar somente o protocolo **em um objeto temporário na memória**, sem editar `.env`, fez ambos os leitores aceitarem a estrutura da configuração. Isso isola o protocolo como problema de validação atual; **não aprova o endpoint HTTPS nem comprova a validade dos tokens**.

## Sondagens efetivamente realizadas

Todas as sondagens foram limitadas ao destino configurado, sem enumeração de redes ou portas alternativas. Não foram enviados `Authorization`, `App-Token`, `Session-Token`, cookies ou corpos de autenticação.

| Verificação | Resultado | Interpretação |
|---|---|---|
| TCP ao IP configurado, porta 80 | Conectou | Alcançabilidade TCP; não comprova API ou identidade do servidor. Não foi feita requisição HTTP com credenciais |
| TCP ao mesmo IP, porta 443 | `ECONNREFUSED` | Ausência de acesso a um listener nesse caminho, ou rejeição por rede/NAT/firewall; não identifica qual equipamento recusou |
| TLS ao mesmo IP:443, validação obrigatória | `ECONNREFUSED` | Falha anterior à negociação/certificado |
| DNS reverso do IP | `ENOTFOUND` | Não forneceu FQDN; PTR ausente não comprova ausência de DNS direto ou gateway |
| Referências de endpoint nos documentos locais | Nenhum hostname operacional alternativo encontrado | Não houve descoberta de alternativa pronta pelo material disponível |
| `hosts` local, entradas relacionadas ao GLPI/IP | Nenhuma encontrada | Sem alias local evidenciado |
| Fetch HTTPS do Workerd local para o mesmo destino | Falhou, sem resposta HTTPS | Reproduz a indisponibilidade no runtime efetivamente utilizado |
| Fetch HTTPS de controle para `developers.cloudflare.com` | HTTP 200 | O Worker isolado consegue ao menos essa saída HTTPS com validação padrão; não prova acesso ou confiança ao GLPI |

A sonda Workerd executou um **HEAD anônimo**, sem redirects, na URL HTTPS correspondente à API configurada; a falha ocorreu antes de obter resposta. Não chamou `initSession`, `getFullSession`, `killSession`, endpoints de tickets ou testes autenticados. A conexão de controle também foi HEAD anônimo.

O Worker da sonda possuía configuração própria, **sem binding D1 e sem segredos**, em `127.0.0.1:8909`, com `--local`. Foi encerrado ao terminar. O runtime operacional não foi iniciado nesta etapa. Nenhuma verificação TLS foi desativada, inclusive para tentar extrair certificado.

O usuário confirmou que **não tem conhecimento de endereço HTTPS oficial nem de proxy corporativo aprovado** e orientou continuar sem presumir sua existência. Isso não comprova inexistência desses recursos; o inventário precisa ser confirmado pela equipe de infraestrutura. Nenhum nome, porta alternativa ou gateway foi presumido, e essa resposta não autoriza alteração de serviços ou uso de credenciais reais.

## Separação dos problemas

| Categoria | Conclusão |
|---|---|
| Configuração Lastro | **Comprovada:** URL HTTP incompatível com os leitores atuais |
| Conectividade HTTPS no destino atual | **Comprovada nesta origem/instante:** TCP 443 recusado |
| Certificado, SAN, expiração, emissor e cadeia | **Não verificáveis no destino atual:** nenhum certificado recebido |
| HTTPS nativo ou gateway em outro endereço | **Desconhecido:** depende de inventário/URL oficial da equipe responsável |
| Credenciais, App Token, perfis e API habilitada | **Não testados:** nenhuma autenticação realizada |
| D1 / migrations como causa desse 503 | Sem evidência nesse caminho: a recusa de configuração ocorre antes da consulta de sessão |

## Menor solução segura proposta

**Caminho de preparação com as informações atuais:** solicitar primeiro o inventário e a viabilidade de HTTPS no servidor/webserver do GLPI à equipe responsável. Não há endpoint HTTPS aprovado disponível para configurar no Lastro. As opções abaixo são condicionais, não recursos presumidamente existentes.

**Reutilizar um endpoint HTTPS oficial**, somente se a equipe comprovar sua existência e o percurso protegido até o GLPI. Depois de validar DNS, TLS e API sem credenciais, a menor mudança no Lastro seria apenas atualizar `GLPI_BASE_URL` em procedimento autorizado, mantendo `/glpi/apirest.php` ou o caminho oficial equivalente terminado em `/apirest.php`. Não é necessário redesenhar autenticação ou relaxar o cliente.

**Se não existir endpoint:** solicitar à equipe do GLPI HTTPS no servidor/webserver existente, com FQDN e certificado apropriados. Essa é a preparação recomendada a partir da evidência disponível; a etapa atual não instala certificado, abre porta, altera virtual host, DNS, NAT ou firewall.

**Gateway/proxy corporativo:** alternativa quando já houver infraestrutura adequada ou necessidade de fronteira de confiança. Deve oferecer HTTPS validado ao Lastro e proteger/validar também o trecho até o GLPI. Um proxy HTTPS que encaminhe as credenciais humanas pelo HTTP atual através da rede **não atende ao requisito**. Não se propõe HTTP como fallback, nem mesmo por ser uma rede privada.

### Quadro de decisão para habilitação

| Opção | O que precisa ser confirmado | Trabalho futuro da equipe |
|---|---|---|
| HTTPS no webserver atual | Quem administra o servidor, software/versão, suporte TLS, virtual hosts, porta disponível e impacto no acesso atual | Planejar certificado, FQDN, listener TLS e rota/NAT/firewall; testar em homologação antes de qualquer ativação |
| Endpoint HTTPS existente | URL oficial e proprietário, identidade/cadeia do certificado, API final e proteção de todos os trechos | Validar ou ajustar o endpoint sob autorização; só depois preparar a mudança de URL do Lastro |
| Novo gateway com HTTPS nos dois trechos | Justificativa para componente adicional, ambiente disponível, dono, certificado de entrada e HTTPS verificável no GLPI | Projetar encaminhamento e confiança do upstream, sem cache/retry indevido ou exposição de segredos; implantar apenas em mudança autorizada |

Sem retorno da equipe, não é possível escolher certificado, emitir configuração final de servidor, afirmar qual firewall precisa de alteração ou aprovar uma URL candidata. A recusa TCP observada não identifica sozinha se a causa é o webserver, NAT ou um filtro de rede.

### Informações a solicitar, sem segredos

1. Quem administra o GLPI, seu webserver, DNS, certificados e rede? Há ambiente separado de homologação?
2. Existe algum FQDN/porta HTTPS oficial? Se não, é possível habilitar TLS no webserver atual, preservando o serviço existente durante a mudança?
3. Qual FQDN deve constar no certificado, qual CA será utilizada e quem será responsável por renovação e entrega da cadeia completa?
4. Qual será a origem de execução do Lastro e o percurso de rede até o GLPI? Onde existem NAT, firewall ou terminação TLS nesse percurso?
5. O caminho REST continuará `/glpi/apirest.php`? Há SSO, redirects, filtros de headers, cache ou retries que possam afetar a API?
6. Qual janela, responsável, validação sem credenciais e procedimento de retorno serão aprovados para a infraestrutura?

Não solicitar senha, token, chave privada ou cópia de configuração contendo segredos como resposta a esse levantamento.

### Critérios técnicos para a preparação

- Informar FQDN oficial, porta, caminho REST, responsável técnico e se o destino é homologação ou operação. Confirmar o mapa completo Lastro → gateway, quando houver → GLPI.
- Certificado válido para o nome utilizado, período válido e cadeia intermediária completa, com âncora confiável no **fetch do Workerd** do ambiente de destino. Um IP literal exige identidade válida para o IP; conhecer um nome por PTR não prova que ele seja o nome autorizado do serviço.
- Não assumir que instalar uma CA no Windows/Edge ou configurar o processo Node fará o fetch do Workerd confiar nela. Validar no runtime real. Preferir certificado já confiável para esse runtime; CA corporativa exige comprovar o mecanismo de confiança compatível, sem bypass.
- Garantir DNS e rota/porta liberada da origem efetiva. O sucesso deste computador não comprova conectividade de um eventual Worker remoto; VPN/PAC do navegador não cria conectividade automaticamente para o Worker.
- Servir a API diretamente por HTTPS, sem redirecionar para HTTP, login HTML/SSO, outra URL ou barra final. Os clientes recusam 3xx; configurar a URL final correta, em vez de habilitar seguimento de redirects.
- Preservar `Authorization` Basic da autenticação humana, `Authorization: user_token` das operações técnicas, `App-Token`, `Session-Token`, métodos, corpo JSON e subcaminhos de `apirest.php`. Uma camada Basic adicional que consuma o mesmo header conflita com os clientes existentes e não é uma troca transparente de URL.
- Desabilitar cache de respostas autenticadas e não registrar headers, senhas, tokens ou corpos de login em logs/APM. Não introduzir retries transparentes de autenticação ou escritas GLPI, nem repetir POST/PUT após timeout.
- Usar política TLS aprovada e testar SNI/hostname/cadeia. Em NGINX com upstream HTTPS, verificação e SNI precisam ser configurados explicitamente; a documentação registra `proxy_ssl_verify` e `proxy_ssl_server_name` desligados por padrão. A equipe deve configurar CA/nome corretos e não apenas trocar o esquema do `proxy_pass`. [Referência oficial NGINX](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_ssl_verify).

A identidade do servidor e sua cadeia de confiança são verificações distintas. Uma conexão TCP estabelecida ou um certificado com nome conhecido não basta. A [documentação TLS do Node](https://nodejs.org/api/tls.html#tlscheckserveridentityhostname-cert) descreve a checagem de identidade utilizada na sonda Node; a aprovação final deve ocorrer também no [fetch do runtime Workers](https://developers.cloudflare.com/workers/runtime-apis/fetch/), que é a interface usada pelo Lastro.

## Riscos e decisões pendentes

- Trocar `http` por `https` agora não resolve a recusa de 443; mantém o serviço indisponível.
- Certificado emitido para outro hostname, cadeia incompleta, CA não confiável ou expiração serão impedimentos adicionais possíveis, **ainda não observados** no destino atual.
- Um gateway amplia a fronteira que processa credenciais e exige política de logs, confiança no upstream e compatibilidade de headers; escolher somente se necessário.
- Redirect de SSO ou autenticação extra pode tornar um HTTPS válido incompatível com a API clássica.
- Não há evidência de comprometimento ou de validade/invalidade de credenciais. Esta etapa não justifica alterar usuários, tokens ou bootstrap.
- O trecho navegador → Lastro também deve usar HTTPS antes de qualquer futura homologação com credenciais humanas reais. HTTP de desenvolvimento local com dados sintéticos não homologa esse transporte.

## Plano de homologação controlada — não executado nesta etapa

1. **Inventário e autorização:** equipe fornece endpoint oficial e confirmação de homologação, certificado/CA, rota e eventuais proxies. Aprovar uma janela e responsáveis. Manter o D1 recuperado fora dos testes de escrita.
2. **Sem credenciais:** repetir DNS, TCP, TLS estrito/SNI e HEAD ou GET anônimo na URL final da API. Registrar protocolo, nome/SAN, validade, cadeia, confiança no Node e no Workerd e status sem corpo sensível. Uma recusa de autenticação pode ser esperada, mas página HTML, redirect ou TCP aberto sozinhos não comprovam API correta.
3. **Ambiente isolado:** utilizar cópia descartável do D1 e configuração própria, sem importar secrets operacionais. Testar com GLPI/sessões sintéticos; confirmar manutenção das recusas de HTTP, redirect e certificados inválidos. Preparar a alteração mínima de URL, sem aplicá-la ao ambiente operacional.
4. **Autenticação real somente com nova autorização específica:** em GLPI de homologação e Lastro servido por HTTPS, usar conta de teste aprovada, bootstrap fechado e D1 isolado. Validar `initSession`, identidade e encerramento da sessão GLPI; depois cookie `HttpOnly`/`Secure`, papel local, `/auth/me` e logout. Limitar tentativas e respeitar o rate limiter. Essa fase cria sessões e **não está autorizada pela presente entrega**.
5. **Integração:** começar por leituras autorizadas em registros conhecidos da homologação. Qualquer criação, alteração, solução ou encerramento requer autorização própria e chamados exclusivamente de teste; não se presume essa permissão a partir da validação do transporte.
6. **Critério de aprovação:** nenhum bypass TLS; nenhum hop de rede HTTP com credenciais; endpoint final sem redirects; confiança comprovada no runtime; identidade e autorização corretas; logs sem segredos; D1 operacional preservado; respostas incertas sem retry automático.
7. **Falha/retorno:** interromper, guardar diagnóstico sanitizado e encerrar somente recursos de teste próprios. A equipe desfaz mudanças de infraestrutura apenas por seu procedimento. No Lastro, retirar a configuração candidata ou restaurar configuração anterior mediante autorização, mantendo HTTP bloqueado e indisponibilidade explícita. Nunca recuperar disponibilidade relaxando TLS/HTTPS.

## Testes, preservação e evidências

Foram executados **54 testes de autenticação e integração**, todos aprovados:

```powershell
node --experimental-strip-types --test tests/auth.test.ts tests/glpi-integration.test.ts
```

Esses testes usam simulação; não comprovam TLS do servidor GLPI. Não houve mudança de código executável nesta etapa. Não se repetiram suíte completa, lint, TypeScript e build, já aprovados na Etapa 8, porque a entrega altera somente documentação e o diagnóstico não introduziu código no projeto.

Evidências privadas em:

```text
C:\Users\yurit\Lastro-backups\etapa9-20261023T010632Z
```

O nome do diretório usa UTC; a data local da execução é 22/10. Contém `configuration.json` sanitizado, `configuration-validation.json`, `network-initial.json`, `worker-probe-result.json`, sonda isolada, `transport-auth-tests.log`, inventário Git e `preservation.json`. Não contém cópia de `.env` ou tokens. A pasta tem ACL restrita ao usuário e SYSTEM.

O hash de `.env` permaneceu igual. Os seis arquivos do D1 operacional, incluindo WAL/SHM e metadados, coincidem integralmente com os hashes finais da Etapa 7/8. O banco não foi aberto via SQLite/D1 nem vinculado ao Worker de diagnóstico. Runtime da sonda encerrado, sem recuperação necessária.

Arquivos do projeto alterados: este relatório; índice; referências nos capítulos 09 e 11; [acompanhamento da auditoria da Etapa 9](../auditoria-2026-10-22/10-Acompanhamento-Etapa-9-HTTPS.md). Configurações, código, testes, migrations, journal, usuários e credenciais foram preservados.

**Próxima decisão externa necessária:** confirmar com a equipe GLPI/rede se há HTTPS oficial existente; na ausência dele, preparar HTTPS no servidor sob autorização própria. Nenhuma dessas intervenções foi iniciada automaticamente.

## Atualização posterior — ajuste do transporte

O diagnóstico acima registra a política e o ambiente observados na Etapa 9. O [ajuste posterior](29-Ajuste-Transporte-Autenticacao-GLPI.md) preparou uma configuração explícita para um IP privado RFC1918 fixado **somente após comprovação de rota protegida**. O IP público HTTP conhecido continua bloqueado; nenhuma configuração operacional ou infraestrutura foi alterada.

# Compatibilidade do login GLPI com a configuração HTTP atual

> Registro histórico do bloqueio anterior. O [opt-in HTTP posterior](32-Opt-in-HTTP-GLPI.md) altera o comportamento descrito abaixo mediante configuração explícita.

Data: 23/10/2026. Resultado: a configuração efetiva ainda aponta para GLPI v1 por **HTTP em IP não privado**, sem destino privado fixado. O login é recusado pelo Lastro durante a validação da URL, antes de qualquer chamada à API GLPI. Não foi realizado login real nem enviado usuário, senha ou token. A URL completa e os segredos não estão reproduzidos neste documento.

## Fluxo e bloqueio

`services/auth/auth-runtime.ts` fornece o cliente GLPI oficial somente na tentativa de login; `services/auth/auth-service.ts` usa a identidade retornada pelo GLPI para consultar a autorização local e criar a sessão. A consulta `GET /api/auth/me` é independente do GLPI e pode apresentar a tela de login enquanto o provedor externo permanece indisponível. Não existe autenticação paralela.

`services/glpi/glpi-user-auth.ts` chama `glpiTransportUrl()` em `services/glpi/glpi-url.ts`. O validador aceita HTTPS com as verificações normais de certificado do runtime. HTTP só pode ser configurado para um **IP RFC1918 exato fixado** em `GLPI_PRIVATE_HTTP_HOST`, após aprovação de um percurso privado e criptografado. Um IP público por HTTP é sempre rejeitado. Os clientes também recusam redirects e revalidam a URL ao serem construídos. O login atual retorna `AUTH_PROVIDER_UNAVAILABLE`, com diagnóstico interno `glpi_config / GLPI_CONFIG_ERROR`. Esse erro é produzido antes do `fetch`; não é uma resposta do GLPI.

As regras de sessão local, papéis, permissões, tratamento de erros e proteção de credenciais permanecem intactas. O destino privado configurável já foi preparado na [etapa anterior](29-Ajuste-Transporte-Autenticacao-GLPI.md), mas não está ativo nem atestado para o ambiente atual. Fixar um endereço privado, isoladamente, não demonstra proteção do percurso nem autoriza transmitir credenciais reais.

## O que falta para o login real

1. A equipe responsável deve identificar um endpoint GLPI HTTPS aprovado, com hostname, certificado e cadeia válidos, ou comprovar um percurso privado protegido e criptografado compatível com o runtime.
2. A configuração deve ser alterada em procedimento autorizado somente após validações sem credenciais. A URL pública HTTP atual não deve ser habilitada por exceção.
3. Homologar autenticação GLPI com conta de teste autorizada em ambiente adequado; validar identidade GLPI, permissões locais, sessão, logout e indisponibilidade de rede. A existência da rota não comprova essas etapas.

Nenhuma mudança segura apenas no código permite autenticar contra o **HTTP público atual** mantendo a regra de não expor credenciais. Portanto, esta investigação **não altera código de autenticação ou proteções de transporte**. Não houve mudança em `.env`, usuários, D1, migrations ou infraestrutura.

## Validação desta investigação

- Suíte automatizada: **222 testes aprovados**, zero falhas. Inclui login GLPI simulado, bloqueio de HTTP público, aceitação condicional de IP privado fixado, sessões e autorização.
- Lint e TypeScript: aprovados.
- Build: aprovado em cópia sem `.env` e sem D1, usando configuração de hospedagem sintética. O build direto na pasta em uso falhou porque o runtime local mantinha `dist` bloqueado (`EPERM`); o runtime permaneceu ativo durante a validação isolada. O aviso já conhecido de classificação estática de rotas Vinext permanece.
- Nenhum `POST /api/auth/login` foi realizado nesta investigação. Não houve chamada real ao GLPI, acesso ao D1 remoto, migrations, commit ou push.

# Ajuste do transporte da autenticação GLPI

Data: 23/10/2026. A autenticação corporativa continua usando o GLPI (`initSession`, `getFullSession`, `killSession`) e a sessão local existente. Não foi criada autenticação alternativa, nem foram alterados usuários, credenciais, banco ou migrations.

## Regra implementada

`GLPI_BASE_URL` continua exigindo HTTPS por padrão. Como preparação para uma **rota privada protegida futura**, o servidor pode receber `GLPI_PRIVATE_HTTP_HOST` com o endereço IPv4 privado **exato** usado na URL HTTP. O valor precisa ser um endereço canônico RFC1918 (`10/8`, `172.16/12` ou `192.168/16`); hostnames, IPs públicos, loopback, link-local, IPv6 e formas ambíguas são recusados. A opção não está configurada no ambiente operacional.

Exemplo apenas de sintaxe, **não um destino homologado**:

```text
GLPI_BASE_URL=http://10.42.0.8:8080/glpi/apirest.php
GLPI_PRIVATE_HTTP_HOST=10.42.0.8
```

O host fixado evita que uma mudança acidental de URL desvie credenciais para outro destino HTTP. Mesmo com essa opção, o IP público HTTP atual continua bloqueado. HTTPS mantém a validação TLS padrão, sem desativação de certificados. URLs com usuário/senha, query, fragmento, caminho de API incorreto ou barras invertidas são recusadas. Os clientes validam de novo a URL ao ser construídos diretamente e não seguem redirects, inclusive quando o destino sugere downgrade ou IP público.

**Pré-condição externa:** endereço privado não comprova, sozinho, proteção da rota. A equipe responsável deve confirmar o percurso Lastro → GLPI, isolamento/controle de acesso, **criptografia do percurso que carrega credenciais (por exemplo, um túnel/VPN aprovado)**, ausência de exposição pública ou vazamento de credenciais em outros saltos, e a viabilidade dessa rota no runtime Cloudflare/Workerd. A configuração não detecta nem atesta essas propriedades da rede. Não se deve configurar `GLPI_PRIVATE_HTTP_HOST` nem transmitir credenciais reais antes dessa confirmação e de homologação autorizada. O trecho navegador → Lastro também requer HTTPS para credenciais humanas reais. A alternativa preferida continua ser HTTPS final validado, conforme o [diagnóstico da Etapa 9](20-Diagnostico-e-Preparacao-HTTPS-GLPI.md).

## Arquivos alterados

- `services/glpi/glpi-url.ts`: validação compartilhada de HTTPS ou HTTP privado fixado.
- `services/glpi/glpi-config.ts`, `services/glpi/glpi-user-auth.ts`: leitores de configuração para cliente técnico e login humano.
- `services/glpi/glpi-client.ts`, `services/glpi/types.ts`: nova validação também nos clientes construídos diretamente.
- `.env.example`: variável opcional, sem valor operacional.
- `tests/glpi-integration.test.ts`: testes de destino privado, recusa de público/ambíguo e redirects, com fetch simulado.
- Este documento e o índice da documentação.

Não houve alteração de `AuthService`, cookie, papéis locais, autorização, proteção de senhas, tratamento de erros ou fluxo de chamados. Configurações `.env`/`.dev.vars` operacionais permaneceram intactas.

## Verificação

Testes selecionados de autenticação e integração: 71 aprovados. Suíte completa: 220 aprovados, zero falhas. Lint e TypeScript aprovados; build aprovado. Todos os testes GLPI usaram respostas sintéticas, sem chamadas reais. O D1 operacional não foi aberto para escrita nem recebeu migrations. Não houve commit ou push.

O 503 do login atual permanece enquanto o ambiente conhecido apontar ao IP **público HTTP**. A configuração futura privada não é ativada automaticamente e não é uma confirmação de infraestrutura. Revisar a rota e homologar com a equipe responsável antes de qualquer uso de credenciais reais.

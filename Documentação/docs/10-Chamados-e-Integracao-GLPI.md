# Chamados e integração GLPI

## Fluxo

```text
Tela Chamados -> API interna do Lastro -> TicketWorkflow
    -> D1 (pending) -> API REST GLPI -> D1 (resultado) -> histórico local
```

O React nunca chama o GLPI diretamente. Credenciais permanecem no backend via bindings/variáveis GLPI já documentadas em [09-Integracao-GLPI.md](09-Integracao-GLPI.md). A autenticação GLPI continua sendo técnica; ela não identifica analistas do Lastro.

## API interna

- `GET /api/glpi/tickets`: lista até 100 registros locais, sem chamar o GLPI.
- `POST /api/glpi/tickets`: valida título, descrição e uma chave de operação UUID v4; registra `pending` no D1 antes do POST GLPI.
- `GET /api/glpi/tickets/:glpiId`: exige um vínculo local pelo ID GLPI, consulta o GLPI uma vez e atualiza título, conteúdo, status, data de criação e `last_synced_at`.
- `GET /api/glpi/test`: permanece como teste técnico de conexão e não cria ticket.

Os tickets são enviados usando o payload simples já adotado pela integração V1: `input.name` e `input.content`. Não há campos de rota, trecho ou modelo nesta etapa.

## Estados e idempotência

`result_state` pode ser `pending`, `created`, `failed` ou `uncertain`. Uma chave de operação local única evita que a mesma requisição repita um POST GLPI. Quando o resultado externo é incerto (timeout, erro de rede, HTTP 5xx, resposta inválida ou ausência de ID), o histórico registra `uncertain`; o sistema não repete automaticamente o POST. O operador deve verificar no GLPI antes de iniciar outra tentativa.

Erros definitivos de validação/autenticação/permissão ficam como `failed`. Uma nova tentativa exige uma nova chave de operação e ação explícita.

O status numérico vem do GLPI e só é atualizado quando alguém abre os detalhes ou pressiona **Atualizar status**. Não existe polling em segundo plano. Se a atualização falhar, o sistema conserva e exibe o último dado local.

## Tabela local `tickets`

`id` é o identificador local. `glpi_ticket_id` é único e pode ficar nulo enquanto o resultado está pendente/incerto/falhou. `operation_key` é única para impedir reenvio da mesma operação. O conteúdo do chamado é mantido localmente para compor o histórico; `status`, `glpi_created_at` e `last_synced_at` refletem a última consulta confirmada.

`created_by` é nullable e fica `NULL` até existir identidade Lastro. Nenhum usuário técnico do GLPI ou usuário fictício será gravado como autor. Futuramente, a camada de autenticação deverá fornecer o ID do usuário ao serviço de aplicação que cria a linha local, no momento de montar a operação pendente. A identidade não deve vir do corpo enviado pelo navegador.

## Migração e banco

A migration aditiva `0004_noisy_rictor.sql` cria a tabela e índices, sem alterar as tabelas operacionais existentes. Ela deve ser aplicada explicitamente em cada ambiente após conferir o destino e o histórico. Não há migration automática no startup. O D1 remoto não é configurado nem alterado por este fluxo.

## Painel técnico

O painel **Integração GLPI — teste inicial** foi mantido recolhido no fim da seção Chamados. Seu botão de teste de conexão não cria ticket. O botão de criação de teste usa o mesmo endpoint operacional e, portanto, também persiste o resultado no histórico.

## Limitação de acesso

O Lastro ainda não possui autenticação própria. Enquanto essa etapa não for implementada, a aplicação e estes endpoints precisam permanecer restritos à rede/ambiente confiável. A validação de `Origin` é apenas uma proteção complementar de navegador, nunca autenticação nem autorização.

## Homologação

Os testes automatizados usam D1/SQLite em memória e serviços GLPI simulados; não criam tickets reais. A homologação GLPI real não foi executada nesta etapa porque o ambiente fornecido não foi identificado como ambiente de teste autorizado. Antes de liberar o fluxo operacional, deve-se confirmar destino e autorização, testar conexão e então criar somente um ticket de teste identificado, consultar seu ID e verificar a persistência local.

Comandos de validação:

```powershell
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
```

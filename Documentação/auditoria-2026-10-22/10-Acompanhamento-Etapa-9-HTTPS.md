# Acompanhamento da auditoria — Etapa 9 / HTTPS GLPI

Atualização de 22/10/2026. Detalhamento e plano em [20-Diagnostico-e-Preparacao-HTTPS-GLPI.md](../docs/20-Diagnostico-e-Preparacao-HTTPS-GLPI.md).

| Pendência | Evidência / estado |
|---|---|
| SEC01 — exigência HTTPS nos clientes | Mantida, sem exceção, alteração de guard ou desativação TLS |
| 503 da Etapa 8 | Causa comprovada: leitor rejeita URL HTTP antes de autenticar; fábrica converte para `AUTH_PROVIDER_UNAVAILABLE` |
| HTTPS no destino configurado | TCP 443 recusado; falha também no fetch de um Workerd local sem D1/segredos |
| Certificados / hostname / cadeia | Não verificáveis no destino atual; não houve negociação TLS nem certificado recebido. Não classificar como erro de certificado demonstrado |
| Alternativa corporativa | Usuário não conhece HTTPS oficial ou proxy aprovado; nenhuma alternativa foi identificada no material disponível. Inventário depende da equipe, sem presumir existência ou inexistência desses recursos |
| Conectividade do runtime | HTTPS de controle retornou 200; isso não comprova acesso nem confiança ao GLPI |
| Solução preparada | Solicitar inventário e viabilidade de TLS no webserver GLPI. Reutilização de endpoint é condicional à confirmação; gateway é opção adicional, com HTTPS validado também no upstream. Relatório inclui quadro de decisão e perguntas à infraestrutura |
| Homologação real | Pendente e não autorizada nesta entrega; requer endpoint validado, ambiente HTTPS, conta de teste aprovada e D1 isolado |

54 testes selecionados passaram com simulação. `.env` e seis arquivos do D1 operacional permanecem com hashes idênticos. Sem login real, uso de tokens, alteração de serviços, migration, commit ou push. Achados anteriores de UX e administração não foram reclassificados por este diagnóstico.

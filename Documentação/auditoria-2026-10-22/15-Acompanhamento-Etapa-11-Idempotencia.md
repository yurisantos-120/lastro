# Acompanhamento — Etapa 11: idempotência cadastral

Data: 23/10/2026. Relatório completo: [26 — Confiabilidade e idempotência cadastral](../docs/26-Confiabilidade-e-Idempotencia-Cadastral.md).

| Referência | Diagnóstico e tratamento | Estado |
|---|---|---|
| A06 — gravação seguida de leitura completa | A resposta de POST/PUT passa a depender de recibo transacional persistente, sem `readAll()` depois da escrita. Falha na atualização da lista não desfaz nem oculta a confirmação. Teste automatizado e falha de leitura reproduzida no Edge. | Corrigido no novo caminho cadastral; ativação da 0012 pendente |
| P04 — contrato da gravação cadastral | Chave UUID por intenção, sessão no servidor, hash normalizado, reserva durável, escrita/recibo atômicos, recuperação e revisão preservada. | Implementado e validado isoladamente; demais itens do plano não são encerrados por associação |
| UX01/UX04 — feedback e rascunhos | Resultado desconhecido congela intenção; recarga e outra aba recuperam rascunho; confirmação e falha de leitura são distintas. | Complemento funcional validado; correções visuais anteriores preservadas |
| Pendência das etapas 10.2–10.4: idempotência entre abas/recargas | Outbox durável e ledger substituem dependência exclusiva do bloqueio em memória. Duas abas reais concorrentes e perda de resposta confirmadas no Edge. | Resolvida na implementação isolada, pendente de ativação autorizada |

219 testes aprovados; lint, TypeScript e build aprovados. Edge real: 28 verificações aprovadas. Migration nova `0012_data_operations.sql`, snapshot e journal; nenhuma migration anterior alterada ou aplicada ao operacional. SQLite isolado íntegro, sem violações de FK.

Evidências em `C:\Users\yurit\Lastro-backups\etapa11-20261023T113803Z`, especialmente `final/*results.json`, `final/screenshots`, logs `*-confirmed.log` e `preservation-result.json`. Seis hashes do D1 operacional e `.env` inalterados. Alterações preexistentes preservadas. Não houve GLPI real, D1 remoto, commit ou push.

Continuam pendentes: ativação autorizada da 0012, HTTPS/infraestrutura GLPI e homologação real, política futura de retenção de intenções/recibos. Não houve reabertura automática dos achados visuais V01–V21 nem nova auditoria visual integral; esta etapa valida as mudanças cadastrais descritas no relatório. Nenhuma próxima etapa iniciada.

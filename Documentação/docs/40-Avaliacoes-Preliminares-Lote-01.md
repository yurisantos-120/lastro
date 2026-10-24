# Etapa 15.3 — consolidação das avaliações preliminares do Lote 01

Consolidação preparada em **24/10/2026**. A data em que o responsável fez cada avaliação e sua identidade nominal não foram informadas; este documento **não atribui data retroativa, assinatura ou aprovação formal**. As declarações abaixo foram fornecidas para a revisão, sem conferência integral das planilhas originais.

Base de referência: [preparação e procedência](37-Preparacao-Dados-Tecnicos-e-Procedencia.md), [organização da revisão humana](38-Revisao-Humana-Dados-Tecnicos.md) e [quatro fichas do Lote 01](39-Fichas-Iniciais-de-Revisao-de-Dados.md). O [modelo original de decisões](../evidencias-etapa-15-3/modelo-decisoes-lote-01.csv) permanece **em branco nos campos de decisão, aprovador, data, justificativa e evidência**.

## Registro separado das declarações

O [artefato de avaliações preliminares](../evidencias-etapa-15-3/avaliacoes-preliminares-lote-01.csv) vincula cada ficha ao localizador F10, aba `Página1`, e registra somente os três atributos comunicados: unidade da velocidade, município e situação do serviço. `conferencia_integral_original=NAO` e `importacao_liberada=NAO` em todas as linhas. Não contém valor numérico da velocidade, endereço, IP, contato, credencial, identidade do responsável ou decisão formal.

| Ficha e localizador | Unidade **informada** | Município **informado** | Situação **informada** | Estado da revisão |
|---|---|---|---|---|
| `REV-F10-A1-L7` / F10-A1-L7 | Mbps | Santa Maria de Jetibá | Ativo | Preliminar; importação bloqueada |
| `REV-F10-A1-L13` / F10-A1-L13 | Mbps | Santa Maria de Jetibá | Ativo | Preliminar; importação bloqueada |
| `REV-F10-A1-L36` / F10-A1-L36 | Mbps | Santa Maria de Jetibá | Ativo | Preliminar; importação bloqueada |
| `REV-F10-A1-L48` / F10-A1-L48 | Mbps | Santa Maria de Jetibá | Ativo | Preliminar; importação bloqueada |

**Interpretação:** o responsável declarou que a unidade pretendida é Mbps, que os quatro pontos pertencem a Santa Maria de Jetibá e que seus serviços estão ativos. Isso **não confirma o valor numérico de nenhuma velocidade**, nem substitui a verificação do município e da vigência no original. A categoria `point` não foi criada ou aprovada. A classificação sanitizada `incompativel_com_api`, com a pendência `speed_unit_missing_or_ambiguous:speed`, continua preservada até nova extração/revalidação documentada. O fato de o rascunho passar na validação de forma da API não libera a importação.

## Conferências necessárias antes de uma aprovação definitiva

Para **cada um dos quatro localizadores**, o responsável autorizado ainda deve registrar evidência da fonte e decidir explicitamente:

1. **Identidade:** ponto, identificador técnico e se representa um serviço único ou outro período/serviço do mesmo local.
2. **Endereço e parceiro:** confirmar os campos obrigatórios no arquivo original e sua atualidade; não completar por semelhança com outra linha.
3. **Velocidade:** ler o valor numérico original, confirmar que a unidade declarada **Mbps** se aplica àquele valor e registrar correção na fonte ou em prévia sanitizada versionada. Não anexar o valor sensível a este relatório.
4. **Situação do serviço:** verificar evidência operacional de `Ativo`, data/período de vigência e eventual mudança desde a planilha. A declaração isolada não prova o estado atual.
5. **Município e categoria:** confrontar endereço e fonte com Santa Maria de Jetibá; obter decisão formal sobre a taxonomia `point` e sua categoria, ainda ausente no D1.
6. **Duplicidades:** repetir o cruzamento com planilhas e cadastros locais após eventuais correções. A ausência de grupo `dup-*`/`conf-*` no conjunto de 08/10 não prova unicidade definitiva.
7. **Contrato e segurança:** executar validação completa com categoria aprovada e política de importação alinhada à API; revisar campos excluídos/sensíveis sem transportar credenciais para cadastro comum; ensaiar rastreabilidade e idempotência somente em banco isolado.

Até a conclusão desses critérios, as quatro linhas continuam **bloqueadas para importação**, mesmo que uma ou mais declarações venham a ser confirmadas separadamente. Qualquer decisão definitiva deve ser registrada por aprovador identificado, data real, justificativa e localizadores afetados no processo restrito de revisão; esta consolidação não preenche esses campos em seu nome.

## Procedência mantida separada

- **Candidatos das planilhas:** as quatro fichas referem-se a linhas de F10. Sua avaliação preliminar não as transforma em registros locais nem confirma integralmente a procedência/validade técnica.
- **Origem de demonstração confirmada:** três categorias e cinco informações locais continuam identificadas pelo seed histórico. Origem de demonstração não prova falsidade técnica nem autoriza exclusão. A informação local `5` permanece vinculada ao chamado local `4`.
- **Origem local desconhecida:** quatro categorias e duas informações conservam `ORIGEM_DESCONHECIDA`.
- **Dados sintéticos de testes:** continuam restritos às bases isoladas usadas em etapas anteriores; não fazem parte destas quatro avaliações nem dos 14 cadastros operacionais recuperados.

## Verificação desta consolidação

Os quatro IDs e localizadores foram conferidos com as fichas e a fila priorizada. O modelo formal continua com quatro linhas e seus cinco campos de decisão/identidade/evidência vazios; nenhuma aprovação foi inferida das declarações. O novo artefato registra apenas os três atributos informados, marca a ausência de conferência integral e mantém o bloqueio. Esta etapa documental não executou testes de aplicação, lint ou build, pois não alterou código.

Não houve modificação do D1 operacional, de planilhas originais, dos 14 cadastros locais ou de seus vínculos com chamados. Não houve migration, importação, exclusão, criação de categoria, operação real no GLPI, alteração de autenticação/credenciais, commit ou push. O Lote 02 não foi iniciado.

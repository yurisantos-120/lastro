# Auditoria funcional

Data: 22/10/2026. Evidências do código recuperado; não houve execução de fluxos contra o ambiente operacional. C = comprovado; R = risco; S = sugestão. “Não encontrado” refere-se ao repositório atual inspecionado, não a versões anteriores à formatação.

## 1. Dashboard

**Disponível e funcionamento:** cinco contadores (rotas, VLANs, câmeras, pontos e categorias), navegação por cartões e oito atualizações recentes. Tudo é calculado no cliente depois de carregar `/api/data`.

**Dependências:** `app/page.tsx:176`, `:329`, `:409`; `db/storage.ts:15`; AuthProvider e sessão local válida.

**Problemas:** C: não há estado próprio de carregamento dos dados na página; os arrays começam vazios, produzindo contadores zerados e lista vazia antes da resposta. C: “Hoje” é calculado como últimas 24 horas no SQL, não dia civil local (`db/storage.ts:20`). R: ler toda a base aumenta tempo inicial e pode tornar o dashboard lento.

**Incompleto:** não representa disponibilidade, incidentes, topologia nem qualidade cadastral; são possíveis evoluções, não promessas já implementadas.

**Melhoria e impacto:** separar estado vazio/carregamento/erro e trazer timestamps ISO. Depois, endpoint de resumo. Mudanças na consulta afetam todos os contadores e listas; preservar os tipos de registro e a ordenação de recentes.

## 2. Rotas e trechos de fibra

**Disponível e funcionamento:** registros `kind='general'`, apresentados como “Rota”, com título, categoria, responsável, validação/designação, contato e observações; consulta e edição em modal. Título e responsável obrigatórios.

**Dependências:** `app/page.tsx:52`, `:254`, `:455`; validação em `app/api/data/validation.ts:150`; persistência em `db/persistence.ts:28` e `:51`.

**Problemas:** C: inexiste entidade de trecho de fibra, porta, emenda, terminação, origem/destino ou encadeamento topológico no esquema. R: descrever tudo em texto dificulta verificar continuidade e impacto de falha.

**Incompleto:** operação por trecho, vínculos com equipamentos/pontos e abertura de chamado contextual não existem. Não confundir o cadastro textual atual com sistema de inventário óptico.

**Melhoria e impacto:** primeiro levantar exemplos reais e requisitos de rotas/trechos; só depois propor entidades aditivas e migração assistida dos textos. Impacta pesquisa, detalhes, formulários, importação e possíveis modelos de chamados. Preservar os registros gerais enquanto a taxonomia não estiver aprovada.

## 3. VLANs

**Disponível e funcionamento:** criação/edição por número e bairro, categoria do escopo VLAN, título derivado `VLAN N — Bairro`. Backend limita o número a 1–4094.

**Dependências:** `app/page.tsx:254`, `:460`; `app/api/data/validation.ts:20`, `:106`; `information.details_json`.

**Problemas:** C: não há unicidade de VLAN por domínio/localidade no banco. Isso só é um defeito de negócio se a política exigir unicidade; VLAN pode legitimamente se repetir em redes distintas. C: o formulário não explicita o intervalo como validação HTML equivalente à API.

**Incompleto:** domínio de rede, trunk, equipamento/porta e relação real com câmeras/pontos.

**Melhoria e impacto:** definir a chave de negócio antes de deduplicar ou criar índice. Introduzir referência por ID apenas quando o domínio estiver claro. Afeta registros já importados/manuais e referências textuais de câmeras.

## 4. Câmeras

**Disponível e funcionamento:** identificação principal/alternativa, serial, bairro, endereço, referência, geolocalização, OLT, sinal, IP da câmera/túnel, EOIP, ONU, VLAN, MAC e descrição. Há agrupamentos visuais. Backend valida IPv4, MAC e VLAN.

**Dependências:** `app/page.tsx:461`; `db/data-types.ts:4`; validação de detalhes por tipo e categorias do escopo câmera.

**Problemas:** C: ONU, OLT e VLAN são strings, sem FK; a interface avisa isso. C: geolocalização é texto, sem validação de coordenadas. C: `signal` tem validação diferente de `opticalSignal` de pontos. R: atribuições divergentes e referências desatualizadas.

**Incompleto:** mapas, relacionamento estrutural, status de monitoramento e visualização de vídeo. Estes não foram identificados como capacidades atuais.

**Melhoria e impacto:** preservar os campos técnicos existentes, explicitar formatos/unidades e evoluir referências quando houver cadastro dos equipamentos. Contratos de detalhes devem ser versionados para preservar JSON legado e importação.

## 5. Pontos de atendimento

**Disponível e funcionamento:** local, parceiro, provedor, endereço, velocidade, IP, DHCP interno, ONU/modelo/identificador, OLT, MAC, porta, datas, sinal óptico e técnico. Local/parceiro/endereço obrigatórios; MAC normalizado, datas e sinal óptico validados.

**Dependências:** `app/page.tsx:473`; `app/api/data/validation.ts:27`, `:106`; categoria do escopo ponto.

**Problemas:** C: `details.ip` não passa pelo validador IPv4 aplicado a `ipAddress` e `tunnelIp`; aceita texto arbitrário no limite definido. C: velocidade, DHCP e porta são texto sem contrato estruturado. R: campo “Data” e “Data de ativação” podem produzir interpretações distintas sem definição operacional.

**Incompleto:** vínculos a rotas, equipamentos e contratos/SLA; não há cadastro independente de parceiros.

**Melhoria e impacto:** definir IP único versus CIDR/faixa/IPv6, unidade de velocidade e significado das datas antes de restringir dados. Auditar compatibilidade dos valores existentes sem corrigi-los nesta etapa. Afeta API, UI e importação.

## 6. Categorias

**Disponível e funcionamento:** nome, descrição, cor hexadecimal e escopo; cartões com quantidade de vínculos. Criação e edição por operator/admin. Banco impede, pela lógica de update, mudar o escopo quando há registros incompatíveis; edições exigem revisão atual.

**Dependências:** `app/page.tsx:296`, `:416`, `:493`; `db/persistence.ts:39`; `validation.ts:89`.

**Problemas:** C: categorias representam conceitos diferentes por tipo (subtipo, região, responsável, empresa). C: cartões não possuem navegação de consulta por categoria. C: nomes não têm unicidade definida. R: sobrecarga semântica dificulta integração futura.

**Incompleto:** exclusão/arquivamento e manutenção de taxonomias independentes. Não há DELETE na API de dados.

**Melhoria e impacto:** manter os escopos e resolver filtro/navegação antes de separar entidades. Caso parceiros ou regiões se tornem entidades, preservar relação com categorias antigas e testar o bloqueio de escopo.

## 7. Pesquisa

**Disponível e funcionamento:** busca local por substring, sem distinção de caixa, em título, responsável, validação, contato, notas, categoria e valores de detalhes. Ao digitar, a página troca para a área Pesquisa; a consulta permanece ao mudar para módulos.

**Dependências:** `app/page.tsx:315`, `:392`; carga integral de dados em memória.

**Problemas:** C: sem paginação, filtros estruturados, normalização de acentos, destaque ou URL compartilhável. C: pesquisa não inclui histórico de chamados; categorias isoladas também não são retornadas como resultados próprios. R: procurar categoria com `find` para cada registro aumenta custo; relevância depende apenas de ocorrência literal.

**Incompleto:** pesquisa por domínio técnico, por origem importada ou por trechos vinculados.

**Melhoria e impacto:** apresentar escopo da busca e preservar consulta/filtros na URL; evoluir busca no servidor conforme volume medido. Mudança afeta dashboard, listas e atalhos; evitar alterar silenciosamente a semântica dos resultados.

## 8. Autenticação e perfis

**Disponível e funcionamento:** login com credenciais humanas GLPI; backend valida identidade, encerra sessão GLPI e autoriza usuário local por `glpi_user_id`. Primeiro admin depende de allowlist explícita e bootstrap único. Sessão local aleatória de oito horas, hash no banco; logout revoga a sessão atual. Perfis viewer/operator/admin são locais.

**Dependências:** AuthProvider, `services/auth/*`, `services/glpi/glpi-user-auth.ts`, `db/auth-storage.ts`, migrations de autenticação e configuração do provedor.

**Problemas:** C: falta UI/API administrativa para provisionar, inativar e alterar perfis após bootstrap; não é possível gerenciar equipe apenas pela interface. C: o rate limit é local ao processo. C: nomes/perfis não são sincronizados a cada login; a documentação indica decisão explícita. R: uma conta desativada somente no GLPI pode manter sessão local até a expiração se não for inativada localmente.

**Incompleto:** revogação global, trilha de administração e política de retenção das sessões.

**Melhoria e impacto:** estabelecer política de ciclo de vida e tela administrativa protegida antes de ampliar equipe. Não vincular role local automaticamente a perfil GLPI. Qualquer mudança de cookie ou normalização afeta sessões existentes.

## 9. GLPI e chamados

**Disponível e funcionamento:** listagem local dos últimos 100 chamados; operator/admin abre chamado com título e descrição. A chave UUID reserva operação no D1 antes do POST remoto. Estados pending/created/failed/uncertain preservam ambiguidade; repetição da mesma chave não repete POST. Detalhe consulta apenas ID já existente localmente, sincroniza título/conteúdo/status e mantém cache local se GLPI falhar. Admin tem painel de teste de conexão e criação real de teste.

**Dependências:** `components/tickets-section.tsx`, `components/glpi-test-panel.tsx`, `app/api/glpi/*`, workflow, repositório D1 e credencial técnica GLPI independente do login humano.

**Problemas:** C: modelos são placeholder (`tickets-section.tsx:175`). C: versão retornada no diagnóstico é constante `9.5.4`, não descoberta no servidor. C: lista não oferece paginação além do limite 100. C: viewer recebe conteúdo completo na listagem, embora detalhe esteja reservado a operator; esclarecer a intenção da política. C: chave não compara payload/autor ao reutilizar operação. C: um pending persistido após interrupção não tem fluxo de reconciliação concluído.

**Riscos:** nova chave criada ao sair/remontar o formulário pode duplicar uma operação cujo resultado anterior foi incerto; a garantia é por chave, não por conteúdo. Requisições concorrentes de detalhes não são canceladas/associadas à seleção, podendo exibir resposta atrasada. Não foi feita reprodução no GLPI.

**Incompleto:** modelos, abertura vinculada a rota, campos dinâmicos, anexos, reconciliação de estados incertos, atualização/fechamento remoto e listagem de chamados externos ao Lastro.

**Melhoria e impacto:** priorizar reconciliação e persistência de operação em andamento antes dos modelos. Preservar a regra de nunca repetir automaticamente POST incerto. Mudanças afetam estado local, autoria, histórico e volume de chamadas ao GLPI.

## 10. Importação e rastreabilidade

**Disponível e funcionamento:** biblioteca `db/import-storage.ts` com lotes, hashes SHA-256, arquivo/aba/linha de origem, fingerprint, resultados rejeitado/ignorado/inserido, contadores e batch transacional. Origem única é identificada por arquivo lógico + aba + linha; retornos incluem diferença de hash/fingerprint.

**Dependências:** migration `0007`, tabelas operacionais e execução D1 com semântica de batch/`changes()`/`last_insert_rowid()`.

**Problemas:** C: não há rota, upload, parser de planilha, comando de importação ou tela que invoque essa biblioteca; as referências estão na biblioteca e nos testes. C: tabelas ausentes no snapshot recuperado. C: validação de importação é menos estrita que a API manual, não exige detalhes obrigatórios por tipo. C: mesma posição de origem continua bloqueada mesmo se o conteúdo mudar; esse comportamento é documentado por teste, exigindo revisão explícita do chamador.

**Riscos:** um futuro chamador ignorar `fingerprintMatches`/`sourceFileHashMatches`; finalização calcular status a partir de contadores lidos antes de concorrência; metadados e textos contêm potencial informação sensível apesar das heurísticas. A biblioteca não está exposta atualmente por endpoint.

**Incompleto:** prévia, mapeamento de colunas, saneamento, revisão de divergências, autorização, acompanhamento e consulta de origem na UI.

**Melhoria e impacto:** especificar pipeline e contrato único de validação; não iniciar importação só porque existe o módulo de storage. Preservar unicidade e atomicidade; definir reimportação corrigida e versionamento da identidade da fonte.

## 11. Modais, formulários e operações

**Disponível e funcionamento:** modal nativo `dialog.showModal()`, Escape, fechamento pelo fundo, captura/restauração de foco e Tab contido. Formulários por tipo e edição com revisão; conflito 409 mantém aviso e oferece recarregar versão atual.

**Dependências:** `app/page.tsx:79–174`, `:188–313`, `:425–434`, `:455–514` (intervalos apenas para localização humana).

**Problemas:** C: erros gerais de salvamento ficam no banner da página, fora do dialog modal, enquanto só o 409 é mostrado dentro dele. C: não há estado explícito de envio nos formulários cadastrais equivalente ao `pending` de chamados. C: o botão global “Novo cadastro” em início/pesquisa/categorias/chamados no desktop cai no tipo rota por padrão. C: fechar/cancelar não verifica alterações não salvas.

**Riscos:** feedback inacessível atrás do modal; nova tentativa após salvamento seguido de falha de releitura duplicar criação; cancelamento durante envio produzir feedback ambíguo. Não foram reproduzidos cliques duplicados em navegador.

**Incompleto:** sucesso explícito para cadastro/edição, erro por campo, confirmação de descarte e seleção clara do tipo a criar.

**Melhoria e impacto:** separar ações de formulário, estado de envio e mensagens locais; manter semântica de foco e revisão otimista. Antes de extrair componentes, registrar cenários de criação, falha de validação, 409, cancelamento e sessão expirada em ambiente sintético.

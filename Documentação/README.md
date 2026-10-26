# Documentação — Lastro

Este diretório contém o manual técnico e operacional do sistema desenvolvido pela Eidos.

## Ordem recomendada de leitura

1. [Visão geral](docs/01-Visao-Geral.md)
2. [Como executar no VS Code](docs/02-Como-Rodar-no-VSCode.md)
3. [Arquitetura](docs/03-Arquitetura.md)
4. [Banco de dados e persistência](docs/04-Banco-e-Persistencia.md)
5. [Roadmap](docs/05-Roadmap.md)
6. [Operação e publicação](docs/06-Operacao-e-Publicacao.md)
7. [Lições aprendidas](docs/07-Licoes-Aprendidas.md)
8. [Glossário](docs/08-Glossario.md)
9. [Integração inicial GLPI](docs/09-Integracao-GLPI.md)
10. [Chamados e integração GLPI](docs/10-Chamados-e-Integracao-GLPI.md)
11. [Autenticação backend GLPI](docs/11-Autenticacao-Backend.md)
12. [Chamados operacionais](docs/12-Chamados-Operacionais.md)
13. [Dashboard operacional](docs/13-Dashboard-Operacional.md)
14. [Passagem de turno](docs/14-Passagem-de-Turno.md)
15. [Registro de RFO](docs/15-Registro-de-RFO.md)
16. [Integração e reconciliação GLPI](docs/16-Integracao-e-Reconciliacao-GLPI.md)
17. [Preparação segura do banco para homologação](docs/17-Preparacao-Segura-do-Banco.md)
18. [Ativação controlada do banco local](docs/18-Ativacao-Controlada-Banco-Local.md)
19. [Homologação visual e funcional](docs/19-Homologacao-Visual-e-Funcional.md)
20. [Diagnóstico e preparação do HTTPS para GLPI](docs/20-Diagnostico-e-Preparacao-HTTPS-GLPI.md)
21. [Auditoria de padronização visual](docs/21-Auditoria-de-Padronizacao-Visual.md)
22. [Proposta de padrão visual e plano incremental](docs/22-Proposta-de-Padrao-Visual.md)
23. [Correções críticas e padronização inicial](docs/23-Correcoes-Criticas-e-Padronizacao-Inicial.md)
24. [Padronização dos componentes e refinamentos](docs/24-Padronizacao-de-Componentes-e-Refinamentos.md)
25. [Conclusão da padronização visual](docs/25-Conclusao-da-Padronizacao-Visual.md)
26. [Confiabilidade e idempotência cadastral](docs/26-Confiabilidade-e-Idempotencia-Cadastral.md)
27. [Ativação local controlada da migration 0012](docs/27-Ativacao-Local-Controlada-0012.md)
28. [Auditoria geral consolidada](docs/28-Auditoria-Geral-Consolidada.md)
29. [Ajuste do transporte da autenticação GLPI](docs/29-Ajuste-Transporte-Autenticacao-GLPI.md)
30. [Correção de AUTH_PROVIDER_UNAVAILABLE na consulta de sessão](docs/30-Correcao-Auth-Provider-Unavailable.md)
31. [Compatibilidade do login GLPI com HTTP](docs/31-Compatibilidade-GLPI-HTTP.md)
32. [Opt-in explícito de HTTP para GLPI](docs/32-Opt-in-HTTP-GLPI.md)
33. [Correção de DDL durante consultas](docs/33-Correcao-DDL-Durante-Consultas.md)
34. [Paginação e consultas cadastrais](docs/34-Paginacao-e-Consultas-Cadastrais.md)
35. [Estabilização de testes intermitentes](docs/35-Estabilizacao-de-Testes-Intermitentes.md)
36. [Revisão arquitetural pontual](docs/36-Revisao-Arquitetural-Pontual.md)
37. [Preparação dos dados técnicos e procedência](docs/37-Preparacao-Dados-Tecnicos-e-Procedencia.md)
38. [Preparação da revisão humana dos dados técnicos](docs/38-Revisao-Humana-Dados-Tecnicos.md)
39. [Fichas iniciais e modelo de decisões de dados](docs/39-Fichas-Iniciais-de-Revisao-de-Dados.md)
40. [Avaliações preliminares do Lote 01](docs/40-Avaliacoes-Preliminares-Lote-01.md)
41. [Conferência técnica do Lote 01](docs/41-Conferencia-Tecnica-Lote-01.md)
42. [Resolução pendente das divergências do Lote 01](docs/42-Resolucao-Divergencias-Lote-01.md)
43. [Decisões D01–D04 e organização dos pontos atendidos](docs/43-Decisoes-D01-D04-e-Organizacao-de-Pontos.md)
44. [Organização multidimensional dos pontos atendidos](docs/44-Organizacao-Multidimensional-Pontos.md)
45. [Prontidão para ativação controlada da migration 0013](docs/45-Prontidao-Ativacao-Controlada-0013.md)
46. [Ativação controlada da migration 0013](docs/46-Ativacao-Controlada-0013.md)
47. [Política de padronização das dimensões de pontos](docs/47-Politica-de-Padronizacao-das-Dimensoes-de-Pontos.md)
48. [Governança das dimensões de pontos](docs/48-Governanca-das-Dimensoes-de-Pontos.md)
49. [Implementação inicial da governança das dimensões](docs/49-Implementacao-Inicial-Governanca-Dimensoes.md)

## Resumo para começar

No terminal integrado do VS Code:

```powershell
pnpm install
pnpm dev
```

Depois, acesse `http://localhost:3000`. Também é possível executar a tarefa **Lastro: iniciar desenvolvimento** pelo menu **Terminal > Run Task**.

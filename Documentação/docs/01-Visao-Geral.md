# 1. Visão geral

## Objetivo

Lastro é uma central de conhecimento operacional. Ele reúne informações que precisam ser encontradas rapidamente durante análises e incidentes, como trechos, responsáveis, contatos, designações, validações e observações.

## Funcionalidades atuais

- Painel com indicadores e atualizações recentes.
- Pesquisa textual por título, categoria, responsável, validação, contato e observações.
- Cadastro e edição de informações.
- Cadastros específicos de VLANs, câmeras e pontos atendidos.
- Categorias separadas por finalidade: região de VLAN, responsável da câmera, empresa/cliente do ponto ou informação geral.
- Cadastro e edição de categorias.
- Descrição detalhada da finalidade de cada categoria.
- Alternância entre tema claro e escuro.
- Navegação responsiva para celulares e tablets, com barra inferior no celular e formulários adaptados ao toque.
- Persistência de categorias e informações em banco D1/SQLite.
- Dados iniciais de demonstração baseados na planilha de referência.

## Entidades principais

### Categoria

Define como uma informação é agrupada. Possui nome, descrição e cor de identificação.

### Informação

É um registro operacional vinculado a uma categoria. Possui título/trecho, responsável, validação ou designação, contato, observações e data de atualização.

### VLAN

Registra o número da VLAN e o bairro. Sua categoria representa a região, como Linhares ou Região Serrana.

### Câmera

Registra câmera, bairro, endereço, referência, geolocalização, OLT, descrição, sinal e serial number. Sua categoria indica quem é responsável.

### Ponto

Registra local, endereço, velocidade, data, parceiro e IP. Sua categoria indica a empresa ou cliente atendido.

## Limites atuais

- Não há autenticação nem perfis de usuário.
- Não há exclusão de informações ou categorias pela interface.
- Não há histórico de versões/auditoria das alterações.
- A busca é executada no navegador sobre os registros carregados.

# Módulo 10: Aplicativo Mobile para Operação em Campo

## 1. Propósito

O Módulo Mobile é a interface de linha de frente para operadores de campo, agrônomos e gerentes. Seu objetivo é permitir o registro de dados em tempo real (ou offline com sincronização posterior) diretamente do campo, eliminando a necessidade de anotações em papel e a redigitação de dados.

Este documento descreve as principais funcionalidades do aplicativo e quais endpoints da API do backend ele deve consumir.

## 2. Funcionalidades e Endpoints da API

### Caso de Uso 1: Visualizar Tarefas do Dia/Semana
Um operador de campo precisa ver quais atividades estão planejadas para ele.

*   **Ação no App:** Tela "Minhas Tarefas".
*   **API a ser consumida:**
    *   `GET /api/operations/planejamentos/safra/{safraId}`: Para listar todos os planejamentos de uma safra. O app pode filtrar por data ou status ('Planejado', 'Em Andamento').

### Caso de Uso 2: Registrar uma Atividade de Campo
Um operador concluiu a pulverização de um talhão e precisa registrar a atividade.

*   **Ação no App:** Abrir uma tarefa planejada, preencher os detalhes e marcar como "Concluída".
*   **API a ser consumida:**
    *   `POST /api/operations/atividades`: Para registrar a nova atividade.
    *   **Corpo da Requisição (Exemplo):**
        ```json
        {
          "planejamentoId": "ID_DO_PLANEJAMENTO_DA_TAREFA",
          "tipoAtividade": "Pulverização",
          "data": "2024-10-28T10:00:00Z",
          "detalhes": {
            "insumos": [
              { "insumoId": "ID_DO_HERBICIDA", "quantidade": 150, "unidade": "L" }
            ],
            "maquinario": ["ID_DO_PULVERIZADOR"],
            "observacoes": "Aplicação realizada com sucesso, vento calmo."
          }
        }
        ```
    *   **Lógica do App:** Ao registrar uma atividade de "Plantio" ou "Colheita", o status do planejamento associado será atualizado automaticamente pelo backend.

### Caso de Uso 3: Registrar um Abastecimento
Um operador abastece um trator.

*   **Ação no App:** Tela "Abastecimento", onde o operador seleciona a máquina, informa a quantidade de litros e o hodômetro.
*   **API a ser consumida:**
    *   `POST /api/machinery/abastecimentos`
    *   **Corpo da Requisição (Exemplo):**
        ```json
        {
          "maquinarioId": "ID_DO_TRATOR",
          "data": "2024-10-28T11:30:00Z",
          "litros": 300,
          "hodometro": 1560
        }
        ```

### Caso de Uso 4: Consultar Estoque de Insumo
Antes de iniciar uma atividade, o operador verifica se há insumo suficiente no estoque.

*   **Ação no App:** Tela "Consultar Estoque", busca por um insumo.
*   **API a ser consumida:**
    *   `GET /api/inventory/estoque/{insumoId}`: Para ver a quantidade atual.
    *   `GET /api/inventory/insumos`: Para listar todos os insumos disponíveis para busca.

## 3. Considerações sobre Funcionamento Offline

O aplicativo móvel **DEVE** ser construído com capacidade offline. A estratégia recomendada é:
1.  **Cache Local:** O app deve baixar e armazenar localmente (usando SQLite, WatermelonDB, Realm, etc.) os dados essenciais, como planejamentos, catálogo de insumos e maquinário.
2.  **Fila de Sincronização:** Todas as ações que modificam dados (`POST`) devem ser adicionadas a uma fila local.
3.  **Sincronização:** Quando o dispositivo estiver online, o app deve processar a fila, enviando as requisições para a API do backend. É crucial tratar possíveis falhas e garantir a consistência dos dados.

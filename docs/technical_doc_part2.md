# Evolução Módulo Aéreo - Parte 2: Geração de Ordem de Serviço (OS)

## Resumo Técnico

Esta documentação resume as implementações realizadas na Parte 2 do projeto, focada na Geração de Ordens de Serviço (OS) para a instalação de armadilhas.

### 1. Arquitetura

A solução adota uma abordagem cliente-servidor para garantir a integridade e a atomicidade das operações críticas.

*   **Backend (Node.js - `backend/server.js`)**:
    *   **`POST /api/os/generate`**: Um novo endpoint transacional foi criado para a geração de OS. Ele executa as seguintes ações atomicamente:
        1.  Obtém um número sequencial único para a nova OS a partir da coleção `osCounters`.
        2.  Cria o novo documento na coleção `instalacaoOrdensDeServico`.
        3.  Atualiza o status de todos os `instalacaoPontos` selecionados de "Planejado" para "Em OS", vinculando-os à OS recém-criada.
        *   Esta abordagem previne condições de corrida e garante que um ponto não possa ser atribuído a múltiplas OSs.
    *   **`GET /api/os/list`**: Endpoint simples para listar todas as OSs associadas a um `planejamentoId` específico.

*   **Frontend (Javascript - `docs/app.js`)**:
    *   A tela "Planejamento de Instalação" foi reestruturada para uma navegação de duas etapas:
        1.  **Visão de Lista (`#planejamento-list-view`)**: Exibe todos os planejamentos existentes.
        2.  **Visão de Detalhe (`#planejamento-detail-view`)**: Ao selecionar um planejamento, o usuário é direcionado para esta tela, que contém duas seções:
            *   Uma lista de "Pontos Disponíveis" para a geração de novas OSs.
            *   Uma lista das "Ordens de Serviço Geradas" para aquele planejamento.
    *   Um novo modal (`#gerarOSModal`) foi criado para capturar os detalhes da nova OS (nome, responsável, data, etc.) antes de enviá-los ao backend.
    *   As chamadas para o backend são feitas através de uma função `_fetchWithAuth` que anexa o token de autenticação do Firebase, garantindo que as requisições sejam seguras.

### 2. Estrutura de Dados (Firestore)

Duas novas coleções foram adicionadas, conforme especificado nos requisitos, para suportar a funcionalidade de OS sem impactar as coleções existentes.

*   **`instalacaoOrdensDeServico`**: Armazena os documentos de cada OS gerada, contendo metadados (número da OS, nome, responsável) e uma lista dos IDs dos pontos (`pontos`) incluídos.
*   **`osCounters`**: Coleção utilizada pelo backend para gerar números de OS sequenciais e únicos de forma transacional e segura. O acesso do cliente (frontend) a esta coleção é bloqueado por regras de segurança (`firestore.rules`).

### 3. Abordagem Offline

A geração de uma Ordem de Serviço é uma operação complexa que modifica múltiplos documentos em uma única transação no servidor. Implementar uma lógica de enfileiramento (queue) offline para esta ação sem um mecanismo robusto de resolução de conflitos (escopo da Parte 3) seria arriscado e poderia levar a inconsistências de dados (ex: o mesmo ponto ser atribuído a duas OSs diferentes).

*   **Solução Implementada**: Para garantir a segurança dos dados, a geração de OS foi designada como uma **operação online-only**.
*   Uma verificação `navigator.onLine` foi adicionada ao fluxo de geração. Se o usuário estiver offline, uma mensagem de alerta (`"A geração de Ordens de Serviço requer uma conexão com a internet."`) é exibida, e a ação é bloqueada.

### 4. Instruções para Validação (QA)

1.  **Acessar a Funcionalidade**:
    *   Faça login na aplicação.
    *   Navegue até `Monitoramento Aéreo -> Planejamento de Instalação`.

2.  **Verificar a Lista de Planejamentos**:
    *   Confirme que a lista de planejamentos criados na Parte 1 é exibida corretamente.

3.  **Abrir Detalhes de um Planejamento**:
    *   Clique no botão "Abrir e Editar Pontos" de um planejamento que tenha pontos de instalação.
    *   A tela deve mudar para a visão de detalhe.
    *   **Verificar**: A lista de "Pontos Disponíveis" deve exibir os pontos com status "Planejado".
    *   **Verificar**: A lista de "Ordens de Serviço Geradas" deve estar vazia inicialmente.

4.  **Gerar uma Nova OS**:
    *   Selecione um ou mais pontos na lista de "Pontos Disponíveis". O checkbox "Selecionar Todos" também pode ser usado.
    *   Clique no botão "Gerar OS".
    *   O modal para criação da OS deve aparecer. Preencha os campos (Responsável e Data Prevista são obrigatórios).
    *   Clique em "Confirmar Geração".

5.  **Verificar Resultado Pós-Geração**:
    *   **Verificar**: Uma mensagem de sucesso deve ser exibida.
    *   **Verificar**: A OS recém-criada deve aparecer na lista de "Ordens de Serviço Geradas", com o número sequencial correto (ex: OS-2024-001).
    *   **Verificar**: Os pontos que foram incluídos na OS devem desaparecer da lista de "Pontos Disponíveis" (pois seu status mudou para "Em OS").

6.  **Teste de Segurança e Offline**:
    *   No navegador, ative o modo offline (DevTools -> Network -> Offline).
    *   Tente gerar uma nova OS.
    *   **Verificar**: Uma mensagem de alerta informando que a operação requer conexão com a internet deve ser exibida, e o modal não deve abrir.

---

## Notas sobre Testes de Regressão

*   **Nenhum módulo existente foi alterado**. As novas funcionalidades foram adicionadas de forma isolada.
*   As coleções `instalacaoPlanejamentos` e `instalacaoPontos` da Parte 1 não foram modificadas em sua estrutura, apenas lidas pela nova funcionalidade.
*   Todo o fluxo do "Monitoramento Aéreo" original (adicionar armadilhas, visualizar risco, etc.) permanece intacto e funcional.
*   Nenhuma outra tela ou relatório da aplicação foi modificado.

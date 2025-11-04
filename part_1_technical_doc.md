# Evolução Módulo Monitoramento Aéreo - Documentação Técnica (Parte 1)

## 1. Arquitetura Geral

A implementação da Parte 1 (Planejamento) foi adicionada de forma incremental e não-invasiva ao módulo existente de "Monitoramento Aéreo". A arquitetura segue os padrões já estabelecidos na aplicação, garantindo consistência e reutilização de componentes.

- **Componente de Mapa:** O mapa existente (`App.mapModule`) foi 100% reutilizado. Foi introduzido um "modo de planejamento" (`isPlanningMode`) que é ativado quando o utilizador acede à funcionalidade. Neste modo, os controlos do mapa são ligeiramente ajustados (ex: botão "Voltar") e um novo evento de clique (`_handleMapClickForPlanning`) é adicionado para permitir a criação de pontos de instalação. Ao sair do modo, os eventos e controlos são revertidos ao seu estado original, garantindo zero impacto na funcionalidade de visualização de armadilhas existente.

- **Fluxo de UI:** A interface foi dividida em duas telas principais:
    1.  **Lista de Planejamentos (`planejamentoInstalacao`):** Uma nova tela que lista os planejamentos existentes, permite a criação de novos (`novoPlanejamentoModal`) e a abertura para edição de pontos.
    2.  **Mapa de Planejamento (`monitoramentoAereo` com `isPlanningMode`):** A tela do mapa existente, que, quando em modo de planejamento, exibe os pontos do plano selecionado e permite a criação e edição de novos pontos através do modal `instalacaoPontoModal`.

- **Gerenciamento de Estado:** O estado da aplicação (`App.state`) foi estendido para gerenciar o ID do planejamento ativo (`activePlanejamentoId`) e a lista de marcadores de mapa atualmente visíveis (`planningMarkers`), que são limpos e recarregados conforme o utilizador navega entre os planos.

## 2. Estrutura de Dados (Firestore)

Duas novas coleções foram criadas no Firestore, conforme especificado. Nenhuma coleção existente foi alterada.

- **`instalacaoPlanejamentos`**:
    - `id`: Gerado automaticamente pelo Firestore.
    - `nome`: String opcional para identificar o plano.
    - `fazendaId`, `talhaoId`: Referências para a fazenda e talhão associados.
    - `criadoPorUserId`: ID do utilizador que criou o plano.
    - `criadoEm`: Timestamp UTC do momento da criação.
    - `status`: "Planejado" ou "Cancelado".
    - `syncStatus`: "pending", "synced", ou "failed" para controlo de sincronização offline.
    - `companyId`: Particionamento de dados por empresa.

- **`instalacaoPontos`**:
    - `id`: Gerado automaticamente pelo Firestore.
    - `planejamentoId`: Referência obrigatória ao documento pai em `instalacaoPlanejamentos`.
    - `fazendaId`, `talhaoId`: Desnormalizado do plano pai para facilitar consultas.
    - `coordenadas`: Objeto `{ lat: number, lng: number }`.
    - `dataPrevistaInstalacao`: Date (convertido para Timestamp no Firestore).
    - `responsavelId`: ID do utilizador responsável pela instalação.
    - `status`: "Planejado" ou "Cancelado".
    - `criadoPorUserId`, `criadoEm`, `updatedEm`: Timestamps para auditoria.
    - `descricao`: String opcional.
    - `syncStatus`: "pending", "synced", ou "failed".
    - `companyId`: Particionamento de dados por empresa.

As regras de segurança (`firestore.rules`) foram atualizadas para permitir operações de CRUD nestas novas coleções, reutilizando a função `canAccessCompanyData` existente para garantir o isolamento de dados entre empresas.

## 3. Abordagem Offline-First

A fundação para o suporte offline foi implementada de forma simples, focada na criação de dados.

- **Criação Offline:**
    - Quando o utilizador cria um novo **planejamento** ou um novo **ponto** e a aplicação está offline (`navigator.onLine === false`), a operação de escrita não é enviada ao Firestore.
    - Em vez disso, um objeto representando a operação é guardado na tabela `offline-writes` do IndexedDB.
    - O campo `syncStatus` é definido como "pending".
    - A UI é atualizada otimisticamente para refletir a criação local, dando ao utilizador feedback imediato.

- **Edição Offline:**
    - A edição de **pontos** existentes enquanto offline é suportada e segue o mesmo fluxo (guarda a operação de `update` no IndexedDB).
    - A edição de **planejamentos** (o documento pai) enquanto offline foi desabilitada nesta fase para simplificar a lógica, conforme os requisitos. O utilizador recebe um aviso se tentar editar um planejamento sem conexão.

- **Sincronização:**
    - A lógica de sincronização existente na aplicação (`App.actions.syncOfflineWrites`) já é capaz de processar os itens na fila `offline-writes`.
    - Quando a conexão é restaurada, esta função itera sobre os registos pendentes, envia-os para o Firestore e, em caso de sucesso, remove-os da fila local.

Esta abordagem garante que o trabalho do utilizador não é perdido em caso de falha de conexão, sem introduzir lógicas complexas de resolução de conflitos nesta fase.

## 4. Instruções para Validação (QA)

**Pré-requisitos:**
- Utilizar um utilizador com permissão `planejamentoInstalacao`.
- A empresa do utilizador deve ter o módulo `planejamentoInstalacao` subscrito e a feature flag global ativa.

**Cenário 1: Fluxo Online (Conectado à Internet)**
1.  Navegue para "Monitoramento Aéreo" -> "Planejamento de Instalação".
2.  Clique em "Novo Planejamento". Preencha os campos e salve. Verifique se o novo planejamento aparece na lista com o status "Planejado".
3.  Clique no botão "Abrir e Editar Pontos" do planejamento recém-criado.
4.  Verifique se o mapa é exibido em tela cheia com um botão "Voltar para a Lista de Planos".
5.  **No Desktop:** Clique dentro de um talhão no mapa. **No Mobile:** Pressione longamente dentro de um talhão.
6.  Verifique se um modal para "Novo Ponto de Instalação" aparece com os campos "Fazenda" e "Talhão" pré-preenchidos e bloqueados.
7.  Preencha os campos "Responsável", "Data Prevista" e salve.
8.  Verifique se o modal fecha e um marcador azul de ponto aparece no local clicado no mapa.
9.  Clique no marcador recém-criado. Verifique se o modal abre novamente, desta vez com o título "Editar Ponto de Instalação" e com os dados do ponto preenchidos.
10. Altere a "Descrição" e salve. Verifique se a alteração foi persistida (reabrindo o modal).
11. Clique em "Voltar para a Lista de Planos". Verifique se regressa à tela de lista.
12. Abra novamente o mesmo planejamento e confirme que o ponto criado anteriormente ainda está no mapa.

**Cenário 2: Fluxo Offline (Sem Conexão)**
1.  **Simule Offline:** Utilize as ferramentas de programador do navegador (separador "Network") para colocar a aplicação em modo "Offline".
2.  **Criar Planejamento:** Repita os passos 1 e 2 do Cenário 1. Verifique se o planejamento aparece na lista (isto é uma atualização otimista da UI).
3.  **Criar Ponto:** Repita os passos 3 a 7 do Cenário 1. Verifique se o marcador azul aparece no mapa.
4.  **Simule Online:** Volte a colocar a aplicação em modo "Online" nas ferramentas de programador.
5.  **Verificar Sincronização:** Aguarde alguns segundos. A aplicação deverá sincronizar os dados automaticamente. Para verificar, atualize a página (F5).
6.  Após o recarregamento, navegue novamente para a tela de planejamento e confirme que o planejamento e o ponto criados offline estão presentes e carregados a partir do servidor.

**Cenário 3: Validação de Regressão (Não-Invasivo)**
1.  Navegue para "Monitoramento Aéreo" -> "Visualizar Mapa".
2.  Verifique se o mapa funciona como antes (exibição de armadilhas ativas, informações de talhão ao clicar, etc.).
3.  Confirme que o clique no mapa para criar pontos de planejamento **NÃO** está ativo nesta tela.
4.  Execute um relatório existente (ex: Relatório de Risco) e confirme que continua a ser gerado corretamente, sem erros.

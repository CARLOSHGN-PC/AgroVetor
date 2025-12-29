# Arquitetura Offline-First - AgroVetor

Este documento descreve a arquitetura técnica para garantir operação 100% offline, zero perda de dados e alta performance para a aplicação AgroVetor.

## 1. Diagrama Lógico da Arquitetura

```mermaid
graph TD
    User[Usuário] -->|Interage| UI[Interface (PWA/Android)]
    UI -->|Lê/Escreve| LocalState[Estado Local (RAM)]

    subgraph "Camada Offline (Cliente)"
        LocalState -->|Persiste Ação| SyncQueue[Fila de Sincronização (IndexedDB)]
        LocalState -->|Lê Dados| OfflineDB[Banco de Dados Local (IndexedDB)]

        SyncQueue -->|Processa| SyncEngine[Motor de Sincronização]
        SyncEngine -->|Retry/Backoff| SyncQueue
    end

    subgraph "Camada de Rede"
        SyncEngine -->|Envia JSON| API[Backend (Node.js)]
        API -->|Retorna Confirmação| SyncEngine
        API -->|Push Updates| RealtimeListener[Firestore Listener]
    end

    subgraph "Camada Backend (Servidor)"
        API -->|Valida & Grava| Firestore[Google Firestore]
        RealtimeListener -->|Recebe Deltas| OfflineDB
    end

    SyncEngine -->|Atualiza Status| OfflineDB
    RealtimeListener -->|Grava Cache| OfflineDB
```

## 2. Estrutura de Dados Local (IndexedDB)

Para suportar 100k+ registros sem estourar a memória do Android, utilizaremos **IndexedDB** com índices estratégicos.

### Stores (Tabelas)

1.  **`offline_queue`**: Armazena *mutações* pendentes.
    *   `id`: Auto-incremento (ordem de execução).
    *   `uuid`: UUID da operação (idempotência).
    *   `type`: 'CREATE', 'UPDATE', 'DELETE'.
    *   `collection`: Nome da coleção (ex: 'armadilhas').
    *   `payload`: Dados JSON.
    *   `status`: 'PENDING', 'PROCESSING', 'FAILED'.
    *   `retryCount`: Número de tentativas.
    *   `createdAt`: Timestamp.
    *   `error`: Última mensagem de erro (se houver).

2.  **`data_cache`**: Armazena o *espelho* dos dados do servidor para leitura offline.
    *   `id`: UUID do registro (chave primária).
    *   `collection`: Nome da coleção (ex: 'fazendas', 'armadilhas'). *Indexado*.
    *   `data`: O objeto de dados completo.
    *   `updatedAt`: Timestamp da última atualização (para Delta Sync).
    *   `syncStatus`: 'synced', 'dirty' (modificado localmente).
    *   *Índices adicionais:* `fazendaId`, `data`, `status` para buscas rápidas.

3.  **`static_assets`**: Cache de imagens, mapas e recursos estáticos (já existente).

## 3. Checklist Técnico de Implementação

### Fase 1: Fundação Offline (Imediato)
- [ ] **UUID no Cliente:** Abandonar IDs do Firestore gerados no servidor para criações. Gerar UUID v4 no cliente para *todas* as novas entidades.
- [ ] **Sync Queue Robusta:** Implementar `SyncQueue` com persistência em IndexedDB, retry exponencial (2s, 4s, 8s...) e travamento em caso de erro fatal (dependência).
- [ ] **Camada de Abstração de Dados:** Criar `DataManager` que decide se lê da RAM, do IndexedDB ou da API.
- [ ] **Paginação Local:** Alterar listagens (ex: Histórico) para carregar `limit: 50` do IndexedDB, não `getAll()`.

### Fase 2: Backend & Conflitos
- [ ] **API de Sincronização em Lote:** Endpoint `/api/sync/batch` para receber múltiplas operações de uma vez (performance).
- [ ] **Log de Conflitos:** Backend detecta se `client_updated_at` < `server_updated_at`. Aplica "Server Wins" mas grava o payload do cliente em uma coleção `conflict_logs` para auditoria.
- [ ] **Delta Sync:** Backend envia apenas registros alterados após `last_sync_timestamp` do cliente.

## 4. Estratégia de Migração (Passo a Passo)

1.  **Refatoração Segura (Non-Breaking):**
    *   Criar a nova classe `OfflineManager` sem remover a antiga `App.data` imediatamente.
    *   Migrar um módulo simples (ex: "Lançamento Broca") para usar o novo sistema.
    *   Testar exaustivamente: Modo Avião -> Criar -> Conectar -> Verificar Sync.

2.  **Migração de Dados:**
    *   No primeiro load da nova versão, um script deve ler os dados antigos do `localStorage`/`IndexedDB` legado e migrar para a nova estrutura `data_cache`.

3.  **Virada de Chave:**
    *   Após validar o módulo piloto, migrar "Ordens de Serviço" e "Monitoramento".
    *   Por fim, migrar "Mapas" (o mais complexo).

## 5. Alertas de Riscos Reais

1.  **Race Conditions no Mapa:** O Mapbox GL JS não gosta de atualizações de fonte frequentes.
    *   *Mitigação:* Debounce nas atualizações do mapa vindo do IndexedDB. Atualizar apenas quando o usuário parar de interagir ou mudar de tela.
2.  **Primeira Sincronização (Cold Start):** Baixar 100k registros na primeira instalação pode demorar.
    *   *Mitigação:* Baixar apenas dados dos últimos 6 meses inicialmente. Botão "Baixar Histórico Completo" opcional.
3.  **Quota de Armazenamento:** Em dispositivos Android low-end, o navegador pode limpar o IndexedDB se o espaço acabar.
    *   *Mitigação:* Usar a API `navigator.storage.persist()` para solicitar armazenamento persistente.
4.  **Mudança de Estrutura (Schema Migration):** Se o modelo de dados mudar no backend, o app offline pode quebrar.
    *   *Mitigação:* Versionamento estrito dos objetos na fila. Se a versão do app for antiga, forçar atualização antes de sincronizar.

## 6. Fluxo de Dados (Offline -> Online)

1.  **Ação do Usuário:** Usuário clica em "Salvar".
2.  **Persistência Imediata:**
    *   Gera UUID.
    *   Grava em `data_cache` (marcado como `dirty`) -> **UI Atualiza Imediatamente**.
    *   Grava em `offline_queue` (payload da operação).
3.  **Tentativa de Sync (Background):**
    *   Service Worker ou `setInterval` detecta conexão.
    *   Lê item mais antigo da fila.
    *   Envia para `/api/sync`.
4.  **Sucesso:**
    *   Remove da fila.
    *   Atualiza `data_cache` com a resposta do servidor (ex: carimbos de tempo oficiais).
    *   Marca `data_cache` como `synced`.
5.  **Falha (Rede):**
    *   Mantém na fila.
    *   Agenda retry (backoff).
    *   UI mostra ícone "Nuvem cortada" ou "Sincronizando...".
6.  **Falha (Regra de Negócio/Conflito):**
    *   Remove da fila (para não bloquear o resto).
    *   Grava em `sync_errors`.
    *   Notifica usuário: "Erro ao salvar item X. Toque para ver detalhes."

---
*Autor: Jules (Senior Software Architect)*

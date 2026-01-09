// docs/js/services/SyncService.js

import { offlineManager, OfflineManager } from '../lib/OfflineManager.js';
import { SyncQueueFactory } from '../lib/SyncQueue.js';

class SyncService {
    constructor() {
        this.queue = null;
        this.initialized = false;
        this.onlineDebounceTimer = null;
    }

    init(backendUrl, authProvider) {
        if (this.initialized) return;

        this.queue = SyncQueueFactory(backendUrl, authProvider);

        // Sincronização Periódica (Backup)
        setInterval(() => {
            if (navigator.onLine) {
                this.processQueueIfReady("periodic");
            }
        }, 60 * 1000); // A cada 1 minuto

        this.initialized = true;
    }

    /**
     * Interface pública para salvar dados.
     * Substitui o antigo App.data.addDocument / setDocument
     */
    async save(collection, data, id = null) {
        const type = id ? 'UPDATE' : 'CREATE';
        const uuid = id || OfflineManager.generateUUID(); // Gera UUID se for criação nova

        // Adiciona timestamp local se não houver
        if (!data.createdAt && type === 'CREATE') {
            data.createdAt = new Date().toISOString();
        }
        data.updatedAt = new Date().toISOString();

        // Enfileira
        await offlineManager.enqueueOperation(type, collection, data, uuid);

        // Tenta sincronizar imediatamente se estiver online
        if (navigator.onLine) {
            // Não aguardamos o processQueue terminar para não bloquear a UI
            this.processQueueIfReady("save");
        }

        return uuid; // Retorna o ID gerado para uso na UI
    }

    async delete(collection, id) {
        await offlineManager.enqueueOperation('DELETE', collection, {}, id);
        if (navigator.onLine) this.processQueueIfReady("delete");
    }

    handleOnlineConfirmed(debounceMs = 4000) {
        if (!this.queue) {
            console.warn("[SyncService] SyncService não inicializado. Ignorando auto-sync.");
            return;
        }
        if (this.onlineDebounceTimer) {
            clearTimeout(this.onlineDebounceTimer);
        }
        this.onlineDebounceTimer = setTimeout(() => {
            this.processQueueIfReady("reconnect");
        }, debounceMs);
    }

    async processQueueIfReady(source = "manual") {
        if (!this.queue) return;
        if (this.queue.isSyncing) {
            console.log(`[SyncService] Sincronização já em andamento. Ignorando gatilho (${source}).`);
            return;
        }
        if (!navigator.onLine) {
            console.log(`[SyncService] Ainda offline. Ignorando gatilho (${source}).`);
            return;
        }
        const token = await this.queue.authProvider?.();
        if (!token) {
            console.warn(`[SyncService] Usuário não autenticado. Ignorando gatilho (${source}).`);
            return;
        }
        const pendingCount = await offlineManager.getPendingOperationCount();
        console.log(`[SyncService] Itens pendentes na fila: ${pendingCount}. Origem: ${source}.`);
        if (pendingCount > 0) {
            console.log("[SyncService] Iniciando SyncQueue.processQueue()...");
            this.queue.processQueue();
        }
    }
}

export const syncService = new SyncService();

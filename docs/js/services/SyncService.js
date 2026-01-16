// docs/js/services/SyncService.js

import { offlineManager, OfflineManager } from '../lib/OfflineManager.js';
import { SyncQueueFactory } from '../lib/SyncQueue.js';

class SyncService {
    constructor() {
        this.queue = null;
        this.initialized = false;
        this.sessionManager = null;
    }

    init(backendUrl, authProvider, sessionManager = null) {
        if (this.initialized) return;

        this.sessionManager = sessionManager;
        this.queue = SyncQueueFactory(backendUrl, authProvider, {
            onAuthError: () => {
                if (this.sessionManager) {
                    this.sessionManager.setNeedsOnlineReauth({ source: 'sync-queue' });
                }
            }
        });

        // Listeners de Rede
        window.addEventListener('online', () => {
            console.log("[SyncService] Online detectado. Iniciando sincronização...");
            this.trySync();
        });

        // Sincronização Periódica (Backup)
        setInterval(() => {
            this.trySync();
        }, 60 * 1000); // A cada 1 minuto

        this.initialized = true;
    }

    trySync() {
        if (!navigator.onLine) return;
        if (this.sessionManager && this.sessionManager.needsReauth()) return;
        this.queue.processQueue();
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
            this.trySync();
        }

        return uuid; // Retorna o ID gerado para uso na UI
    }

    async delete(collection, id) {
        await offlineManager.enqueueOperation('DELETE', collection, {}, id);
        if (navigator.onLine) this.trySync();
    }
}

export const syncService = new SyncService();

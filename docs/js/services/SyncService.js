// docs/js/services/SyncService.js

import { offlineManager, OfflineManager } from '../lib/OfflineManager.js';
import { SyncQueueFactory } from '../lib/SyncQueue.js';

class SyncService {
    constructor() {
        this.queue = null;
        this.initialized = false;
        this.isOnline = () => navigator.onLine;
    }

    init(backendUrl, authProvider, { networkManager, isOnline } = {}) {
        if (this.initialized) return;

        if (isOnline) {
            this.isOnline = isOnline;
        }

        this.queue = SyncQueueFactory(backendUrl, authProvider, { isOnline: this.isOnline });

        // Listeners de Rede
        if (networkManager) {
            networkManager.addEventListener('connectivity:changed', (event) => {
                if (event.detail?.status === 'ONLINE') {
                    console.log("[SyncService] Online estável detectado. Iniciando sincronização...");
                    this.queue.processQueue();
                }
            });
        } else {
            window.addEventListener('online', () => {
                console.log("[SyncService] Online detectado. Iniciando sincronização...");
                this.queue.processQueue();
            });
        }

        // Sincronização Periódica (Backup)
        setInterval(() => {
            if (this.isOnline()) {
                this.queue.processQueue();
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
        if (this.isOnline()) {
            // Não aguardamos o processQueue terminar para não bloquear a UI
            this.queue.processQueue();
        }

        return uuid; // Retorna o ID gerado para uso na UI
    }

    async delete(collection, id) {
        await offlineManager.enqueueOperation('DELETE', collection, {}, id);
        if (this.isOnline()) this.queue.processQueue();
    }
}

export const syncService = new SyncService();

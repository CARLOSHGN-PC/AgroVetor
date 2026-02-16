// docs/js/lib/SyncQueue.js

import { offlineManager } from './OfflineManager.js';
import { perfLogger } from '../core/perf-logger.js';

/**
 * Gerencia a fila de sincronização: processamento, retry e dependências.
 */
class SyncQueue {
    constructor(backendUrl, authProvider) {
        this.backendUrl = backendUrl;
        this.authProvider = authProvider; // Função que retorna o token atual
        this.isSyncing = false;
        this.maxRetries = 5;
        this.batchSize = 30;
    }

    /**
     * Inicia o processamento da fila.
     * Deve ser chamado quando há conexão ou periodicamente.
     */
    async processQueue() {
        if (this.isSyncing || !navigator.onLine) return;
        this.isSyncing = true;
        const syncStart = performance.now();
        await perfLogger.mark('sync_start');

        try {
            const pendingOps = await offlineManager.getPendingOperations();
            if (pendingOps.length === 0) {
                this.isSyncing = false;
                await perfLogger.mark('sync_end', { totalItems: 0 });
                await perfLogger.logSyncSummary(0, 0);
                return;
            }

            // Ordena por ID (FIFO) para respeitar a ordem de criação
            pendingOps.sort((a, b) => a.id - b.id);

            const chunks = [];
            for (let i = 0; i < pendingOps.length; i += this.batchSize) {
                chunks.push(pendingOps.slice(i, i + this.batchSize));
            }

            for (let batchIndex = 0; batchIndex < chunks.length; batchIndex += 1) {
                const batch = chunks[batchIndex];
                const batchStart = performance.now();

                for (const op of batch) {
                    if (!navigator.onLine) break;
                    if (op.nextRetry && Date.now() < op.nextRetry) continue;

                    try {
                        await this._syncOperation(op);
                        await offlineManager.removeOperation(op.id);
                        await offlineManager.markAsSynced(op.uuid);
                    } catch (error) {
                        console.error(`Erro ao sincronizar operação ${op.id} (${op.collection}):`, error);
                        const retryCount = (op.retryCount || 0) + 1;
                        const errorMsg = error.message || String(error);
                        const backoffDelay = Math.pow(2, retryCount) * 1000;
                        const nextRetry = Date.now() + backoffDelay;

                        await offlineManager.updateOperation(op.id, {
                            retryCount,
                            nextRetry,
                            error: errorMsg,
                        });

                        if (retryCount >= this.maxRetries) {
                            console.error(`Máximo de tentativas (${this.maxRetries}) atingido para op ${op.id}. Parando fila.`);
                        }
                        break;
                    }
                }

                const batchDuration = performance.now() - batchStart;
                await perfLogger.logSyncBatch(batchIndex + 1, batch.length, batchDuration, pendingOps.length);
                window.dispatchEvent(new CustomEvent('agrovetor:sync-progress', {
                    detail: {
                        processed: Math.min((batchIndex + 1) * this.batchSize, pendingOps.length),
                        total: pendingOps.length,
                        batch: batchIndex + 1,
                        batches: chunks.length,
                        batchDuration,
                    },
                }));

                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        } finally {
            this.isSyncing = false;
            const durationMs = performance.now() - syncStart;
            const pendingAfter = await offlineManager.getPendingOperations();
            await perfLogger.mark('sync_end', {
                totalItems: pendingAfter.length,
                durationMs,
            });
            await perfLogger.logSyncSummary(pendingAfter.length, durationMs);
        }
    }

    /**
     * Envia uma única operação para o backend.
     */
    async _syncOperation(op) {
        const url = `${this.backendUrl}/api/sync`;
        const body = {
            type: op.type,
            collection: op.collection,
            data: op.payload,
            uuid: op.uuid,
            clientTimestamp: op.createdAt
        };

        const attemptSync = async (forceRefresh = false) => {
            const token = await this.authProvider(forceRefresh);
            if (!token) throw new Error("Usuário não autenticado.");
            return fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(body)
            });
        };

        let response = await attemptSync(false);
        if ((response.status === 401 || response.status === 403) && typeof this.authProvider === 'function') {
            response = await attemptSync(true);
        }

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server Error ${response.status}: ${errorText}`);
        }

        return await response.json();
    }
}

export const SyncQueueFactory = (backendUrl, authProvider) => new SyncQueue(backendUrl, authProvider);

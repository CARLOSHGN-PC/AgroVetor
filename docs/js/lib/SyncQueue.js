// docs/js/lib/SyncQueue.js

import { offlineManager } from './OfflineManager.js';
import { networkManager } from '../services/NetworkManager.js';

/**
 * Gerencia a fila de sincronização: processamento, retry e dependências.
 */
class SyncQueue {
    constructor(backendUrl, authProvider) {
        this.backendUrl = backendUrl;
        this.authProvider = authProvider; // Função que retorna o token atual
        this.isSyncing = false;
        this.maxRetries = 5;
    }

    /**
     * Inicia o processamento da fila.
     * Deve ser chamado quando há conexão ou periodicamente.
     */
    async processQueue() {
        if (this.isSyncing || !networkManager.isOnline()) return;
        this.isSyncing = true;

        try {
            const pendingOps = await offlineManager.getPendingOperations();
            if (pendingOps.length === 0) {
                this.isSyncing = false;
                return;
            }

            // Ordena por ID (FIFO) para respeitar a ordem de criação
            pendingOps.sort((a, b) => a.id - b.id);

            for (const op of pendingOps) {
                if (!networkManager.isOnline()) break; // Para se cair a net no meio

                // Verifica Backoff Exponencial
                if (op.nextRetry && Date.now() < op.nextRetry) {
                    continue; // Pula operações que ainda não devem ser tentadas
                }

                try {
                    await this._syncOperation(op);
                    // Sucesso: Remove da fila
                    await offlineManager.removeOperation(op.id);
                    // Marca o dado como sincronizado no cache
                    await offlineManager.markAsSynced(op.uuid);
                } catch (error) {
                    console.error(`Erro ao sincronizar operação ${op.id} (${op.collection}):`, error);

                    // Incrementa Retry e Salva o Erro com Backoff
                    const retryCount = (op.retryCount || 0) + 1;
                    const errorMsg = error.message || String(error);

                    // Exponential Backoff: 2s, 4s, 8s, 16s...
                    const backoffDelay = Math.pow(2, retryCount) * 1000;
                    const nextRetry = Date.now() + backoffDelay;

                    await offlineManager.updateOperation(op.id, {
                        retryCount: retryCount,
                        nextRetry: nextRetry,
                        error: errorMsg
                    });

                    // Verifica limite de tentativas
                    if (retryCount >= this.maxRetries) {
                        console.error(`Máximo de tentativas (${this.maxRetries}) atingido para op ${op.id}. Parando fila.`);
                        // Não removemos da fila para não perder dados.
                        // A fila fica travada para este item (e dependentes se aplicável)
                        // Futuro: Mover para 'sync_errors'
                    }

                    // Se falhar um item, paramos a fila para garantir consistência sequencial (Dependências)
                    // A menos que a gente implemente "pular itens independentes", mas o requisito é "Relações pai-filho funcionam offline"
                    // Então, se o pai falhar, o filho TEM que esperar. Parar a fila é o mais seguro.
                    break;
                }
            }
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Envia uma única operação para o backend.
     */
    async _syncOperation(op) {
        const token = await this.authProvider();
        if (!token) throw new Error("Usuário não autenticado.");

        const url = `${this.backendUrl}/api/sync`;

        // Estrutura do payload unificado para o backend
        const body = {
            type: op.type,
            collection: op.collection,
            data: op.payload,
            uuid: op.uuid,
            clientTimestamp: op.createdAt
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            // Tenta ler a mensagem de erro
            const errorText = await response.text();
            throw new Error(`Server Error ${response.status}: ${errorText}`);
        }

        return await response.json();
    }
}

export const SyncQueueFactory = (backendUrl, authProvider) => new SyncQueue(backendUrl, authProvider);

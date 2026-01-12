// docs/js/lib/OfflineManager.js

/**
 * Gerencia o acesso ao banco de dados local (IndexedDB).
 * Responsável por leituras, escritas e índices para performance.
 */
export class OfflineManager {
    constructor() {
        this.dbName = 'agrovetor-offline-storage';
        this.dbVersion = 8; // Incremented for Qualidade de Plantio store
        this.dbPromise = null;
    }

    async init() {
        if (this.dbPromise) return this.dbPromise;

        // Use the global 'idb' object loaded via <script> tag
        const { openDB } = window.idb;

        this.dbPromise = openDB(this.dbName, this.dbVersion, {
            upgrade(db, oldVersion, newVersion, transaction) {
                // Stores Legados (Mantidos para compatibilidade durante migração)
                if (!db.objectStoreNames.contains('offline-writes')) {
                    db.createObjectStore('offline-writes', { autoIncrement: true });
                }
                if (!db.objectStoreNames.contains('sync-history')) {
                    db.createObjectStore('sync-history', { keyPath: 'timestamp' });
                }
                if (!db.objectStoreNames.contains('offline-credentials')) {
                    db.createObjectStore('offline-credentials', { keyPath: 'email' });
                }
                if (!db.objectStoreNames.contains('gps-locations')) {
                    db.createObjectStore('gps-locations', { autoIncrement: true });
                }
                if (!db.objectStoreNames.contains('notifications')) {
                    db.createObjectStore('notifications', { autoIncrement: true });
                }

                // --- NOVAS STORES DA ARQUITETURA V2 ---

                // 1. Fila de Sincronização Robusta
                // id: autoIncrement (garante ordem FIFO)
                // uuid: identificador único da operação
                if (!db.objectStoreNames.contains('sync_queue')) {
                    const queueStore = db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
                    queueStore.createIndex('uuid', 'uuid', { unique: true });
                    queueStore.createIndex('status', 'status', { unique: false });
                }

                // 2. Cache de Dados Principal (Data Lake Local)
                // id: ID do documento (UUID ou ID do Firestore)
                if (!db.objectStoreNames.contains('data_cache')) {
                    const dataStore = db.createObjectStore('data_cache', { keyPath: 'id' });

                    // Índices para busca rápida e filtros (Performance 100k+)
                    dataStore.createIndex('collection', 'collection', { unique: false });
                    dataStore.createIndex('updatedAt', 'updatedAt', { unique: false }); // Para Delta Sync
                    dataStore.createIndex('syncStatus', 'syncStatus', { unique: false }); // 'synced' | 'dirty'

                    // Índices específicos de negócio (Exemplos comuns)
                    dataStore.createIndex('fazendaId', 'data.fazendaId', { unique: false });
                    dataStore.createIndex('companyId', 'data.companyId', { unique: false });
                    dataStore.createIndex('data', 'data.data', { unique: false }); // Data do evento (YYYY-MM-DD)
                }

                if (!db.objectStoreNames.contains('qualidade_plantio')) {
                    const qualidadeStore = db.createObjectStore('qualidade_plantio', { keyPath: 'id' });
                    qualidadeStore.createIndex('companyId', 'companyId', { unique: false });
                    qualidadeStore.createIndex('fazendaId', 'fazendaId', { unique: false });
                    qualidadeStore.createIndex('talhaoId', 'talhaoId', { unique: false });
                    qualidadeStore.createIndex('data', 'data', { unique: false });
                    qualidadeStore.createIndex('indicadorCodigo', 'indicadorCodigo', { unique: false });
                    qualidadeStore.createIndex('tipoPlantio', 'tipoPlantio', { unique: false });
                }
            },
        });

        return this.dbPromise;
    }

    /**
     * Adiciona uma operação à fila de sincronização.
     * @param {string} type - 'CREATE', 'UPDATE', 'DELETE'
     * @param {string} collection - Nome da coleção
     * @param {object} payload - Dados da operação
     * @param {string} uuid - UUID único gerado no cliente
     */
    async enqueueOperation(type, collection, payload, uuid) {
        const db = await this.init();
        const operation = {
            type,
            collection,
            payload,
            uuid,
            status: 'PENDING',
            retryCount: 0,
            nextRetry: 0, // Timestamp para o próximo retry
            createdAt: new Date().toISOString(),
            error: null
        };
        await db.add('sync_queue', operation);

        // Atualiza também o cache local para refletir a mudança imediatamente (Optimistic UI)
        await this.updateLocalCache(collection, payload, uuid, type);
    }

    /**
     * Atualiza uma operação existente na fila (ex: incrementar retry).
     */
    async updateOperation(id, updates) {
        const db = await this.init();
        const tx = db.transaction('sync_queue', 'readwrite');
        const store = tx.objectStore('sync_queue');

        const op = await store.get(id);
        if (op) {
            const updatedOp = { ...op, ...updates };
            await store.put(updatedOp);
        }
        await tx.done;
    }

    /**
     * Atualiza o cache local (data_cache) para leitura offline.
     */
    async updateLocalCache(collection, data, id, type) {
        const db = await this.init();
        const tx = db.transaction('data_cache', 'readwrite');
        const store = tx.objectStore('data_cache');

        if (type === 'DELETE') {
            await store.delete(id);
        } else {
            // Se for CREATE ou UPDATE
            // Preserva dados existentes se for um patch, ou sobrescreve
            const existing = await store.get(id);
            const newData = {
                id: id,
                collection: collection,
                data: { ...(existing ? existing.data : {}), ...data },
                updatedAt: new Date().toISOString(),
                syncStatus: 'dirty' // Marcado como não sincronizado até confirmação do servidor
            };
            await store.put(newData);
        }
        await tx.done;
    }

    /**
     * Marca um registro como sincronizado após sucesso do backend.
     */
    async markAsSynced(id, serverData = null) {
        const db = await this.init();
        const tx = db.transaction('data_cache', 'readwrite');
        const store = tx.objectStore('data_cache');

        const record = await store.get(id);
        if (record) {
            record.syncStatus = 'synced';
            // Se o servidor retornou dados atualizados (ex: timestamps oficiais), atualizamos
            if (serverData) {
                record.data = { ...record.data, ...serverData };
            }
            await store.put(record);
        }
        await tx.done;
    }

    /**
     * Busca dados paginados do cache local.
     * Essencial para performance em listas grandes.
     */
    async getCollectionData(collectionName, limit = 50, offset = 0) {
        const db = await this.init();
        const tx = db.transaction('data_cache', 'readonly');
        const index = tx.objectStore('data_cache').index('collection');
        const range = IDBKeyRange.only(collectionName);

        let results = [];
        let cursor = await index.openCursor(range);

        // Avançar cursor (Offset) - FIX: Deve ser await
        if (offset > 0 && cursor) {
            cursor = await cursor.advance(offset);
        }

        // Ler registros (Limit)
        while (cursor && results.length < limit) {
            results.push(cursor.value.data);
            cursor = await cursor.continue();
        }

        return results;
    }

    async getPendingOperations() {
        const db = await this.init();
        return db.getAll('sync_queue');
    }

    async removeOperation(id) {
        const db = await this.init();
        return db.delete('sync_queue', id);
    }

    // Método auxiliar para gerar UUID v4
    static generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
}

export const offlineManager = new OfflineManager();

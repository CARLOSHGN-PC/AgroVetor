const DEFAULT_PAGE_SIZE = 10;

const generateUUID = () => {
    if (crypto?.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

export class KMRepository {
    constructor(offlineDB, { companyIdProvider } = {}) {
        this.offlineDB = offlineDB;
        this.companyIdProvider = companyIdProvider;
    }

    async _getStore(mode = 'readonly') {
        const db = await this.offlineDB.dbPromise;
        const tx = db.transaction('km_records', mode);
        return { tx, store: tx.store };
    }

    _withDefaults(data, now) {
        return {
            ...data,
            createdAt: data.createdAt || now,
            updatedAt: now,
            syncStatus: data.syncStatus || 'pending',
            version: data.version || 1,
            status: data.status || 'EM_DESLOCAMENTO'
        };
    }

    _companyId(filters) {
        return filters?.companyId || (this.companyIdProvider ? this.companyIdProvider() : null);
    }

    _buildIndex(store, { companyId, status, orderBy }) {
        if (companyId && status) {
            const indexName = orderBy === 'dataChegada'
                ? 'companyId_status_dataChegada'
                : 'companyId_status_dataSaida';
            return {
                source: store.index(indexName),
                range: IDBKeyRange.bound([companyId, status, ''], [companyId, status, '\uffff'])
            };
        }

        if (companyId) {
            return {
                source: store.index('companyId'),
                range: IDBKeyRange.only(companyId)
            };
        }

        return { source: store, range: null };
    }

    _sanitizePayload(record) {
        const { syncStatus, version, lastSyncedAt, lastSyncError, ...payload } = record;
        return payload;
    }

    async createKM(data) {
        const id = generateUUID();
        const now = new Date().toISOString();
        const record = this._withDefaults({ ...data, id }, now);

        const { tx, store } = await this._getStore('readwrite');
        await store.put(record);
        await tx.done;

        const payload = {
            ...this._sanitizePayload(record),
            idempotencyKey: `${id}:${record.version}`
        };
        await this.offlineDB.add('offline-writes', {
            id,
            type: 'create',
            collection: 'controleFrota',
            data: payload,
            retryCount: 0,
            nextRetry: 0
        });

        return record;
    }

    async updateKM(id, patch) {
        const { tx, store } = await this._getStore('readwrite');
        const existing = await store.get(id);
        if (!existing) {
            await tx.done;
            throw new Error('Registro de KM não encontrado.');
        }

        const now = new Date().toISOString();
        const version = (existing.version || 0) + 1;
        const record = {
            ...existing,
            ...patch,
            updatedAt: now,
            version,
            syncStatus: 'pending'
        };

        await store.put(record);
        await tx.done;

        const payload = {
            ...this._sanitizePayload(record),
            idempotencyKey: `${id}:${version}`
        };
        await this.offlineDB.add('offline-writes', {
            id: `${id}:${version}`,
            type: 'update',
            collection: 'controleFrota',
            docId: id,
            data: payload,
            retryCount: 0,
            nextRetry: 0
        });

        return record;
    }

    async deleteKM(id) {
        const { tx, store } = await this._getStore('readwrite');
        const existing = await store.get(id);
        if (existing) {
            const updated = {
                ...existing,
                status: 'DELETED',
                updatedAt: new Date().toISOString(),
                syncStatus: 'pending',
                version: (existing.version || 0) + 1
            };
            await store.put(updated);
        }
        await tx.done;

        await this.offlineDB.add('offline-writes', {
            id: `${id}:delete`,
            type: 'delete',
            collection: 'controleFrota',
            docId: id,
            data: {},
            retryCount: 0,
            nextRetry: 0
        });
    }

    async listKM({ page = 0, pageSize = DEFAULT_PAGE_SIZE, filters = {} } = {}) {
        const companyId = this._companyId(filters);
        const status = filters.status || null;
        const orderBy = filters.orderBy || 'dataSaida';
        const direction = (filters.direction || 'desc') === 'desc' ? 'prev' : 'next';
        const veiculoId = filters.veiculoId;
        const motoristaMatricula = filters.motoristaMatricula;

        const { tx, store } = await this._getStore('readonly');
        const { source, range } = this._buildIndex(store, { companyId, status, orderBy });
        let cursor = range ? await source.openCursor(range, direction) : await source.openCursor(null, direction);

        const offset = page * pageSize;
        const items = [];
        let total = 0;

        while (cursor) {
            const record = cursor.value;
            const matchesVehicle = !veiculoId || record.veiculoId === veiculoId;
            const matchesDriver = !motoristaMatricula || record.motoristaMatricula === motoristaMatricula;
            const matchesStatus = !status || record.status === status;

            if (matchesVehicle && matchesDriver && matchesStatus) {
                if (total >= offset && items.length < pageSize) {
                    items.push(record);
                }
                total += 1;
            }
            cursor = await cursor.continue();
        }

        await tx.done;
        return { items, total };
    }

    async getKM(id) {
        const record = await this.offlineDB.get('km_records', id);
        return record || null;
    }

    async upsertFromRemote(records = []) {
        if (!records.length) return;

        const { tx, store } = await this._getStore('readwrite');
        const now = new Date().toISOString();
        for (const record of records) {
            if (!record?.id) continue;
            const existing = await store.get(record.id);
            const merged = {
                ...(existing || {}),
                ...record,
                updatedAt: record.updatedAt || now,
                createdAt: record.createdAt || existing?.createdAt || now,
                syncStatus: 'synced'
            };
            await store.put(merged);
        }
        await tx.done;
    }
}

export const createKMRepository = (offlineDB, options) => new KMRepository(offlineDB, options);

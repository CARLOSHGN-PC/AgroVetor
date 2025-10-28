// Importa a biblioteca para facilitar o uso do IndexedDB (cache offline)
import { openDB } from 'https://unpkg.com/idb@7.1.1/build/index.js';

// Módulo para gerenciar o banco de dados local (IndexedDB)
const OfflineDB = {
    dbPromise: null,
    async init() {
        if (this.dbPromise) return;
        // Version 5 for the new gps-locations store
        this.dbPromise = openDB('agrovetor-offline-storage', 5, {
            upgrade(db, oldVersion) {
                if (oldVersion < 1) {
                    db.createObjectStore('shapefile-cache');
                }
                if (oldVersion < 2) {
                    db.createObjectStore('offline-writes', { autoIncrement: true });
                }
                if (oldVersion < 3) {
                    db.createObjectStore('sync-history', { keyPath: 'timestamp' });
                }
                if (oldVersion < 4) {
                    db.createObjectStore('notifications', { autoIncrement: true });
                }
                if (oldVersion < 5) {
                    db.createObjectStore('gps-locations', { autoIncrement: true });
                }
            },
        });
    },
    async get(storeName, key) {
        return (await this.dbPromise).get(storeName, key);
    },
    async getAll(storeName) {
        return (await this.dbPromise).getAll(storeName);
    },
    async set(storeName, key, val) {
        return (await this.dbPromise).put(storeName, val, key);
    },
    async add(storeName, val) {
        return (await this.dbPromise).add(storeName, val);
    },
    async delete(storeName, key) {
        return (await this.dbPromise).delete(storeName, key);
    },
};

export { OfflineDB };

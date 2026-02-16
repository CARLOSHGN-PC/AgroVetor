import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@7.1.1/build/index.js';

const PERF_DB_NAME = 'agrovetor-performance';
const PERF_DB_VERSION = 1;
const PERF_STORE = 'perf_logs';

class PerformanceLogger {
    constructor() {
        this.sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        this.dbPromise = null;
    }

    async init() {
        if (!this.dbPromise) {
            this.dbPromise = openDB(PERF_DB_NAME, PERF_DB_VERSION, {
                upgrade(db) {
                    if (!db.objectStoreNames.contains(PERF_STORE)) {
                        const store = db.createObjectStore(PERF_STORE, { keyPath: 'id', autoIncrement: true });
                        store.createIndex('sessionId', 'sessionId', { unique: false });
                        store.createIndex('event', 'event', { unique: false });
                        store.createIndex('createdAt', 'createdAt', { unique: false });
                    }
                }
            });
        }
        return this.dbPromise;
    }

    async log(event, payload = {}) {
        const entry = {
            sessionId: this.sessionId,
            event,
            timestampMs: Number(performance.now().toFixed(2)),
            createdAt: new Date().toISOString(),
            ...payload,
        };

        try {
            const db = await this.init();
            await db.add(PERF_STORE, entry);
        } catch (error) {
            console.warn('Falha ao persistir log de performance no IndexedDB.', error);
        }

        console.log(`[PERF] ${event}`, entry);
        return entry;
    }

    async exportSessionJson() {
        const db = await this.init();
        const all = await db.getAllFromIndex(PERF_STORE, 'sessionId', this.sessionId);
        const payload = {
            sessionId: this.sessionId,
            generatedAt: new Date().toISOString(),
            entries: all,
        };
        return JSON.stringify(payload, null, 2);
    }

    async downloadSessionJson(filenamePrefix = 'agrovetor-diagnostico') {
        const json = await this.exportSessionJson();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        const dateSafe = new Date().toISOString().replace(/[:.]/g, '-');
        anchor.href = url;
        anchor.download = `${filenamePrefix}-${dateSafe}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    }
}

export const perfLogger = new PerformanceLogger();

export const runOnIdle = (cb, timeout = 1200) => {
    if ('requestIdleCallback' in window) {
        return window.requestIdleCallback(cb, { timeout });
    }
    return setTimeout(cb, Math.min(300, timeout));
};

export const yieldToMainThread = () => new Promise(resolve => setTimeout(resolve, 0));

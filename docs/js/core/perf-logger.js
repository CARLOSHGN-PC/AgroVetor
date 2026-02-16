const PERF_DB_NAME = 'agrovetor-perf-logs';
const PERF_DB_VERSION = 1;
const PERF_STORE = 'entries';

function openPerfDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PERF_DB_NAME, PERF_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PERF_STORE)) {
        const store = db.createObjectStore(PERF_STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbAdd(entry) {
  const db = await openPerfDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PERF_STORE, 'readwrite');
    tx.objectStore(PERF_STORE).add(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbGetAll() {
  const db = await openPerfDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PERF_STORE, 'readonly');
    const req = tx.objectStore(PERF_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export class PerfLogger {
  constructor() {
    this.sessionId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.marks = new Map();
  }

  async mark(name, metadata = {}) {
    const now = performance.now();
    const entry = {
      sessionId: this.sessionId,
      type: 'mark',
      name,
      metadata,
      value: now,
      timestamp: new Date().toISOString(),
    };
    this.marks.set(name, now);
    await dbAdd(entry);
    return now;
  }

  async measure(name, startMark, endMark, metadata = {}) {
    const start = this.marks.get(startMark);
    const end = this.marks.get(endMark);
    if (typeof start !== 'number' || typeof end !== 'number') return null;
    const duration = end - start;
    await dbAdd({
      sessionId: this.sessionId,
      type: 'measure',
      name,
      metadata,
      value: duration,
      timestamp: new Date().toISOString(),
    });
    return duration;
  }

  async logSyncBatch(batchIndex, batchSize, durationMs, totalPending) {
    await dbAdd({
      sessionId: this.sessionId,
      type: 'sync_batch',
      name: `sync_batch_${batchIndex}`,
      metadata: { batchIndex, batchSize, totalPending },
      value: durationMs,
      timestamp: new Date().toISOString(),
    });
  }

  async logSyncSummary(totalItems, durationMs) {
    await dbAdd({
      sessionId: this.sessionId,
      type: 'sync_summary',
      name: 'sync_end',
      metadata: { totalItems },
      value: durationMs,
      timestamp: new Date().toISOString(),
    });
  }

  async exportJson() {
    const data = await dbGetAll();
    const payload = {
      exportedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      entries: data,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agrovetor-perf-diagnostico-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
}

export const perfLogger = new PerfLogger();

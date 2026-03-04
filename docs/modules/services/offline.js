export const offlineService = {
  queueWrite: (...args) => window.App?.offlineDB?.add?.('offline-writes', ...args),
  sync: () => window.App?.actions?.syncOfflineData?.()
};

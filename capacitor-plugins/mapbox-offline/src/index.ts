import { registerPlugin } from '@capacitor/core';

import type { MapboxOfflinePlugin } from './definitions';

const MapboxOffline = registerPlugin<MapboxOfflinePlugin>('MapboxOffline', {
  web: () => import('./web').then(m => new m.MapboxOfflineWeb()),
});

export * from './definitions';
export { MapboxOffline };

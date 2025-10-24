import { WebPlugin } from '@capacitor/core';

import type { MapboxOfflinePlugin } from './definitions';

export class MapboxOfflineWeb
  extends WebPlugin
  implements MapboxOfflinePlugin
{
  async echo(options: { value: string }): Promise<{ value: string }> {
    console.log('ECHO', options);
    return options;
  }

  async downloadRegion(options: {
    geojson: any;
    minZoom: number;
    maxZoom: number;
    name: string;
  }): Promise<void> {
    console.warn('MapboxOffline.downloadRegion is not available on the web.', options);
    throw this.unimplemented('Not implemented on web.');
  }
}

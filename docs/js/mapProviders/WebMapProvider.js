import { AerialMapProvider } from './AerialMapProvider.js';

export class WebMapProvider extends AerialMapProvider {
    constructor(options) {
        super(options);
        this.kind = 'web';
    }

    static isSupported() {
        return typeof window !== 'undefined' && typeof window.mapboxgl !== 'undefined';
    }

    async initMap() {
        return { mode: 'web' };
    }

    async downloadOfflineRegion(payload) {
        const feature = payload?.feature;
        if (!feature) throw new Error('Feature obrigatória para download offline web.');
        this.app.mapModule.startOfflineMapDownload(feature);
        return { status: 'started', mode: 'web' };
    }
}

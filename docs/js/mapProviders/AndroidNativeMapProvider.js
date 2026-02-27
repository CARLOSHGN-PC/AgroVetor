import { AerialMapProvider } from './AerialMapProvider.js';

const pluginName = 'AerialMap';

export class AndroidNativeMapProvider extends AerialMapProvider {
    constructor(options) {
        super(options);
        this.kind = 'android-native';
        this.plugin = null;
        this._clickListener = null;
        this._progressListener = null;
        this._errorListener = null;
    }

    static isSupported() {
        const cap = window?.Capacitor;
        const isAndroidNative = Boolean(cap?.isNativePlatform?.() && cap?.getPlatform?.() === 'android');
        if (!isAndroidNative) return false;

        return Boolean(cap?.isPluginAvailable?.(pluginName) || cap?.Plugins?.[pluginName]);
    }

    _ensurePlugin() {
        if (!this.plugin) {
            this.plugin = window.Capacitor.registerPlugin(pluginName);
        }
        return this.plugin;
    }

    async initMap(config = {}) {
        const diagnostics = {
            stage: 'boot',
            pluginName,
            capacitorPlatform: window?.Capacitor?.getPlatform?.() || null,
            pluginAvailable: window?.Capacitor?.isPluginAvailable?.(pluginName) ?? null,
            pluginInRegistry: Boolean(window?.Capacitor?.Plugins?.[pluginName]),
        };

        if (diagnostics.pluginAvailable === false && !diagnostics.pluginInRegistry) {
            const unavailableError = new Error('Plugin nativo AerialMap indisponível no Android.');
            console.error('[AerialNativeMap] initMap abortado: plugin indisponível', diagnostics);
            throw unavailableError;
        }

        const plugin = this._ensurePlugin();
        diagnostics.stage = 'plugin-ready';
        diagnostics.hasPlugin = Boolean(plugin);
        const openPayload = {
            styleUri: config.styleUri || 'mapbox://styles/mapbox/standard-satellite',
            center: config.center || [-48.45, -21.17],
            zoom: config.zoom || 12,
        };
        diagnostics.payload = openPayload;

        try {
            if (!this._clickListener) {
                diagnostics.stage = 'listener:talhaoClick';
                this._clickListener = await plugin.addListener('talhaoClick', (payload) => {
                    const feature = payload?.feature;
                    if (feature && this.app?.mapModule?.showTalhaoInfo) {
                        this.app.mapModule.showTalhaoInfo(feature, payload?.riskPercentage ?? null);
                    }
                });
            }

            if (!this._errorListener) {
                diagnostics.stage = 'listener:nativeMapError';
                this._errorListener = await plugin.addListener('nativeMapError', (payload) => {
                    console.error('[AerialNativeMap] nativeMapError recebido', payload);
                });
            }

            if (!this._progressListener) {
                diagnostics.stage = 'listener:offlineDownloadProgress';
                this._progressListener = await plugin.addListener('offlineDownloadProgress', (payload) => {
                    console.info('[AerialNativeMap] download progress', payload);
                    const status = payload?.status;
                    if (status === 'ready') {
                        this.app?.ui?.showAlert('Download offline concluído.', 'success');
                    } else if (status === 'downloading') {
                        this.app?.ui?.showAlert('Baixando mapa offline...', 'info', 1800);
                    } else if (status === 'error') {
                        this.app?.ui?.showAlert('Erro ao preparar offline.', 'warning');
                    }
                });
            }

            diagnostics.stage = 'openMap:call';
            const response = await plugin.openMap(openPayload);
            diagnostics.stage = 'openMap:success';
            console.info('[AerialNativeMap] openMap sucesso', { payload: openPayload, response });
            return response;
        } catch (error) {
            console.error('[AerialNativeMap] initMap falhou', {
                ...diagnostics,
                message: error?.message || String(error),
                details: error?.details || null,
                stack: error?.stack || null,
            });
            throw error;
        }
    }

    async loadTalhoes(geojson) {
        const plugin = this._ensurePlugin();
        return plugin.loadTalhoes({ geojson: JSON.stringify(geojson) });
    }

    async highlightTalhao(talhaoId) {
        const plugin = this._ensurePlugin();
        return plugin.highlightTalhao({ talhaoId: String(talhaoId) });
    }

    async setCamera(camera) {
        const plugin = this._ensurePlugin();
        return plugin.setCamera(camera);
    }

    async downloadOfflineRegion(config) {
        const plugin = this._ensurePlugin();
        return plugin.downloadOfflineRegion(config);
    }

    async listOfflineRegions() {
        const plugin = this._ensurePlugin();
        const response = await plugin.listOfflineRegions();
        return response?.regions || [];
    }

    async removeOfflineRegion(payload) {
        const plugin = this._ensurePlugin();
        return plugin.removeOfflineRegion(payload);
    }

    async downloadOfflineBatch(config) {
        const plugin = this._ensurePlugin();
        return plugin.prepareOfflinePackage(config);
    }

    async updateOfflineBatch(config) {
        const plugin = this._ensurePlugin();
        return plugin.updateOfflinePackage(config);
    }

    async removeOfflineBatch(payload) {
        const plugin = this._ensurePlugin();
        return plugin.removeOfflinePackage(payload);
    }

    async destroy() {
        if (this._clickListener) {
            await this._clickListener.remove();
            this._clickListener = null;
        }
        if (this._progressListener) {
            await this._progressListener.remove();
            this._progressListener = null;
        }
        if (this._errorListener) {
            await this._errorListener.remove();
            this._errorListener = null;
        }
    }
}

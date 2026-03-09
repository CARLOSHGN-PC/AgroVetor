import { AerialMapProvider } from './AerialMapProvider.js';

const pluginName = 'AerialMap';

export class AndroidNativeMapProvider extends AerialMapProvider {
    constructor(options) {
        super(options);
        this.kind = 'android-native';
        this.plugin = null;
        this._clickListener = null;
        this._progressListener = null;
        this._nativeErrorListener = null;
        this._offlineMissingListener = null;
        this._lastNativeError = null;
        this._lastOfflineMissing = null;
    }

    static isSupported() {
        const cap = window?.Capacitor;
        return Boolean(cap?.isNativePlatform?.() && cap?.getPlatform?.() === 'android' && cap?.registerPlugin);
    }

    _ensurePlugin() {
        if (!this.plugin) {
            this.plugin = window.Capacitor.registerPlugin(pluginName);
            // Optional: fallback checks could be added here if the plugin itself doesn't throw until a method is called.
            // In Capacitor, if the plugin is not registered on the native side, method calls reject with "pluginName plugin is not implemented on android".
        }
        return this.plugin;
    }

    async initMap(config = {}) {
        const plugin = this._ensurePlugin();
        this._lastNativeError = null;
        this._lastOfflineMissing = null;

        if (!this._clickListener) {
            this._clickListener = await plugin.addListener('talhaoClick', (payload) => {
                const feature = payload?.feature;
                if (feature && this.app?.mapModule?.showTalhaoInfo) {
                    this.app.mapModule.showTalhaoInfo(feature, payload?.riskPercentage ?? null);
                }
            });
        }

        if (!this._progressListener) {
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

        if (!this._nativeErrorListener) {
            this._nativeErrorListener = await plugin.addListener('nativeMapError', (payload) => {
                this._lastNativeError = payload || null;
                console.warn('[AndroidNativeMapProvider] nativeMapError recebido de forma assíncrona:', payload);
                // Não repassamos para fatal fallback aqui, apenas logamos. A Activity não vai mais dar finish().
            });
        }

        if (!this._offlineMissingListener) {
            this._offlineMissingListener = await plugin.addListener('offlinePackageMissing', (payload) => {
                this._lastOfflineMissing = payload || null;
                console.warn('[AndroidNativeMapProvider] offlinePackageMissing recebido:', payload);
                if (this.app && this.app.ui && this.app.ui.showAlert) {
                    this.app.ui.showAlert('Mapa offline indisponível para esta área. Conecte-se ou mude o zoom.', 'warning', 7000);
                }
            });
        }

        const result = await plugin.openMap({
            styleUri: config.styleUri || 'mapbox://styles/mapbox/standard-satellite',
            center: config.center || [-48.45, -21.17],
            zoom: config.zoom || 12,
        });

        // Nós aguardamos openMap retornar. O mapa nativo é renderizado no container da MainActivity, por trás dos overlays web.
        // Não vamos jogar exceção com base em _lastNativeError para não derrubar a promise do JS
        // porque openMap já resolveu com sucesso ao enviar o Intent. Os erros são apenas informativos.
        // Se a view nativa falhar gravemente (offline missing final), o próprio nativo pode fechar,
        // ou o usuário clica no "X". Não quebramos o estado do frontend com throw error para alertas transitórios.

        if (this._lastOfflineMissing?.message) {
            // Este caso (offline missing) continua sendo útil jogar para trás para a UI voltar ao estado normal
            // caso o mapa tenha fechado por falta de arquivo.
            const error = new Error(this._lastOfflineMissing.message);
            error.code = this._lastOfflineMissing.code || 'offline_package_missing';
            error.details = this._lastOfflineMissing.details || null;
            throw error;
        }

        return result;
    }

    async closeMap() {
        const plugin = this._ensurePlugin();
        try {
            await plugin.closeMap();
        } catch (e) {
            console.warn('[AndroidNativeMapProvider] closeMap error', e);
        }
    }

    async loadTalhoes(geojson) {
        const plugin = this._ensurePlugin();
        return plugin.loadTalhoes({ geojson: JSON.stringify(geojson) });
    }

    async loadArmadilhas(geojson) {
        const plugin = this._ensurePlugin();
        return plugin.loadArmadilhas({ geojson: JSON.stringify(geojson) });
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
        if (this._nativeErrorListener) {
            await this._nativeErrorListener.remove();
            this._nativeErrorListener = null;
        }
        if (this._offlineMissingListener) {
            await this._offlineMissingListener.remove();
            this._offlineMissingListener = null;
        }
    }
}

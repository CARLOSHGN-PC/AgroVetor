// docs/js/services/NetworkManager.js

export const NetworkStatus = {
    ONLINE: 'ONLINE',
    OFFLINE: 'OFFLINE',
    UNSTABLE: 'UNSTABLE'
};

export class NetworkManager extends EventTarget {
    constructor({
        heartbeatUrl,
        heartbeatIntervalMs = 15000,
        heartbeatTimeoutMs = 4000,
        failureThreshold = 2,
        stableDelayMs = 4000
    } = {}) {
        super();
        this.heartbeatUrl = heartbeatUrl;
        this.heartbeatIntervalMs = heartbeatIntervalMs;
        this.heartbeatTimeoutMs = heartbeatTimeoutMs;
        this.failureThreshold = failureThreshold;
        this.stableDelayMs = stableDelayMs;

        this.browserOnline = navigator.onLine;
        this.status = this.browserOnline ? NetworkStatus.UNSTABLE : NetworkStatus.OFFLINE;
        this.failureCount = 0;
        this.heartbeatTimer = null;
        this.stableTimer = null;
        this.nativeListener = null;

        this._handleOnline = this._handleOnline.bind(this);
        this._handleOffline = this._handleOffline.bind(this);
    }

    start() {
        window.addEventListener('online', this._handleOnline);
        window.addEventListener('offline', this._handleOffline);

        this._setupNativeListener();

        if (this.browserOnline) {
            this._startHeartbeat();
        } else {
            this._setStatus(NetworkStatus.OFFLINE, { source: 'init' });
        }
    }

    stop() {
        window.removeEventListener('online', this._handleOnline);
        window.removeEventListener('offline', this._handleOffline);
        this._teardownNativeListener();
        this._stopHeartbeat();
    }

    getStatus() {
        return this.status;
    }

    async checkInternet() {
        if (!this.heartbeatUrl) return false;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.heartbeatTimeoutMs);

        try {
            const response = await fetch(this.heartbeatUrl, {
                method: 'GET',
                cache: 'no-store',
                headers: {
                    'Cache-Control': 'no-store'
                },
                signal: controller.signal
            });
            return response.ok;
        } catch (error) {
            return false;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    async _runHeartbeat() {
        if (!this.browserOnline) return;

        const isOnline = await this.checkInternet();
        if (isOnline) {
            this.failureCount = 0;
            this._scheduleStableOnline();
        } else {
            this.failureCount += 1;
            if (this.failureCount >= this.failureThreshold) {
                this._cancelStableOnline();
                this._setStatus(NetworkStatus.UNSTABLE, { source: 'heartbeat' });
            }
        }
    }

    _handleOnline() {
        this.browserOnline = true;
        this._setStatus(NetworkStatus.UNSTABLE, { source: 'browser' });
        this._startHeartbeat();
    }

    _handleOffline() {
        this.browserOnline = false;
        this.failureCount = 0;
        this._cancelStableOnline();
        this._stopHeartbeat();
        this._setStatus(NetworkStatus.OFFLINE, { source: 'browser' });
    }

    _startHeartbeat() {
        if (this.heartbeatTimer) return;
        this._runHeartbeat();
        this.heartbeatTimer = setInterval(() => this._runHeartbeat(), this.heartbeatIntervalMs);
    }

    _stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    _scheduleStableOnline() {
        if (this.status === NetworkStatus.ONLINE) return;
        if (this.stableTimer) return;

        this.stableTimer = setTimeout(() => {
            this.stableTimer = null;
            if (this.browserOnline) {
                this._setStatus(NetworkStatus.ONLINE, { source: 'heartbeat' });
            }
        }, this.stableDelayMs);
    }

    _cancelStableOnline() {
        if (this.stableTimer) {
            clearTimeout(this.stableTimer);
            this.stableTimer = null;
        }
    }

    _setStatus(status, meta = {}) {
        if (this.status === status) return;
        this.status = status;
        this.dispatchEvent(new CustomEvent('connectivity:changed', {
            detail: {
                status,
                browserOnline: this.browserOnline,
                timestamp: Date.now(),
                ...meta
            }
        }));
    }

    _setupNativeListener() {
        if (!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform())) return;
        const networkPlugin = Capacitor.Plugins?.Network;
        if (!networkPlugin) return;

        this.nativeListener = networkPlugin.addListener('networkStatusChange', (status) => {
            if (status.connected) {
                this._handleOnline();
            } else {
                this._handleOffline();
            }
        });

        networkPlugin.getStatus()
            .then((status) => {
                if (status.connected) {
                    this._handleOnline();
                } else {
                    this._handleOffline();
                }
            })
            .catch(() => {
                // Ignore failures; browser events will handle fallback.
            });
    }

    _teardownNativeListener() {
        if (this.nativeListener && typeof this.nativeListener.remove === 'function') {
            this.nativeListener.remove();
        }
        this.nativeListener = null;
    }
}

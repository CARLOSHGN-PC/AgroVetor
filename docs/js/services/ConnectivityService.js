export class ConnectivityService {
    constructor({ backendUrl, onStatusChange, logger } = {}) {
        this.backendUrl = backendUrl;
        this.onStatusChange = onStatusChange;
        this.logger = logger || (() => {});
        this.state = {
            isOnline: navigator.onLine,
            lastChangeAt: new Date().toISOString(),
            connectionType: null,
            reason: 'init'
        };
        this.backoffMs = 1000;
        this.maxBackoffMs = 30000;
        this.pendingCheck = null;
        this.retryTimeout = null;
        this.boundHandlers = [];
    }

    init() {
        this.updateConnectionType();
        this.setupBrowserListeners();
        this.setupCapacitorListeners();
        this.emitChange('init');
        if (this.state.isOnline) {
            this.confirmOnline('init');
        }
    }

    updateConnectionType(typeOverride = null) {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        const type = typeOverride || (connection ? connection.effectiveType : null);
        this.state.connectionType = type;
    }

    setupBrowserListeners() {
        const onlineHandler = () => this.handleOnline('browser-online');
        const offlineHandler = () => this.handleOffline('browser-offline');
        window.addEventListener('online', onlineHandler);
        window.addEventListener('offline', offlineHandler);
        this.boundHandlers.push(['online', onlineHandler], ['offline', offlineHandler]);
    }

    setupCapacitorListeners() {
        if (!window.Capacitor || !Capacitor.Plugins || !Capacitor.Plugins.Network) {
            return;
        }

        const { Network } = Capacitor.Plugins;
        Network.getStatus()
            .then(status => {
                this.updateConnectionType(status.connectionType || null);
                if (status.connected) {
                    this.handleOnline('capacitor-init');
                } else {
                    this.handleOffline('capacitor-init');
                }
            })
            .catch(error => {
                this.logger('connectivity:capacitor:init_error', { error: error?.message || error });
            });

        Network.addListener('networkStatusChange', (status) => {
            this.updateConnectionType(status.connectionType || null);
            if (status.connected) {
                this.handleOnline('capacitor-online');
            } else {
                this.handleOffline('capacitor-offline');
            }
        });
    }

    handleOnline(reason) {
        this.clearRetry();
        this.setState({ isOnline: true }, reason);
        this.confirmOnline(reason);
    }

    handleOffline(reason) {
        this.clearRetry();
        this.setState({ isOnline: false }, reason);
        this.resetBackoff();
    }

    async confirmOnline(reason) {
        if (this.pendingCheck) return;
        this.pendingCheck = this.checkInternet()
            .then((ok) => {
                if (ok) {
                    this.resetBackoff();
                    this.setState({ isOnline: true }, 'confirmed');
                } else {
                    this.setState({ isOnline: false }, 'no-internet');
                    this.scheduleRetry();
                }
            })
            .catch((error) => {
                this.logger('connectivity:check_error', { error: error?.message || error });
                this.setState({ isOnline: false }, 'check-error');
                this.scheduleRetry();
            })
            .finally(() => {
                this.pendingCheck = null;
            });
    }

    async checkInternet() {
        const url = this.backendUrl || 'https://www.gstatic.com/generate_204';
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);

        try {
            await fetch(url, {
                method: 'HEAD',
                mode: 'no-cors',
                cache: 'no-store',
                signal: controller.signal
            });
            return true;
        } catch (error) {
            this.logger('connectivity:check_failed', { error: error?.message || error });
            return false;
        } finally {
            clearTimeout(timeout);
        }
    }

    scheduleRetry() {
        if (this.retryTimeout) return;
        const delay = this.backoffMs;
        this.retryTimeout = setTimeout(() => {
            this.retryTimeout = null;
            if (navigator.onLine) {
                this.confirmOnline('backoff');
            }
        }, delay);
        this.backoffMs = Math.min(this.backoffMs * 2, this.maxBackoffMs);
    }

    resetBackoff() {
        this.backoffMs = 1000;
    }

    clearRetry() {
        if (this.retryTimeout) {
            clearTimeout(this.retryTimeout);
            this.retryTimeout = null;
        }
    }

    setState(next, reason) {
        const prev = this.state;
        const changed = prev.isOnline !== next.isOnline || prev.connectionType !== next.connectionType;
        this.state = {
            ...prev,
            ...next,
            lastChangeAt: new Date().toISOString(),
            reason
        };
        if (changed) {
            this.emitChange(reason);
        }
    }

    emitChange(reason) {
        this.logger('connectivity:change', { ...this.state, reason });
        if (typeof this.onStatusChange === 'function') {
            this.onStatusChange({ ...this.state });
        }
    }

    destroy() {
        this.boundHandlers.forEach(([event, handler]) => window.removeEventListener(event, handler));
        this.boundHandlers = [];
        this.clearRetry();
    }
}

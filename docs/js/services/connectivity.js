
const ConnectivityService = {
    isOnline: navigator.onLine,
    lastChangeAt: new Date(),
    listeners: [],

    init() {
        this.updateStatus(navigator.onLine);

        window.addEventListener('online', () => {
            this.updateStatus(true);
        });

        window.addEventListener('offline', () => {
            this.updateStatus(false);
        });

        if (window.Capacitor && window.Capacitor.isNativePlatform()) {
            this._initNativeListeners();
        }
    },

    async _initNativeListeners() {
        try {
            const { Network } = window.Capacitor.Plugins;
            const status = await Network.getStatus();
            this.updateStatus(status.connected);

            Network.addListener('networkStatusChange', (status) => {
                this.updateStatus(status.connected);
            });
        } catch (e) {
            console.error("ConnectivityService: Error initializing native listeners", e);
        }
    },

    updateStatus(isOnline) {
        if (this.isOnline !== isOnline) {
            this.isOnline = isOnline;
            this.lastChangeAt = new Date();
            console.log(`ConnectivityService: Status changed to ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
            this._notifyListeners(isOnline);
            this._dispatchGlobalEvent(isOnline);
        }
    },

    addListener(callback) {
        this.listeners.push(callback);
    },

    _notifyListeners(isOnline) {
        this.listeners.forEach(callback => callback(isOnline));
    },

    _dispatchGlobalEvent(isOnline) {
        const event = new CustomEvent('app:connectivity-changed', {
            detail: { isOnline, timestamp: this.lastChangeAt }
        });
        window.dispatchEvent(event);
    },

    // Lightweight check to confirm actual internet access
    async checkConnectionStrength() {
        if (!this.isOnline) return false;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            // Use a lightweight resource that is likely to be available and not cached aggressively
            // using current timestamp to bypass cache
            await fetch(`https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js?_=${Date.now()}`, {
                method: 'HEAD',
                mode: 'no-cors',
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return true;
        } catch (e) {
            console.warn("ConnectivityService: Connection check failed despite navigator.onLine being true.", e);
            return false;
        }
    }
};

export default ConnectivityService;

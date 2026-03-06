import { WebMapProvider } from './WebMapProvider.js';
import { AndroidNativeMapProvider } from './AndroidNativeMapProvider.js';

const isNativeEnabled = () => {
    return Boolean(window?.Capacitor && window.Capacitor.isNativePlatform?.() && window.Capacitor.getPlatform?.() === 'android');
};

export function createAerialMapProvider({ app }) {
    if (isNativeEnabled() && AndroidNativeMapProvider.isSupported()) {
        return new AndroidNativeMapProvider({ app });
    }

    return new WebMapProvider({ app });
}

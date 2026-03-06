import { WebMapProvider } from './WebMapProvider.js';
import { AndroidNativeMapProvider } from './AndroidNativeMapProvider.js';

const isNativeEnabled = () => {
    const cap = window?.Capacitor;
    if (!cap) return false;

    const platform = cap.getPlatform?.();
    const isAndroid = platform === 'android';
    const isNative = cap.isNativePlatform?.() === true;
    return isAndroid && isNative;
};

export function createAerialMapProvider({ app }) {
    if (isNativeEnabled() && AndroidNativeMapProvider.isSupported()) {
        return new AndroidNativeMapProvider({ app });
    }

    return new WebMapProvider({ app });
}

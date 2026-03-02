import { WebMapProvider } from './WebMapProvider.js';
import { AndroidNativeMapProvider } from './AndroidNativeMapProvider.js';

const isNativeEnabled = () => {
    if (window?.APP_CONFIG?.enableNativeAerialMap === true) return true;
    return localStorage.getItem('AGV_NATIVE_AERIAL_MAP') === '1';
};

export function createAerialMapProvider({ app }) {
    if (isNativeEnabled() && AndroidNativeMapProvider.isSupported()) {
        return new AndroidNativeMapProvider({ app });
    }

    return new WebMapProvider({ app });
}

import { WebMapProvider } from './WebMapProvider.js';
import { AndroidNativeMapProvider } from './AndroidNativeMapProvider.js';

const isNativeEnabled = () => {
    return Boolean(window?.Capacitor && window.Capacitor.isNativePlatform?.() && window.Capacitor.getPlatform?.() === 'android');
};

const isNativeAerialMapOptInEnabled = () => {
    // O fluxo padrão do Monitoramento Aéreo deve permanecer dentro da WebView,
    // reproduzindo o mesmo comportamento do PWA. O mapa nativo em Activity
    // separada só deve ser usado por opt-in explícito.
    return window?.AGROVETOR_ENABLE_NATIVE_AERIAL_MAP === true;
};

export function createAerialMapProvider({ app }) {
    if (isNativeEnabled() && isNativeAerialMapOptInEnabled() && AndroidNativeMapProvider.isSupported()) {
        return new AndroidNativeMapProvider({ app });
    }

    return new WebMapProvider({ app });
}

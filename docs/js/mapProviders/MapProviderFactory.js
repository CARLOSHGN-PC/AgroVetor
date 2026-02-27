import { WebMapProvider } from './WebMapProvider.js';
import { AndroidNativeMapProvider } from './AndroidNativeMapProvider.js';

const getNativeDecisionContext = () => {
    const cap = window?.Capacitor;
    const platform = cap?.getPlatform?.() || 'web';
    const isNativePlatform = Boolean(cap?.isNativePlatform?.());
    const isAndroidNative = Boolean(isNativePlatform && platform === 'android');
    const pluginAvailable = Boolean(
        cap?.isPluginAvailable?.('AerialMap')
        || cap?.Plugins?.AerialMap
        || cap?.registerPlugin
    );
    const appConfigFlag = window?.APP_CONFIG?.enableNativeAerialMap;
    const localStorageFlag = localStorage.getItem('AGV_NATIVE_AERIAL_MAP');
    const manualFlagEnabled = appConfigFlag === true || localStorageFlag === '1';

    return {
        platform,
        isNativePlatform,
        isAndroidNative,
        pluginAvailable,
        appConfigFlag,
        localStorageFlag,
        manualFlagEnabled,
        shouldUseNative: isAndroidNative && pluginAvailable
    };
};

export function createAerialMapProvider({ app, forceWeb = false } = {}) {
    const context = getNativeDecisionContext();

    console.info('[AEREO_OFFLINE] provider decision context:', {
        platform: context.platform,
        isNativePlatform: context.isNativePlatform,
        isAndroidNative: context.isAndroidNative,
        pluginAvailable: context.pluginAvailable,
        manualFlagEnabled: context.manualFlagEnabled,
        appConfigFlag: context.appConfigFlag,
        localStorageFlag: context.localStorageFlag
    });

    if (!forceWeb && context.shouldUseNative && AndroidNativeMapProvider.isSupported()) {
        console.info('[AEREO_OFFLINE] provider final escolhido: android-native');
        return new AndroidNativeMapProvider({ app });
    }

    if (forceWeb) {
        console.info('[AEREO_OFFLINE] provider forçado: web (fallback pós-falha nativa)');
    }
    console.info('[AEREO_OFFLINE] provider final escolhido: web');
    return new WebMapProvider({ app });
}

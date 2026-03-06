package com.agrovetor.app.aerial;

import android.content.Context;
import android.text.TextUtils;
import android.util.Log;

import androidx.annotation.NonNull;

import com.mapbox.common.MapboxOptions;
import com.mapbox.common.TileStore;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;

import com.mapbox.maps.MapboxMapsOptions;
import com.mapbox.maps.OfflineManager;
import com.mapbox.maps.TileStoreUsageMode;

import java.io.File;
public final class AerialMapboxRuntime {
    private static final String TAG = "AerialOfflineDebug";
    private static final String TILESTORE_DIR = "aerial_mapbox_tiles";

    private static volatile Context appContext;
    private static volatile TileStore tileStore;
    private static volatile OfflineManager offlineManager;

    private AerialMapboxRuntime() {}

    public static void init(@NonNull Context context) {
        if (appContext == null) {
            synchronized (AerialMapboxRuntime.class) {
                if (appContext == null) {
                    appContext = context.getApplicationContext();
                    Log.i(TAG, "Mapbox runtime init: appContext set");
                }
            }
        }
    }

    @NonNull
    public static TileStore getTileStore(@NonNull Context context) {
        init(context);
        if (tileStore == null) {
            synchronized (AerialMapboxRuntime.class) {
                if (tileStore == null) {
                    tileStore = createTileStore();
                }
            }
        }
        return tileStore;
    }

    @NonNull
    public static OfflineManager getOfflineManager(@NonNull Context context) {
        init(context);
        if (offlineManager == null) {
            synchronized (AerialMapboxRuntime.class) {
                if (offlineManager == null) {
                    offlineManager = createOfflineManager();
                }
            }
        }
        return offlineManager;
    }

    public static void configureMapbox(@NonNull Context context, @NonNull String accessToken) {
        init(context);
        String normalizedToken = accessToken == null ? "" : accessToken.trim();
        if (TextUtils.isEmpty(normalizedToken)) {
            throw new IllegalArgumentException("Access token Mapbox vazio ao configurar runtime.");
        }

        MapboxOptions.setAccessToken(normalizedToken);
        Log.i(TAG, "Access token Mapbox configurado no runtime global");

        TileStore runtimeTileStore = getTileStore(context);
        MapboxMapsOptions.setTileStore(runtimeTileStore);
        boolean networkAvailable = isNetworkAvailable(context);
        // O TileStoreUsageMode DEVE ser permanentemente READ_AND_UPDATE no Mapbox v11
        // para evitar falhas de inicialização com recursos offline não cacheados 100%.
        TileStoreUsageMode usageMode = TileStoreUsageMode.READ_AND_UPDATE;
        MapboxMapsOptions.setTileStoreUsageMode(usageMode);
        Log.i(TAG, "TileStore e TileStoreUsageMode configurados no runtime global antes da criação do MapView."
                + " path=" + getTileStorePath()
                + " usageMode=" + usageMode
                + " networkAvailable=" + networkAvailable);

        getOfflineManager(context);
        Log.i(TAG, "Runtime Mapbox v11 inicializado: token global, TileStore persistente e OfflineManager prontos");
    }

    private static TileStore createTileStore() {
        File baseDir = new File(appContext.getFilesDir(), TILESTORE_DIR);
        if (!baseDir.exists() && !baseDir.mkdirs()) {
            Log.w(TAG, "Não foi possível criar diretório de TileStore: " + baseDir.getAbsolutePath());
        }

        String path = baseDir.getAbsolutePath();
        try {
            TileStore store = TileStore.create(path);
            Log.i(TAG, "TileStore singleton criado com path persistente: " + path);
            return store;
        } catch (Exception error) {
            Log.e(TAG, "Falha ao criar TileStore com path persistente: " + path, error);
            throw new IllegalStateException("Falha ao criar TileStore persistente em " + path, error);
        }
    }

    @NonNull
    public static String getTileStorePath() {
        if (appContext == null) {
            return "<uninitialized>";
        }
        return new File(appContext.getFilesDir(), TILESTORE_DIR).getAbsolutePath();
    }

    private static OfflineManager createOfflineManager() {
        OfflineManager manager = new OfflineManager();
        Log.i(TAG, "OfflineManager singleton criado com construtor padrão");
        return manager;
    }

    private static boolean isNetworkAvailable(Context context) {
        return NetworkUtils.isNetworkAvailable(context);
    }
}

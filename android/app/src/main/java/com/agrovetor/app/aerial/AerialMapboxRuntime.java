package com.agrovetor.app.aerial;

import android.content.Context;
import android.text.TextUtils;
import android.util.Log;

import androidx.annotation.NonNull;

import com.mapbox.common.TileStore;
import com.mapbox.maps.OfflineManager;
import com.mapbox.maps.ResourceOptions;
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

    @NonNull
    public static ResourceOptions createResourceOptions(@NonNull Context context, @NonNull String accessToken) {
        init(context);
        String normalizedToken = accessToken == null ? "" : accessToken.trim();
        if (TextUtils.isEmpty(normalizedToken)) {
            Log.e(TAG, "Access token Mapbox vazio ao criar ResourceOptions.");
        }

        TileStore singletonStore = getTileStore(context);
        ResourceOptions options = new ResourceOptions.Builder()
                .accessToken(normalizedToken)
                .tileStore(singletonStore)
                .tileStoreUsageMode(TileStoreUsageMode.READ_AND_UPDATE)
                .build();

        Log.i(TAG, "ResourceOptions criado com TileStore singleton persistente e mode=READ_AND_UPDATE");
        return options;
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

    private static OfflineManager createOfflineManager() {
        try {
            OfflineManager manager = OfflineManager.class.getDeclaredConstructor(Context.class).newInstance(appContext);
            Log.i(TAG, "OfflineManager singleton criado com contexto da aplicação");
            return manager;
        } catch (Exception firstError) {
            Log.w(TAG, "OfflineManager(Context) indisponível, tentando construtor padrão: " + firstError.getMessage());
            OfflineManager manager = new OfflineManager();
            Log.i(TAG, "OfflineManager singleton criado com construtor padrão");
            return manager;
        }
    }
}

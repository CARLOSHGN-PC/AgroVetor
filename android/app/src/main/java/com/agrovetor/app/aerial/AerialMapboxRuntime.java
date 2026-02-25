package com.agrovetor.app.aerial;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;

import com.mapbox.common.TileStore;
import com.mapbox.maps.MapboxMap;
import com.mapbox.maps.OfflineManager;

import java.io.File;
import java.lang.reflect.Method;

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

    public static void applyTileStoreToMapboxMap(@NonNull MapboxMap mapboxMap, @NonNull Context context) {
        TileStore store = getTileStore(context);
        try {
            Method setTileStore = mapboxMap.getClass().getMethod("setTileStore", TileStore.class);
            setTileStore.invoke(mapboxMap, store);
            Log.i(TAG, "MapboxMap.setTileStore aplicado com sucesso");
        } catch (Exception error) {
            Log.w(TAG, "MapboxMap.setTileStore indisponível: " + error.getMessage());
        }

        try {
            Class<?> usageModeClass = Class.forName("com.mapbox.maps.TileStoreUsageMode");
            Object readOnlyOrReadAndUpdate = usageModeClass.getField("READ_ONLY").get(null);
            Method setMode = mapboxMap.getClass().getMethod("setTileStoreUsageMode", usageModeClass);
            setMode.invoke(mapboxMap, readOnlyOrReadAndUpdate);
            Log.i(TAG, "TileStoreUsageMode aplicado: READ_ONLY");
        } catch (Exception firstError) {
            try {
                Class<?> usageModeClass = Class.forName("com.mapbox.maps.TileStoreUsageMode");
                Object readAndUpdate = usageModeClass.getField("READ_AND_UPDATE").get(null);
                Method setMode = mapboxMap.getClass().getMethod("setTileStoreUsageMode", usageModeClass);
                setMode.invoke(mapboxMap, readAndUpdate);
                Log.i(TAG, "TileStoreUsageMode aplicado: READ_AND_UPDATE");
            } catch (Exception secondError) {
                Log.w(TAG, "TileStoreUsageMode indisponível: " + secondError.getMessage());
            }
        }
    }

    private static TileStore createTileStore() {
        File baseDir = new File(appContext.getFilesDir(), TILESTORE_DIR);
        if (!baseDir.exists() && !baseDir.mkdirs()) {
            Log.w(TAG, "Não foi possível criar diretório de TileStore: " + baseDir.getAbsolutePath());
        }

        String path = baseDir.getAbsolutePath();
        try {
            Method createWithPath = TileStore.class.getMethod("create", String.class);
            TileStore store = (TileStore) createWithPath.invoke(null, path);
            Log.i(TAG, "TileStore singleton criado com path persistente: " + path);
            return store;
        } catch (Exception firstError) {
            Log.w(TAG, "TileStore.create(path) indisponível, usando padrão. path=" + path + " err=" + firstError.getMessage());
            TileStore store = TileStore.create();
            Log.i(TAG, "TileStore singleton criado com configuração padrão");
            return store;
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

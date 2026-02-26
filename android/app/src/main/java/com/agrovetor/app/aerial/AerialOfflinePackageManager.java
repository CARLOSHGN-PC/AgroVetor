package com.agrovetor.app.aerial;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;

import com.mapbox.common.NetworkRestriction;
import com.mapbox.common.TileRegion;
import com.mapbox.common.TileRegionLoadOptions;
import com.mapbox.common.TileRegionLoadProgress;
import com.mapbox.common.TileStore;
import com.mapbox.common.TilesetDescriptor;
import com.mapbox.geojson.Point;
import com.mapbox.geojson.Polygon;
import com.mapbox.maps.OfflineManager;
import com.mapbox.maps.StylePackLoadOptions;
import com.mapbox.maps.StylePackLoadProgress;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

public class AerialOfflinePackageManager {
    private static final String TAG = "AerialOfflinePackage";

    public interface Listener {
        void onProgress(OfflineRegionMetadata metadata, int progress);

        void onFinished(OfflineRegionMetadata metadata);
    }

    private final Context context;
    private final OfflineManager offlineManager;
    private final TileStore tileStore;
    private final AerialOfflinePackageValidator validator;

    public AerialOfflinePackageManager(@NonNull Context context) {
        this.context = context.getApplicationContext();
        this.offlineManager = AerialMapboxRuntime.getOfflineManager(context);
        this.tileStore = AerialMapboxRuntime.getTileStore(context);
        this.validator = new AerialOfflinePackageValidator();
    }

    public void downloadPackage(@NonNull OfflineRegionMetadata metadata, @NonNull Listener listener) {
        metadata.status = AerialOfflinePackageStatus.DOWNLOADING;
        listener.onProgress(metadata, 0);
        TilesetDescriptor descriptor = createTilesetDescriptorCompat(metadata);
        if (descriptor == null) {
            metadata.status = AerialOfflinePackageStatus.ERROR;
            metadata.errorMessage = "Não foi possível criar TilesetDescriptor";
            listener.onFinished(metadata);
            return;
        }

        Log.i(TAG, "Início download pacote=" + metadata.packageId);
        StylePackLoadOptions stylePackLoadOptions = new StylePackLoadOptions.Builder().acceptExpired(true).build();
        offlineManager.loadStylePack(metadata.styleUri, stylePackLoadOptions, styleProgress -> listener.onProgress(metadata, calculateProgress(styleProgress, null)), styleExpected -> {
            if (styleExpected == null || styleExpected.isError()) {
                metadata.status = AerialOfflinePackageStatus.ERROR;
                metadata.errorMessage = "Falha no style pack: " + (styleExpected == null ? "desconhecida" : styleExpected.getError());
                Log.e(TAG, metadata.errorMessage);
                listener.onFinished(metadata);
                return;
            }
            Log.i(TAG, "Style pack concluído pacote=" + metadata.packageId);
            metadata.hasStylePack = true;
            startTileDownload(metadata, descriptor, listener);
        });
    }

    public void removePackage(@NonNull OfflineRegionMetadata metadata, @NonNull Listener listener) {
        metadata.status = AerialOfflinePackageStatus.REMOVING;
        metadata.errorMessage = null;
        listener.onProgress(metadata, 0);

        Thread worker = new Thread(() -> {
            AtomicBoolean hadError = new AtomicBoolean(false);
            StringBuilder errors = new StringBuilder();

            boolean tileRemoved = removeTileRegionSync(metadata.tileRegionId, metadata.packageId);
            listener.onProgress(metadata, 40);
            if (!tileRemoved) {
                hadError.set(true);
                errors.append("Falha ao remover tile region");
            }

            boolean styleRemoved = removeStylePackSync(metadata.stylePackId, metadata.styleUri);
            listener.onProgress(metadata, 80);
            if (!styleRemoved) {
                hadError.set(true);
                if (errors.length() > 0) {
                    errors.append("; ");
                }
                errors.append("Falha ao remover style pack");
            }

            metadata.hasTileRegion = false;
            metadata.hasStylePack = false;
            metadata.status = hadError.get() ? AerialOfflinePackageStatus.ERROR : AerialOfflinePackageStatus.REMOVED;
            metadata.errorMessage = hadError.get() ? errors.toString() : null;

            listener.onProgress(metadata, 100);
            listener.onFinished(metadata);
        });

        worker.setName("offline-remove-" + metadata.packageId);
        worker.start();
    }

    private boolean removeStylePackSync(String stylePackId, String styleUri) {
        String id = (stylePackId != null && !stylePackId.trim().isEmpty()) ? stylePackId : styleUri;
        if (id == null || id.trim().isEmpty()) {
            return true;
        }

        CountDownLatch latch = new CountDownLatch(1);
        AtomicBoolean success = new AtomicBoolean(false);
        try {
            Method method = offlineManager.getClass().getMethod("removeStylePack", String.class, Class.forName("com.mapbox.common.StylePackErrorCallback"));
            Class<?> callbackClass = Class.forName("com.mapbox.common.StylePackErrorCallback");
            Object callback = java.lang.reflect.Proxy.newProxyInstance(callbackClass.getClassLoader(), new Class[]{callbackClass}, (proxy, callbackMethod, args) -> {
                Object error = args != null && args.length > 0 ? args[0] : null;
                if (error == null) {
                    success.set(true);
                } else {
                    Log.w(TAG, "removeStylePack retornou erro id=" + id + " erro=" + error);
                }
                latch.countDown();
                return null;
            });
            method.invoke(offlineManager, id, callback);
            latch.await(4, TimeUnit.SECONDS);
            return success.get();
        } catch (NoSuchMethodException e) {
            Log.w(TAG, "removeStylePack indisponível no runtime, assumindo sucesso id=" + id);
            return true;
        } catch (Exception error) {
            Log.e(TAG, "Falha ao remover style pack id=" + id, error);
            return false;
        }
    }

    private boolean removeTileRegionSync(String tileRegionId, String fallbackId) {
        String id = (tileRegionId != null && !tileRegionId.trim().isEmpty()) ? tileRegionId : fallbackId;
        if (id == null || id.trim().isEmpty()) {
            return true;
        }

        CountDownLatch latch = new CountDownLatch(1);
        AtomicBoolean success = new AtomicBoolean(false);
        try {
            Method method = tileStore.getClass().getMethod("removeTileRegion", String.class, Class.forName("com.mapbox.common.TileRegionErrorCallback"));
            Class<?> callbackClass = Class.forName("com.mapbox.common.TileRegionErrorCallback");
            Object callback = java.lang.reflect.Proxy.newProxyInstance(callbackClass.getClassLoader(), new Class[]{callbackClass}, (proxy, callbackMethod, args) -> {
                Object error = args != null && args.length > 0 ? args[0] : null;
                if (error == null) {
                    success.set(true);
                } else {
                    Log.w(TAG, "removeTileRegion retornou erro id=" + id + " erro=" + error);
                }
                latch.countDown();
                return null;
            });
            method.invoke(tileStore, id, callback);
            latch.await(4, TimeUnit.SECONDS);
            return success.get();
        } catch (NoSuchMethodException e) {
            Log.w(TAG, "removeTileRegion indisponível no runtime, assumindo sucesso id=" + id);
            return true;
        } catch (Exception error) {
            Log.e(TAG, "Falha ao remover tile region id=" + id, error);
            return false;
        }
    }

    private void startTileDownload(@NonNull OfflineRegionMetadata metadata, @NonNull TilesetDescriptor descriptor, @NonNull Listener listener) {
        List<Point> ring = new ArrayList<>();
        ring.add(Point.fromLngLat(metadata.bounds[0], metadata.bounds[1]));
        ring.add(Point.fromLngLat(metadata.bounds[2], metadata.bounds[1]));
        ring.add(Point.fromLngLat(metadata.bounds[2], metadata.bounds[3]));
        ring.add(Point.fromLngLat(metadata.bounds[0], metadata.bounds[3]));
        ring.add(Point.fromLngLat(metadata.bounds[0], metadata.bounds[1]));
        Polygon polygon = Polygon.fromLngLats(Collections.singletonList(ring));

        TileRegionLoadOptions options = new TileRegionLoadOptions.Builder()
                .geometry(polygon)
                .descriptors(Collections.singletonList(descriptor))
                .acceptExpired(true)
                .networkRestriction(NetworkRestriction.NONE)
                .build();

        tileStore.loadTileRegion(metadata.tileRegionId, options, tileProgress -> listener.onProgress(metadata, calculateProgress(null, tileProgress)), tileExpected -> {
            if (tileExpected == null || tileExpected.isError()) {
                metadata.status = AerialOfflinePackageStatus.ERROR;
                metadata.errorMessage = "Falha na tile region: " + (tileExpected == null ? "desconhecida" : tileExpected.getError());
                Log.e(TAG, metadata.errorMessage);
                listener.onFinished(metadata);
                return;
            }
            TileRegion region = tileExpected.getValue();
            Log.i(TAG, "Tile region concluída id=" + (region != null ? region.getId() : metadata.tileRegionId));
            metadata.hasTileRegion = true;
            metadata.status = AerialOfflinePackageStatus.VALIDATING;
            listener.onProgress(metadata, 95);
            finalizeValidation(metadata, listener);
        });
    }

    private void finalizeValidation(@NonNull OfflineRegionMetadata metadata, @NonNull Listener listener) {
        AerialOfflinePackageValidator.ValidationResult result = validator.validate(context, metadata);
        metadata.hasStylePack = result.hasStylePack;
        metadata.hasTileRegion = result.hasTileRegion;
        metadata.hasTalhoes = result.hasTalhoes;
        metadata.hasArmadilhas = result.hasArmadilhas;
        metadata.lastValidatedAt = System.currentTimeMillis();
        metadata.errorMessage = result.errorMessage;
        metadata.status = result.isReady() ? AerialOfflinePackageStatus.READY : AerialOfflinePackageStatus.INCOMPLETE;
        Log.i(TAG, "Status final pacote=" + metadata.packageId + " status=" + metadata.status + (metadata.errorMessage != null ? " erro=" + metadata.errorMessage : ""));
        listener.onProgress(metadata, 100);
        listener.onFinished(metadata);
    }

    private int calculateProgress(StylePackLoadProgress styleProgress, TileRegionLoadProgress tileProgress) {
        if (tileProgress != null) {
            long required = tileProgress.getRequiredResourceCount();
            long completed = tileProgress.getCompletedResourceCount();
            if (required <= 0) return 0;
            return (int) Math.min(100, (completed * 100) / required);
        }
        if (styleProgress != null) {
            long required = styleProgress.getRequiredResourceCount();
            long completed = styleProgress.getCompletedResourceCount();
            if (required <= 0) return 0;
            return (int) Math.min(90, (completed * 90) / required);
        }
        return 0;
    }

    private TilesetDescriptor createTilesetDescriptorCompat(@NonNull OfflineRegionMetadata metadata) {
        try {
            for (Method method : offlineManager.getClass().getMethods()) {
                if (!"createTilesetDescriptor".equals(method.getName())) continue;
                Class<?>[] params = method.getParameterTypes();
                if (params.length == 4 && params[0] == String.class) {
                    Object descriptorObj = method.invoke(offlineManager, metadata.styleUri, metadata.minZoom, metadata.maxZoom, 1);
                    if (descriptorObj instanceof TilesetDescriptor) return (TilesetDescriptor) descriptorObj;
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Falha createTilesetDescriptor", e);
        }
        return null;
    }
}

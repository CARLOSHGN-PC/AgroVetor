package com.agrovetor.app.aerial;

import android.content.Context;
import android.util.Log;

import androidx.annotation.Nullable;

import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

public class AerialOfflinePackageValidator {
    private static final String TAG = "AerialOfflineValidator";

    public ValidationResult validate(Context context, OfflineRegionMetadata metadata) {
        RuntimeSnapshot snapshot = RuntimeSnapshot.resolve(context);

        boolean hasStylePack = metadata.stylePackId != null && snapshot.stylePackIds.contains(metadata.stylePackId);
        boolean hasTileRegion = metadata.tileRegionId != null && snapshot.tileRegionIds.contains(metadata.tileRegionId);
        boolean hasTalhoes = metadata.talhoesGeoJson != null && !metadata.talhoesGeoJson.trim().isEmpty();
        boolean hasArmadilhas = metadata.armadilhasGeoJson != null && !metadata.armadilhasGeoJson.trim().isEmpty();

        String error = null;
        if (!hasStylePack) {
            error = "Pacote offline incompleto: style pack ausente";
        } else if (!hasTileRegion) {
            error = "Pacote offline incompleto: tile region ausente";
        } else if (!hasTalhoes) {
            error = "Pacote offline incompleto: contornos não encontrados";
        } else if (!hasArmadilhas) {
            error = "Pacote offline incompleto: armadilhas não carregadas";
        }

        Log.i(TAG, "Validação pacote=" + metadata.packageId + " style=" + hasStylePack + " tile=" + hasTileRegion + " talhoes=" + hasTalhoes + " armadilhas=" + hasArmadilhas + (error != null ? " erro=" + error : ""));
        return new ValidationResult(hasStylePack, hasTileRegion, hasTalhoes, hasArmadilhas, error);
    }

    public static class ValidationResult {
        public final boolean hasStylePack;
        public final boolean hasTileRegion;
        public final boolean hasTalhoes;
        public final boolean hasArmadilhas;
        @Nullable
        public final String errorMessage;

        public ValidationResult(boolean hasStylePack, boolean hasTileRegion, boolean hasTalhoes, boolean hasArmadilhas, @Nullable String errorMessage) {
            this.hasStylePack = hasStylePack;
            this.hasTileRegion = hasTileRegion;
            this.hasTalhoes = hasTalhoes;
            this.hasArmadilhas = hasArmadilhas;
            this.errorMessage = errorMessage;
        }

        public boolean isReady() {
            return errorMessage == null;
        }
    }

    private static final class RuntimeSnapshot {
        private final Set<String> stylePackIds;
        private final Set<String> tileRegionIds;

        private RuntimeSnapshot(Set<String> stylePackIds, Set<String> tileRegionIds) {
            this.stylePackIds = stylePackIds;
            this.tileRegionIds = tileRegionIds;
        }

        private static RuntimeSnapshot resolve(Context context) {
            return new RuntimeSnapshot(getStylePackIds(context), getTileRegionIds(context));
        }

        private static Set<String> getStylePackIds(Context context) {
            Set<String> ids = new HashSet<>();
            try {
                Object manager = AerialMapboxRuntime.getOfflineManager(context);
                Method method = manager.getClass().getMethod("getAllStylePacks", Class.forName("com.mapbox.maps.StylePacksCallback"));
                CountDownLatch latch = new CountDownLatch(1);
                Class<?> callbackClass = Class.forName("com.mapbox.maps.StylePacksCallback");
                Object callback = Proxy.newProxyInstance(callbackClass.getClassLoader(), new Class[]{callbackClass}, (proxy, callbackMethod, args) -> {
                    if (args != null && args.length > 0) {
                        ids.addAll(extractStylePackIds(args[0]));
                    }
                    latch.countDown();
                    return null;
                });
                method.invoke(manager, callback);
                latch.await(4, TimeUnit.SECONDS);
            } catch (Exception error) {
                Log.w(TAG, "Falha ao listar style packs no runtime", error);
            }
            return ids;
        }

        private static Set<String> getTileRegionIds(Context context) {
            Set<String> ids = new HashSet<>();
            try {
                Object store = AerialMapboxRuntime.getTileStore(context);
                Method method = store.getClass().getMethod("getAllTileRegions", Class.forName("com.mapbox.common.TileRegionsCallback"));
                CountDownLatch latch = new CountDownLatch(1);
                Class<?> callbackClass = Class.forName("com.mapbox.common.TileRegionsCallback");
                Object callback = Proxy.newProxyInstance(callbackClass.getClassLoader(), new Class[]{callbackClass}, (proxy, callbackMethod, args) -> {
                    if (args != null && args.length > 0) {
                        ids.addAll(extractTileRegionIds(args[0]));
                    }
                    latch.countDown();
                    return null;
                });
                method.invoke(store, callback);
                latch.await(4, TimeUnit.SECONDS);
            } catch (Exception error) {
                Log.w(TAG, "Falha ao listar tile regions no runtime", error);
            }
            return ids;
        }

        private static Set<String> extractStylePackIds(Object callbackArg) {
            Set<String> ids = new HashSet<>();
            List<Object> items = extractListFromExpected(callbackArg);
            for (Object item : items) {
                String id = readStringGetter(item, "getStyleURI", "getStyleUri");
                if (id != null && !id.trim().isEmpty()) {
                    ids.add(id);
                }
            }
            return ids;
        }

        private static Set<String> extractTileRegionIds(Object callbackArg) {
            Set<String> ids = new HashSet<>();
            List<Object> items = extractListFromExpected(callbackArg);
            for (Object item : items) {
                String id = readStringGetter(item, "getId");
                if (id != null && !id.trim().isEmpty()) {
                    ids.add(id);
                }
            }
            return ids;
        }

        @SuppressWarnings("unchecked")
        private static List<Object> extractListFromExpected(Object callbackArg) {
            if (callbackArg == null) {
                return Collections.emptyList();
            }
            if (callbackArg instanceof List<?>) {
                return (List<Object>) callbackArg;
            }
            try {
                Method isValue = callbackArg.getClass().getMethod("isValue");
                Object value = isValue.invoke(callbackArg);
                if (value instanceof Boolean && !((Boolean) value)) {
                    return Collections.emptyList();
                }
                Method getValue = callbackArg.getClass().getMethod("getValue");
                Object list = getValue.invoke(callbackArg);
                if (list instanceof List<?>) {
                    return (List<Object>) list;
                }
            } catch (Exception ignored) {
            }
            return Collections.emptyList();
        }

        @Nullable
        private static String readStringGetter(Object target, String... names) {
            if (target == null) {
                return null;
            }
            for (String name : names) {
                try {
                    Method method = target.getClass().getMethod(name);
                    Object value = method.invoke(target);
                    if (value instanceof String) {
                        return (String) value;
                    }
                } catch (Exception ignored) {
                }
            }
            return null;
        }
    }
}

package com.agrovetor.app.aerial;

import android.app.Activity;
import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.widget.FrameLayout;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.agrovetor.app.R;
import com.agrovetor.app.plugins.AerialMapPlugin;
import com.mapbox.geojson.Feature;
import com.mapbox.geojson.FeatureCollection;
import com.mapbox.geojson.Point;
import com.mapbox.maps.CameraOptions;
import com.mapbox.maps.MapInitOptions;
import com.mapbox.maps.MapView;
import com.mapbox.maps.OfflineManager;
import com.mapbox.maps.QueriedRenderedFeature;
import com.mapbox.maps.RenderedQueryGeometry;
import com.mapbox.maps.RenderedQueryOptions;
import com.mapbox.maps.ScreenCoordinate;
import com.mapbox.maps.Style;
import com.mapbox.maps.extension.style.expressions.generated.Expression;
import com.mapbox.maps.extension.style.layers.generated.FillLayer;
import com.mapbox.maps.extension.style.layers.generated.LineLayer;
import com.mapbox.maps.extension.style.layers.generated.CircleLayer;
import com.mapbox.maps.extension.style.sources.generated.GeoJsonSource;
import com.mapbox.maps.plugin.Plugin;
import com.mapbox.maps.plugin.gestures.GesturesPlugin;
import com.mapbox.maps.plugin.gestures.OnMapClickListener;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

public class NativeAerialMapController implements OnMapClickListener {
    private static final String TAG = "AerialOfflineDebug";
    private static final String TALHOES_SOURCE = "native-talhoes-source";
    private static final String TALHOES_FILL_LAYER = "native-talhoes-fill";
    private static final String TALHOES_HIGHLIGHT_LAYER = "native-talhoes-highlight";
    private static final String TALHOES_BORDER_LAYER = "native-talhoes-border";

    private static final String ARMADILHAS_SOURCE = "native-armadilhas-source";
    private static final String ARMADILHAS_CIRCLE_LAYER = "native-armadilhas-circle";

    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private final Activity activity;
    private final FrameLayout container;
    private MapView mapView;

    @Nullable
    private GesturesPlugin gesturesPlugin;
    @Nullable
    private GeoJsonSource talhoesSource;
    @Nullable
    private FillLayer talhoesFillLayer;
    @Nullable
    private FillLayer talhoesHighlightLayer;
    @Nullable
    private LineLayer talhoesBorderLayer;
    @Nullable
    private Style talhoesStyle;

    @Nullable
    private GeoJsonSource armadilhasSource;
    @Nullable
    private CircleLayer armadilhasCircleLayer;

    @Nullable
    private Object mapLoadingErrorCancelable;
    private boolean styleReady;
    private boolean styleLoading;
    private int styleAttemptIndex;
    private List<String> styleFallbackChain = Collections.emptyList();
    private RuntimeOfflineSnapshot runtimeOfflineSnapshot = RuntimeOfflineSnapshot.empty();
    private boolean networkAvailableAtStart;
    private boolean hasAnyRuntimeOfflinePackage;
    @Nullable
    private String pendingTalhoesGeoJson;
    @Nullable
    private String pendingArmadilhasGeoJson;

    public NativeAerialMapController(Activity activity, FrameLayout container) {
        this.activity = activity;
        this.container = container;
        Log.i(TAG, "NativeAerialMapController.init");

        createMapViewWithOfflineRuntime();
        subscribeMapLoadingErrors();

        networkAvailableAtStart = isNetworkAvailable();
        List<OfflineRegionMetadata> metadataRegions = readOfflineMetadata(networkAvailableAtStart);

        registerPluginErrorForwarder();

        pendingTalhoesGeoJson = AerialMapSessionStore.talhoesGeoJson;
        pendingArmadilhasGeoJson = AerialMapSessionStore.armadilhasGeoJson;
        prepareStyleFallbackAndLoad(networkAvailableAtStart, metadataRegions);

        gesturesPlugin = (GesturesPlugin) mapView.getPlugin(Plugin.MAPBOX_GESTURES_PLUGIN_ID);
        if (gesturesPlugin != null) {
            gesturesPlugin.removeOnMapClickListener(this);
            gesturesPlugin.addOnMapClickListener(this);
        }
    }

    private void createMapViewWithOfflineRuntime() {
        String accessToken = activity.getString(R.string.mapbox_access_token);
        AerialMapboxRuntime.configureMapbox(activity.getApplicationContext(), accessToken);
        MapInitOptions mapInitOptions = new MapInitOptions(activity);
        mapView = new MapView(activity, mapInitOptions);
        container.addView(mapView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));
        Log.i(TAG, "MapView criado com MapInitOptions");
    }

    public void onStart() {
        Log.i(TAG, "NativeAerialMapController.onStart");
        if (mapView != null) {
            mapView.onStart();
        }
    }

    public void onStop() {
        Log.i(TAG, "NativeAerialMapController.onStop");
        if (mapView != null) {
            mapView.onStop();
        }
    }

    public void onLowMemory() {
        Log.w(TAG, "NativeAerialMapController.onLowMemory");
        if (mapView != null) {
            mapView.onLowMemory();
        }
    }

    public void onDestroy() {
        Log.i(TAG, "NativeAerialMapController.onDestroy");
        AerialMapPlugin.setNativeErrorHandler(null);
        if (gesturesPlugin != null) {
            gesturesPlugin.removeOnMapClickListener(this);
        }
        if (mapView != null) {
            mapView.onDestroy();
        }
    }

    public void reloadTalhoesIfVisible(String geojson) {
        AerialMapSessionStore.talhoesGeoJson = geojson;
        if (mapView == null) return;
        activity.runOnUiThread(() -> {
            pendingTalhoesGeoJson = geojson;
            if (!styleReady) return;
            mapView.getMapboxMap().getStyle(style -> {
                setupTalhoes(style, pendingTalhoesGeoJson);
                applyHighlight(style, AerialMapSessionStore.highlightedTalhaoId);
                pendingTalhoesGeoJson = null;
            });
        });
    }

    public void reloadArmadilhasIfVisible(String geojson) {
        AerialMapSessionStore.armadilhasGeoJson = geojson;
        if (mapView == null) return;
        activity.runOnUiThread(() -> {
            pendingArmadilhasGeoJson = geojson;
            if (!styleReady) return;
            mapView.getMapboxMap().getStyle(style -> {
                setupArmadilhas(style, pendingArmadilhasGeoJson);
                pendingArmadilhasGeoJson = null;
            });
        });
    }

    public void highlightTalhaoIfVisible(String talhaoId) {
        if (mapView == null) return;
        activity.runOnUiThread(() -> {
            if (!styleReady) return;
            mapView.getMapboxMap().getStyle(style -> applyHighlight(style, talhaoId));
        });
    }

    public void updateCameraIfVisible(double[] center, double zoom) {
        if (mapView == null) return;
        activity.runOnUiThread(() -> mapView.getMapboxMap().setCamera(
                new CameraOptions.Builder()
                        .center(Point.fromLngLat(center[0], center[1]))
                        .zoom(zoom)
                        .build()
        ));
    }

    private void setupCamera() {
        mapView.getMapboxMap().setCamera(new CameraOptions.Builder()
                .center(Point.fromLngLat(AerialMapSessionStore.center[0], AerialMapSessionStore.center[1]))
                .zoom(AerialMapSessionStore.zoom)
                .build());
    }

    private void prepareStyleFallbackAndLoad(boolean networkAvailable, List<OfflineRegionMetadata> regions) {
        runtimeOfflineSnapshot = RuntimeOfflineSnapshot.resolve(activity.getApplicationContext());

        List<OfflineRegionMetadata> readyRegions = new ArrayList<>();
        List<OfflineRegionMetadata> validRuntimeRegions = new ArrayList<>();
        int readyCount = 0;

        for (OfflineRegionMetadata r : regions) {
            if (AerialOfflinePackageStatus.READY.equals(r.status) || AerialOfflinePackageStatus.UPDATE_AVAILABLE.equals(r.status)) {
                readyRegions.add(r);
                readyCount++;
            }
            if (r.stylePackId != null && runtimeOfflineSnapshot.stylePackIds.contains(r.stylePackId)
                    && r.tileRegionId != null && runtimeOfflineSnapshot.tileRegionIds.contains(r.tileRegionId)) {
                validRuntimeRegions.add(r);
            }
        }

        hasAnyRuntimeOfflinePackage = !validRuntimeRegions.isEmpty();

        Log.i(TAG, "Abertura do mapa: online=" + networkAvailable + " totalRegioesMetadata=" + regions.size() + " readyMetadata=" + readyCount + " styleSessao=" + AerialMapSessionStore.styleUri);
        Log.i(TAG, "Snapshot Runtime Mapbox: packs=" + runtimeOfflineSnapshot.stylePackIds.size() + " tiles=" + runtimeOfflineSnapshot.tileRegionIds.size()
                + " tileStorePath=" + AerialMapboxRuntime.getTileStorePath());

        if (!networkAvailable && readyRegions.isEmpty()) {
            String reason = "Região offline não baixada. Conecte-se e baixe.";
            Log.w(TAG, "Abertura offline sem pacote pronto: " + reason);
            AerialMapPlugin.notifyOfflinePackageMissing(reason);
            return;
        }

        if (!networkAvailable && validRuntimeRegions.isEmpty()) {
            String reason = "Pacote offline inconsistente no runtime. Refaça o download online.";
            Log.e(TAG, "Falha na abertura offline: " + reason + " stylePacksReais=" + runtimeOfflineSnapshot.stylePackIds + " tileRegionsReais=" + runtimeOfflineSnapshot.tileRegionIds);
            AerialMapPlugin.notifyOfflinePackageMissing(reason);
            return;
        }

        List<OfflineRegionMetadata> styleCandidates = networkAvailable ? readyRegions : validRuntimeRegions;
        if ((pendingTalhoesGeoJson == null || pendingTalhoesGeoJson.trim().isEmpty()) && !styleCandidates.isEmpty()) {
            OfflineRegionMetadata fallbackRegion = styleCandidates.get(0);
            AerialMapSessionStore.center = new double[]{
                    (fallbackRegion.bounds[0] + fallbackRegion.bounds[2]) / 2,
                    (fallbackRegion.bounds[1] + fallbackRegion.bounds[3]) / 2
            };
            AerialMapSessionStore.zoom = fallbackRegion.minZoom;
            if (fallbackRegion.talhoesGeoJson != null) {
                pendingTalhoesGeoJson = fallbackRegion.talhoesGeoJson;
            }
            if (fallbackRegion.armadilhasGeoJson != null) {
                pendingArmadilhasGeoJson = fallbackRegion.armadilhasGeoJson;
            }
            Log.i(TAG, "Sessão sem GeoJSON/posição. Auto-fallback para área da primeira região: " + fallbackRegion.regionId);
        }

        setupCamera();

        Set<String> uniqueStyles = new LinkedHashSet<>();
        if (AerialMapSessionStore.styleUri != null && !AerialMapSessionStore.styleUri.trim().isEmpty()) {
            uniqueStyles.add(AerialMapSessionStore.styleUri);
        }
        for (OfflineRegionMetadata r : styleCandidates) {
            if (r.styleUri != null && !r.styleUri.trim().isEmpty()) {
                uniqueStyles.add(r.styleUri);
            }
        }
        styleFallbackChain = new ArrayList<>(uniqueStyles);
        styleAttemptIndex = 0;

        loadStyleWithFallback();
    }

    private void loadStyleWithFallback() {
        if (styleFallbackChain.isEmpty()) {
            Log.e(TAG, "Nenhum styleUri disponível para carregar mapa.");
            AerialMapPlugin.notifyOfflinePackageMissing("Nenhum estilo de mapa (styleUri) disponível para fallback offline.");
            return;
        }

        final String styleUri = styleFallbackChain.get(Math.min(styleAttemptIndex, styleFallbackChain.size() - 1));
        styleLoading = true;
        Log.i(TAG, "Carregando style (tentativa " + (styleAttemptIndex + 1) + "/" + styleFallbackChain.size() + "): " + styleUri);

        mapView.getMapboxMap().loadStyleUri(styleUri, style -> {
            Log.i(TAG, "Style carregado com sucesso: " + styleUri);
            styleLoading = false;
            styleReady = true;
            talhoesStyle = style;
            AerialMapSessionStore.styleUri = styleUri;
            setupTalhoes(style, pendingTalhoesGeoJson != null ? pendingTalhoesGeoJson : AerialMapSessionStore.talhoesGeoJson);
            setupArmadilhas(style, pendingArmadilhasGeoJson != null ? pendingArmadilhasGeoJson : AerialMapSessionStore.armadilhasGeoJson);
            applyHighlight(style, AerialMapSessionStore.highlightedTalhaoId);
            pendingTalhoesGeoJson = null;
            pendingArmadilhasGeoJson = null;
        });
    }

    private void subscribeMapLoadingErrors() {
        try {
            Class<?> mapLoadingErrorCallbackClass = Class.forName("com.mapbox.maps.MapLoadingErrorCallback");
            Object proxy = Proxy.newProxyInstance(
                    mapLoadingErrorCallbackClass.getClassLoader(),
                    new Class<?>[]{mapLoadingErrorCallbackClass},
                    (p, method, args) -> {
                        if ("onMapLoadingError".equals(method.getName()) && args != null && args.length == 1) {
                            Object mapLoadingError = args[0];
                            if (mapLoadingError != null) {
                                Method getTypeMethod = mapLoadingError.getClass().getMethod("getType");
                                Method getMessageMethod = mapLoadingError.getClass().getMethod("getMessage");
                                Object typeEnum = getTypeMethod.invoke(mapLoadingError);
                                String message = (String) getMessageMethod.invoke(mapLoadingError);
                                String typeStr = typeEnum != null ? typeEnum.toString() : "UNKNOWN";

                                Log.e(TAG, "MapLoadingError recebido do SDK: type=" + typeStr + " message=" + message);
                                handleMapLoadingError(typeStr, message);
                            }
                        }
                        return null;
                    }
            );

            Method subscribeMethod = mapView.getMapboxMap().getClass().getMethod("subscribeMapLoadingError", mapLoadingErrorCallbackClass);
            mapLoadingErrorCancelable = subscribeMethod.invoke(mapView.getMapboxMap(), proxy);
            Log.i(TAG, "Listener de MapLoadingError registrado com sucesso.");

        } catch (Exception error) {
            Log.e(TAG, "Falha ao registrar listener de MapLoadingError", error);
        }
    }

    private void handleMapLoadingError(String type, String message) {
        mainHandler.post(() -> {
            if ("STYLE".equals(type) && styleLoading) {
                Log.w(TAG, "Falha ao carregar estilo (MapLoadingError STYLE). type=" + type + " message=" + message);
                styleLoading = false;
                styleAttemptIndex++;
                if (styleAttemptIndex < styleFallbackChain.size()) {
                    loadStyleWithFallback();
                } else {
                    handleFinalStyleLoadFailure("MapLoadingError: STYLE");
                }
            } else {
                Log.w(TAG, "Erro não-fatal ou ignorado de carregamento do Mapbox: type=" + type + ", message=" + message);
            }
        });
    }

    private void handleFinalStyleLoadFailure(String reason) {
        Log.e(TAG, "Falha final ao carregar estilo. reason=" + reason + ", attempts=" + styleFallbackChain);
        AerialMapPlugin.notifyOfflinePackageMissing("Mapa offline indisponível para o zoom/área atual. Ajuste o zoom ou baixe novamente.");
    }

    private List<OfflineRegionMetadata> readOfflineMetadata(boolean networkAvailable) {
        List<OfflineRegionMetadata> regions = new AerialOfflineRegionStore(activity.getApplicationContext()).readAll();
        boolean readyRegionExists = false;
        for (OfflineRegionMetadata r : regions) {
            if (AerialOfflinePackageStatus.READY.equals(r.status)) {
                readyRegionExists = true;
                break;
            }
        }
        if (!networkAvailable && !readyRegionExists && !regions.isEmpty()) {
            Log.w(TAG, "Offline mas nenhum pacote pronto. regions=" + regions.size());
        }
        return regions;
    }

    private void setupArmadilhas(Style style, @Nullable String geojson) {
        if (geojson == null || geojson.trim().isEmpty()) {
            return;
        }
        try {
            FeatureCollection featureCollection = FeatureCollection.fromJson(geojson);

            if (talhoesStyle != style) {
                armadilhasSource = null;
                armadilhasCircleLayer = null;
            }

            if (armadilhasSource == null) {
                armadilhasSource = new GeoJsonSource.Builder(ARMADILHAS_SOURCE)
                        .featureCollection(featureCollection)
                        .build();
                armadilhasSource.bindTo(style);
            } else {
                armadilhasSource.featureCollection(featureCollection);
            }

            if (armadilhasCircleLayer == null) {
                armadilhasCircleLayer = new CircleLayer(ARMADILHAS_CIRCLE_LAYER, ARMADILHAS_SOURCE)
                        .circleRadius(6.0)
                        .circleColor(Expression.rgb(255.0, 87.0, 34.0)) // Deep Orange
                        .circleStrokeColor(Expression.rgb(255.0, 255.0, 255.0))
                        .circleStrokeWidth(2.0);
                armadilhasCircleLayer.bindTo(style);
            }

        } catch (Exception error) {
            Log.e(TAG, "Falha ao desenhar armadilhas", error);
        }
    }

    private void setupTalhoes(Style style, @Nullable String geojson) {
        if (geojson == null || geojson.trim().isEmpty()) {
            return;
        }
        try {
            FeatureCollection featureCollection = FeatureCollection.fromJson(geojson);

            if (talhoesStyle != style) {
                talhoesSource = null;
                talhoesFillLayer = null;
                talhoesHighlightLayer = null;
                talhoesBorderLayer = null;
                talhoesStyle = style;
            }

            if (talhoesSource == null) {
                talhoesSource = new GeoJsonSource.Builder(TALHOES_SOURCE)
                        .featureCollection(featureCollection)
                        .build();
                talhoesSource.bindTo(style);
            } else {
                talhoesSource.featureCollection(featureCollection);
            }

            if (talhoesFillLayer == null) {
                talhoesFillLayer = new FillLayer(TALHOES_FILL_LAYER, TALHOES_SOURCE)
                        .fillOpacity(0.45)
                        .fillColor(Expression.rgb(27.0, 94.0, 32.0));
                talhoesFillLayer.bindTo(style);
            }

            if (talhoesHighlightLayer == null) {
                talhoesHighlightLayer = new FillLayer(TALHOES_HIGHLIGHT_LAYER, TALHOES_SOURCE)
                        .fillOpacity(0.8)
                        .fillColor(Expression.rgb(255.0, 235.0, 59.0))
                        .filter(Expression.literal(false));
                talhoesHighlightLayer.bindTo(style);
            }

            if (talhoesBorderLayer == null) {
                talhoesBorderLayer = new LineLayer(TALHOES_BORDER_LAYER, TALHOES_SOURCE)
                        .lineColor(Expression.rgb(255.0, 255.0, 255.0))
                        .lineWidth(2.0);
                talhoesBorderLayer.bindTo(style);
            }
        } catch (Exception error) {
            Log.e(TAG, "Falha ao desenhar talhões", error);
        }
    }

    private void applyHighlight(Style style, String talhaoId) {
        try {
            if (talhoesHighlightLayer == null) return;

            if (talhaoId != null && !talhaoId.trim().isEmpty()) {
                Expression filter = Expression.eq(Expression.get("id"), Expression.literal(talhaoId));
                talhoesHighlightLayer.filter(filter);
            } else {
                talhoesHighlightLayer.filter(Expression.literal(false));
            }
        } catch (Exception e) {
            Log.e(TAG, "Falha ao aplicar highlight", e);
        }
    }

    @Override
    public boolean onMapClick(@NonNull Point point) {
        if (mapView == null) return false;

        ScreenCoordinate pixel = mapView.getMapboxMap().pixelForCoordinate(point);
        RenderedQueryGeometry geometry = new RenderedQueryGeometry(pixel);
        List<String> layerIds = new ArrayList<>();
        layerIds.add(TALHOES_FILL_LAYER);
        RenderedQueryOptions options = new RenderedQueryOptions(layerIds, null);

        mapView.getMapboxMap().queryRenderedFeatures(geometry, options, features -> {
            List<QueriedRenderedFeature> resultList = extractRenderedFeatures(features);
            if (resultList != null && !resultList.isEmpty()) {
                Feature feature = resultList.get(0).getQueriedFeature().getFeature();
                Log.i(TAG, "Talhão clicado. dispatching para bridge Capacitor.");
                AerialMapPlugin.notifyTalhaoClick(feature.toJson());
            } else {
                Log.i(TAG, "Clique no mapa não interceptou nenhum talhão.");
            }
        });
        return false;
    }

    @SuppressWarnings("unchecked")
    private List<QueriedRenderedFeature> extractRenderedFeatures(Object queryFeatures) {
        if (queryFeatures == null) return null;
        try {
            Method isValueMethod = queryFeatures.getClass().getMethod("isValue");
            Boolean isValue = (Boolean) isValueMethod.invoke(queryFeatures);
            if (isValue != null && !isValue) {
                return null;
            }

            Method getValueMethod = queryFeatures.getClass().getMethod("getValue");
            Object value = getValueMethod.invoke(queryFeatures);
            if (value instanceof List<?>) {
                return (List<QueriedRenderedFeature>) value;
            }
        } catch (Exception error) {
            Log.w(TAG, "Falha ao extrair retorno de queryRenderedFeatures", error);
        }

        return null;
    }

    private boolean isNetworkAvailable() {
        return NetworkUtils.isNetworkAvailable(activity.getApplicationContext());
    }

    private void registerPluginErrorForwarder() {
        AerialMapPlugin.setNativeErrorHandler((message, details) -> activity.runOnUiThread(() -> {
            String merged = (message == null ? "erro" : message) + (details == null ? "" : (": " + details));
            Log.w(TAG, "Erro reportado para WebView: " + merged);
        }));
    }

    private static final class RuntimeOfflineSnapshot {
        private final Set<String> stylePackIds;
        private final Set<String> tileRegionIds;

        private RuntimeOfflineSnapshot(Set<String> stylePackIds, Set<String> tileRegionIds) {
            this.stylePackIds = stylePackIds;
            this.tileRegionIds = tileRegionIds;
        }

        private static RuntimeOfflineSnapshot empty() {
            return new RuntimeOfflineSnapshot(Collections.emptySet(), Collections.emptySet());
        }

        private static RuntimeOfflineSnapshot resolve(Context context) {
            return new RuntimeOfflineSnapshot(getStylePackIds(context), getTileRegionIds(context));
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
                        ids.addAll(extractIds(args[0], "getStyleURI", "getStyleUri"));
                    }
                    latch.countDown();
                    return null;
                });
                method.invoke(manager, callback);
                latch.await(4, TimeUnit.SECONDS);
            } catch (Exception error) {
                Log.w(TAG, "Falha ao listar style packs", error);
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
                        ids.addAll(extractIds(args[0], "getId"));
                    }
                    latch.countDown();
                    return null;
                });
                method.invoke(store, callback);
                latch.await(4, TimeUnit.SECONDS);
            } catch (Exception error) {
                Log.w(TAG, "Falha ao listar tile regions", error);
            }
            return ids;
        }

        @SuppressWarnings("unchecked")
        private static Set<String> extractIds(Object callbackArg, String... getters) {
            Set<String> ids = new HashSet<>();
            if (callbackArg == null) return ids;
            List<Object> items = Collections.emptyList();
            if (callbackArg instanceof List<?>) {
                items = (List<Object>) callbackArg;
            } else {
                try {
                    Method isValue = callbackArg.getClass().getMethod("isValue");
                    Boolean b = (Boolean) isValue.invoke(callbackArg);
                    if (b != null && b) {
                        Method getValue = callbackArg.getClass().getMethod("getValue");
                        Object list = getValue.invoke(callbackArg);
                        if (list instanceof List<?>) {
                            items = (List<Object>) list;
                        }
                    }
                } catch (Exception ignored) {
                }
            }

            for (Object item : items) {
                for (String g : getters) {
                    try {
                        Method m = item.getClass().getMethod(g);
                        Object val = m.invoke(item);
                        if (val instanceof String) {
                            String s = (String) val;
                            if (!s.trim().isEmpty()) {
                                ids.add(s);
                                break;
                            }
                        }
                    } catch (Exception ignored) {
                    }
                }
            }
            return ids;
        }
    }
}

package com.agrovetor.app.aerial;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import android.widget.FrameLayout;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;

import com.agrovetor.app.R;
import com.agrovetor.app.plugins.AerialMapPlugin;
import com.getcapacitor.BridgeActivity;
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

import java.lang.ref.WeakReference;
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

public class NativeAerialMapManager implements OnMapClickListener {
    private static final String TAG = "AerialOfflineDebug";
    private static final String TALHOES_SOURCE = "native-talhoes-source";
    private static final String TALHOES_FILL_LAYER = "native-talhoes-fill";
    private static final String TALHOES_HIGHLIGHT_LAYER = "native-talhoes-highlight";
    private static final String TALHOES_BORDER_LAYER = "native-talhoes-border";

    private static final String ARMADILHAS_SOURCE = "native-armadilhas-source";
    private static final String ARMADILHAS_CIRCLE_LAYER = "native-armadilhas-circle";

    private static NativeAerialMapManager instance;

    private BridgeActivity activity;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private MapView mapView;
    private FrameLayout mapContainer;
    private boolean activityStarted;

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
    private boolean isMapVisible = false;

    private NativeAerialMapManager(BridgeActivity activity) {
        this.activity = activity;
        Log.i(TAG, "NativeAerialMapManager.init");
    }

    public static synchronized NativeAerialMapManager getInstance(BridgeActivity activity) {
        if (instance == null) {
            instance = new NativeAerialMapManager(activity);
        } else {
            instance.attachToActivity(activity);
        }
        return instance;
    }

    public void attachToActivity(BridgeActivity activity) {
        this.activity = activity;
        mapContainer = resolveMapContainer();
        if (mapContainer != null) {
            mapContainer.setVisibility(isMapVisible ? View.VISIBLE : View.GONE);
        }
    }

    @Nullable
    private FrameLayout resolveMapContainer() {
        if (activity == null) {
            Log.e(TAG, "resolveMapContainer: activity nula");
            return null;
        }

        View rootView = activity.getWindow() != null ? activity.getWindow().getDecorView() : null;
        FrameLayout container = activity.findViewById(R.id.native_aerial_map_container);
        if (container == null && rootView != null) {
            container = rootView.findViewById(R.id.native_aerial_map_container);
        }

        Log.i(TAG, "resolveMapContainer: containerFound=" + (container != null)
                + " activity=" + activity.getClass().getSimpleName());
        return container;
    }

    public boolean openMap() {
        if (mapView == null) {
            if (!createMapViewWithOfflineRuntime()) {
                Log.e(TAG, "openMap abortado: container nativo indisponível na MainActivity");
                return false;
            }
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
        mapContainer.setVisibility(View.VISIBLE);
        isMapVisible = true;
        return true;
    }

    public void closeMap() {
        if (mapContainer != null) {
            mapContainer.setVisibility(View.GONE);
        }
        isMapVisible = false;
    }

    private boolean createMapViewWithOfflineRuntime() {
        mapContainer = resolveMapContainer();
        if (mapContainer == null) {
            Log.e(TAG, "Container nativo do mapa não encontrado. Verifique capacitor_bridge_layout_main.xml e id native_aerial_map_container.");
            return false;
        }

        String accessToken = activity.getString(R.string.mapbox_access_token);
        AerialMapboxRuntime.configureMapbox(activity.getApplicationContext(), accessToken);
        MapInitOptions mapInitOptions = new MapInitOptions(activity);
        mapView = new MapView(activity, mapInitOptions);
        mapContainer.removeAllViews();
        mapContainer.addView(mapView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));

        if (activityStarted) {
            mapView.onStart();
        }

        Log.i(TAG, "MapView anexado ao container fixo da MainActivity com lifecycle sincronizado");
        return true;
    }

    public void onStart() {
        Log.i(TAG, "NativeAerialMapManager.onStart");
        activityStarted = true;
        if (mapView != null) {
            mapView.onStart();
        }
    }

    public void onStop() {
        Log.i(TAG, "NativeAerialMapManager.onStop");
        activityStarted = false;
        if (mapView != null) {
            mapView.onStop();
        }
    }

    public void onLowMemory() {
        if (mapView != null) {
            mapView.onLowMemory();
        }
    }

    public void updateCameraIfVisible(double[] center, double zoom) {
        if (mapView == null || !isMapVisible) return;

        activity.runOnUiThread(() -> mapView.getMapboxMap().setCamera(
                new CameraOptions.Builder()
                        .center(Point.fromLngLat(center[0], center[1]))
                        .zoom(zoom)
                        .build()
        ));
    }

    public void reloadTalhoesIfVisible(String geojson) {
        AerialMapSessionStore.talhoesGeoJson = geojson;

        if (mapView == null || !isMapVisible) return;

        activity.runOnUiThread(() -> {
            pendingTalhoesGeoJson = geojson;
            if (!styleReady) {
                Log.i(TAG, "Talhões recebidos antes do style pronto. Aplicação será postergada.");
                return;
            }

            mapView.getMapboxMap().getStyle(style -> {
                setupTalhoes(style, pendingTalhoesGeoJson);
                applyHighlight(style, AerialMapSessionStore.highlightedTalhaoId);
            });
        });
    }

    public void reloadArmadilhasIfVisible(String geojson) {
        AerialMapSessionStore.armadilhasGeoJson = geojson;

        if (mapView == null || !isMapVisible) return;

        activity.runOnUiThread(() -> {
            pendingArmadilhasGeoJson = geojson;
            if (!styleReady) {
                Log.i(TAG, "Armadilhas recebidas antes do style pronto. Aplicação será postergada.");
                return;
            }

            mapView.getMapboxMap().getStyle(style -> {
                setupArmadilhas(style, pendingArmadilhasGeoJson);
            });
        });
    }

    public void highlightTalhaoIfVisible(String talhaoId) {
        if (mapView == null || !isMapVisible) return;

        activity.runOnUiThread(() -> mapView.getMapboxMap().getStyle(style -> applyHighlight(style, talhaoId)));
    }

    private void setupCamera() {
        mapView.getMapboxMap().setCamera(new CameraOptions.Builder()
                .center(Point.fromLngLat(AerialMapSessionStore.center[0], AerialMapSessionStore.center[1]))
                .zoom(AerialMapSessionStore.zoom)
                .build());
    }

    private void loadStyleWithFallback() {
        if (styleFallbackChain.isEmpty()) {
            Log.e(TAG, "Nenhum styleUri disponível para carregar mapa.");
            AerialMapPlugin.notifyOfflinePackageMissing("Nenhum estilo de mapa (styleUri) disponível para fallback offline.");
            return;
        }

        final String styleUri = styleFallbackChain.get(Math.min(styleAttemptIndex, styleFallbackChain.size() - 1));
        styleLoading = true;
        styleReady = false;
        Log.i(TAG, "Iniciando loadStyleUri. attempt=" + (styleAttemptIndex + 1) + "/" + styleFallbackChain.size() + " styleUri=" + styleUri);

        mainHandler.postDelayed(() -> {
            if (!styleReady && styleLoading) {
                Log.e(TAG, "Timeout no loadStyleUri. styleUri=" + styleUri);
                proceedToNextStyleOrFail("timeout", styleUri);
            }
        }, 9000);

        mapView.getMapboxMap().loadStyleUri(styleUri, style -> {
            styleLoading = false;
            styleReady = true;
            AerialMapSessionStore.styleUri = styleUri;
            Log.i(TAG, "Style carregado com sucesso. styleUri=" + styleUri);
            setupTalhoes(style, pendingTalhoesGeoJson != null ? pendingTalhoesGeoJson : AerialMapSessionStore.talhoesGeoJson);
            setupArmadilhas(style, pendingArmadilhasGeoJson != null ? pendingArmadilhasGeoJson : AerialMapSessionStore.armadilhasGeoJson);
            applyHighlight(style, AerialMapSessionStore.highlightedTalhaoId);
            setupCamera();
        });
    }

    private void proceedToNextStyleOrFail(String reasonType, String styleUri) {
        styleLoading = false;
        String reason = buildDetailedFailureReason(reasonType, styleUri);
        styleAttemptIndex += 1;
        if (styleAttemptIndex < styleFallbackChain.size()) {
            String next = styleFallbackChain.get(styleAttemptIndex);
            Log.w(TAG, "Fallback de style acionado. reason=" + reason + ", próximo=" + next);
            loadStyleWithFallback();
            return;
        }

        Log.e(TAG, "Falha final ao carregar estilo. reason=" + reason + ", attempts=" + styleFallbackChain);
        AerialMapPlugin.notifyOfflinePackageMissing("Mapa offline indisponível para o zoom/área atual. Ajuste o zoom ou baixe novamente.");
    }

    private String buildDetailedFailureReason(String reasonType, String styleUri) {
        List<OfflineRegionMetadata> regions = new AerialOfflineRegionStore(activity.getApplicationContext()).readAll();
        boolean readyRegionExists = false;
        boolean matchingStylePack = false;
        boolean matchingTileRegion = false;

        for (OfflineRegionMetadata region : regions) {
            if (!"ready".equals(region.status)) {
                continue;
            }
            readyRegionExists = true;
            if (styleUri.equals(region.styleUri)) {
                if (runtimeOfflineSnapshot.stylePackIds.contains(region.stylePackId)) {
                    matchingStylePack = true;
                }
                if (runtimeOfflineSnapshot.tileRegionIds.contains(region.tileRegionId)) {
                    matchingTileRegion = true;
                }
            }
        }

        if (!readyRegionExists) {
            return reasonType + ": mapa sem região ready persistida";
        }
        if (!matchingStylePack) {
            return reasonType + ": style pack real ausente para styleUri=" + styleUri;
        }
        if (!matchingTileRegion) {
            return reasonType + ": tile region real ausente para styleUri=" + styleUri;
        }
        return reasonType + ": map loading error para styleUri=" + styleUri + " (stylePacksReais=" + runtimeOfflineSnapshot.stylePackIds.size() + ", tileRegionsReais=" + runtimeOfflineSnapshot.tileRegionIds.size() + ")";
    }

    private List<String> buildStyleFallbackChain(boolean networkAvailable, List<OfflineRegionMetadata> candidateRegions) {
        Set<String> chain = new LinkedHashSet<>();
        if (AerialMapSessionStore.styleUri != null && !AerialMapSessionStore.styleUri.trim().isEmpty()) {
            chain.add(AerialMapSessionStore.styleUri);
        }

        for (OfflineRegionMetadata region : candidateRegions) {
            if (region.styleUri != null && !region.styleUri.trim().isEmpty()) {
                chain.add(region.styleUri);
            }
        }

        if (networkAvailable) {
            chain.add("mapbox://styles/mapbox/standard-satellite");
        }
        return new ArrayList<>(chain);
    }

    private List<OfflineRegionMetadata> readOfflineMetadata(boolean networkAvailable) {
        AerialOfflineRegionStore regionStore = new AerialOfflineRegionStore(activity.getApplicationContext());
        List<OfflineRegionMetadata> regions = regionStore.readAll();
        int readyCount = 0;
        for (OfflineRegionMetadata region : regions) {
            if ("ready".equals(region.status)) {
                readyCount++;
                Log.i(TAG, "Offline ready region: id=" + region.regionId + " styleUri=" + region.styleUri + " stylePackId=" + region.stylePackId + " tileRegionId=" + region.tileRegionId);
            } else {
                Log.i(TAG, "Offline region: id=" + region.regionId + " status=" + region.status + " stylePackId=" + region.stylePackId + " tileRegionId=" + region.tileRegionId + " styleUri=" + region.styleUri);
            }
        }
        Log.i(TAG, "Abertura do mapa: online=" + networkAvailable + " totalRegioesMetadata=" + regions.size() + " readyMetadata=" + readyCount + " styleSessao=" + AerialMapSessionStore.styleUri);
        return regions;
    }

    private void prepareStyleFallbackAndLoad(boolean networkAvailable, List<OfflineRegionMetadata> metadataRegions) {
        Thread worker = new Thread(() -> {
            RuntimeOfflineSnapshot snapshot = RuntimeOfflineSnapshot.resolve(activity.getApplicationContext());
            List<OfflineRegionMetadata> readyRegions = new ArrayList<>();
            List<OfflineRegionMetadata> validRuntimeRegions = new ArrayList<>();
            for (OfflineRegionMetadata region : metadataRegions) {
                if (!"ready".equals(region.status)) {
                    continue;
                }
                readyRegions.add(region);
                if (snapshot.contains(region.stylePackId, region.tileRegionId)) {
                    validRuntimeRegions.add(region);
                }
            }

            activity.runOnUiThread(() -> {
                runtimeOfflineSnapshot = snapshot;
                hasAnyRuntimeOfflinePackage = !validRuntimeRegions.isEmpty();
                Log.i(TAG, "Diagnóstico offline runtime: stylePacksReais=" + snapshot.stylePackIds.size()
                        + " tileRegionsReais=" + snapshot.tileRegionIds.size()
                        + " readyMetadata=" + readyRegions.size()
                        + " readyValidasRuntime=" + validRuntimeRegions.size()
                        + " network=" + networkAvailable
                        + " tileStorePath=" + AerialMapboxRuntime.getTileStorePath());

                if (!networkAvailable && readyRegions.isEmpty()) {
                    String reason = "Região offline não baixada. Conecte-se e baixe.";
                    Log.w(TAG, "Abertura offline sem pacote pronto: " + reason);
                    AerialMapPlugin.notifyOfflinePackageMissing(reason);
                    return;
                }

                if (!networkAvailable && validRuntimeRegions.isEmpty()) {
                    String reason = "Pacote offline inconsistente no runtime. Refaça o download online.";
                    Log.e(TAG, "Falha na abertura offline: " + reason + " stylePacksReais=" + snapshot.stylePackIds + " tileRegionsReais=" + snapshot.tileRegionIds);
                    AerialMapPlugin.notifyOfflinePackageMissing(reason);
                    return;
                }

                List<OfflineRegionMetadata> styleCandidates = networkAvailable ? readyRegions : validRuntimeRegions;
                if ((pendingTalhoesGeoJson == null || pendingTalhoesGeoJson.trim().isEmpty()) && !styleCandidates.isEmpty()) {
                    pendingTalhoesGeoJson = styleCandidates.get(0).talhoesGeoJson;
                }
                if ((pendingArmadilhasGeoJson == null || pendingArmadilhasGeoJson.trim().isEmpty()) && !styleCandidates.isEmpty()) {
                    pendingArmadilhasGeoJson = styleCandidates.get(0).armadilhasGeoJson;
                }
                styleFallbackChain = buildStyleFallbackChain(networkAvailable, styleCandidates);
                styleAttemptIndex = 0;
                Log.i(TAG, "Style fallback chain final (online=" + networkAvailable + "): " + styleFallbackChain);
                loadStyleWithFallback();
            });
        });
        worker.setName("offline-runtime-validation");
        worker.start();
    }

    private static final class RuntimeOfflineSnapshot {
        private final Set<String> stylePackIds;
        private final Set<String> tileRegionIds;

        private RuntimeOfflineSnapshot(Set<String> stylePackIds, Set<String> tileRegionIds) {
            this.stylePackIds = stylePackIds;
            this.tileRegionIds = tileRegionIds;
        }

        private boolean contains(@Nullable String stylePackId, @Nullable String tileRegionId) {
            return stylePackId != null && tileRegionId != null && stylePackIds.contains(stylePackId) && tileRegionIds.contains(tileRegionId);
        }

        private static RuntimeOfflineSnapshot empty() {
            return new RuntimeOfflineSnapshot(Collections.emptySet(), Collections.emptySet());
        }

        private static RuntimeOfflineSnapshot resolve(Context context) {
            Set<String> stylePacks = getStylePackIds(context);
            Set<String> tileRegions = getTileRegionIds(context);
            return new RuntimeOfflineSnapshot(stylePacks, tileRegions);
        }

        private static Set<String> getStylePackIds(Context context) {
            Set<String> ids = new HashSet<>();
            try {
                OfflineManager manager = AerialMapboxRuntime.getOfflineManager(context);
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
                latch.await(3, TimeUnit.SECONDS);
            } catch (Exception error) {
                Log.w(TAG, "Falha ao listar style packs reais no runtime", error);
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
                latch.await(3, TimeUnit.SECONDS);
            } catch (Exception error) {
                Log.w(TAG, "Falha ao listar tile regions reais no runtime", error);
            }
            return ids;
        }

        @SuppressWarnings("unchecked")
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
            if (talhoesStyle != style || talhoesHighlightLayer == null) {
                return;
            }

            if (talhaoId == null || talhaoId.trim().isEmpty()) {
                talhoesHighlightLayer.filter(Expression.literal(false));
                return;
            }

            talhoesHighlightLayer.filter(Expression.any(
                    Expression.eq(Expression.get("talhaoId"), Expression.literal(talhaoId)),
                    Expression.eq(Expression.get("id"), Expression.literal(talhaoId)),
                    Expression.eq(Expression.get("codigo"), Expression.literal(talhaoId))
            ));
        } catch (Exception e) {
            Log.w(TAG, "Falha ao aplicar highlight do talhão", e);
        }
    }

    @Override
    public boolean onMapClick(@androidx.annotation.NonNull Point point) {
        ScreenCoordinate screenPoint = mapView.getMapboxMap().pixelForCoordinate(point);
        RenderedQueryGeometry geometry = new RenderedQueryGeometry(screenPoint);
        RenderedQueryOptions options = new RenderedQueryOptions(Collections.singletonList(TALHOES_FILL_LAYER), null);

        mapView.getMapboxMap().queryRenderedFeatures(geometry, options, queryFeatures -> {
            List<QueriedRenderedFeature> queried = extractQueriedFeatures(queryFeatures);
            if (queried == null || queried.isEmpty()) return;

            Feature feature = queried.get(0).getQueriedFeature().getFeature();
            AerialMapPlugin.notifyTalhaoClick(feature.toJson());
        });
        return true;
    }

    @SuppressWarnings("unchecked")
    private List<QueriedRenderedFeature> extractQueriedFeatures(Object queryFeatures) {
        if (queryFeatures == null) {
            return null;
        }

        if (queryFeatures instanceof List<?>) {
            return (List<QueriedRenderedFeature>) queryFeatures;
        }

        try {
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

            if (!networkAvailableAtStart || hasAnyRuntimeOfflinePackage) {
                Log.i(TAG, "Erro interceptado sem remover mapa porque o usuário está offline ou existe pacote runtime.");
                return;
            }

            // Ação de erro crítica poderia ser ocultar o mapa, mas deixamos apenas o log.
        }));
    }

    private void subscribeMapLoadingErrors() {
        try {
            Method subscribeMethod = mapView.getMapboxMap().getClass().getMethod("subscribeMapLoadingError", Class.forName("com.mapbox.maps.MapLoadingErrorCallback"));
            Class<?> callbackClass = Class.forName("com.mapbox.maps.MapLoadingErrorCallback");
            Object callbackProxy = Proxy.newProxyInstance(
                    callbackClass.getClassLoader(),
                    new Class[]{callbackClass},
                    new InvocationHandler() {
                        @Override
                        public Object invoke(Object proxy, Method method, Object[] args) {
                            if (args != null && args.length > 0 && args[0] != null) {
                                String details = String.valueOf(args[0]);
                                Log.e(TAG, "MapLoadingError recebido: " + details);
                            }
                            return null;
                        }
                    }
            );
            mapLoadingErrorCancelable = subscribeMethod.invoke(mapView.getMapboxMap(), callbackProxy);
            Log.i(TAG, "subscribeMapLoadingError registrado com sucesso");
        } catch (Exception error) {
            Log.w(TAG, "subscribeMapLoadingError indisponível: " + error.getMessage());
        }
    }

    public void onDestroy() {
        Log.i(TAG, "NativeAerialMapManager.onDestroy");
        if (gesturesPlugin != null) {
            gesturesPlugin.removeOnMapClickListener(this);
            gesturesPlugin = null;
        }
        if (mapLoadingErrorCancelable != null) {
            try {
                Method cancel = mapLoadingErrorCancelable.getClass().getMethod("cancel");
                cancel.invoke(mapLoadingErrorCancelable);
            } catch (Exception error) {
                Log.w(TAG, "Falha ao cancelar subscription de map loading error", error);
            }
            mapLoadingErrorCancelable = null;
        }
        AerialMapPlugin.setNativeErrorHandler(null);
        mainHandler.removeCallbacksAndMessages(null);
        if (mapView != null) {
            mapView.onDestroy();
            mapView = null;
        }
        if (mapContainer != null) {
            mapContainer.removeAllViews();
            mapContainer.setVisibility(View.GONE);
        }
        activityStarted = false;
    }
}

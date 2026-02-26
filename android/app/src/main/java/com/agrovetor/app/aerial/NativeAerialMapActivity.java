package com.agrovetor.app.aerial;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.widget.FrameLayout;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;

import com.agrovetor.app.R;
import com.agrovetor.app.plugins.AerialMapPlugin;
import com.mapbox.common.TileStore;
import com.mapbox.geojson.Feature;
import com.mapbox.geojson.FeatureCollection;
import com.mapbox.geojson.Point;
import com.mapbox.maps.CameraOptions;
import com.mapbox.maps.MapInitOptions;
import com.mapbox.maps.MapView;
import com.mapbox.maps.QueriedRenderedFeature;
import com.mapbox.maps.RenderedQueryGeometry;
import com.mapbox.maps.RenderedQueryOptions;
import com.mapbox.maps.ScreenCoordinate;
import com.mapbox.maps.Style;
import com.mapbox.maps.extension.style.expressions.generated.Expression;
import com.mapbox.maps.extension.style.layers.generated.FillLayer;
import com.mapbox.maps.extension.style.layers.generated.LineLayer;
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
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

public class NativeAerialMapActivity extends AppCompatActivity implements OnMapClickListener {
    private static final String TAG = "AerialOfflineDebug";
    private static final String TALHOES_SOURCE = "native-talhoes-source";
    private static final String TALHOES_FILL_LAYER = "native-talhoes-fill";
    private static final String TALHOES_HIGHLIGHT_LAYER = "native-talhoes-highlight";
    private static final String TALHOES_BORDER_LAYER = "native-talhoes-border";

    private static WeakReference<NativeAerialMapActivity> activeInstance = new WeakReference<>(null);

    private final Handler mainHandler = new Handler(Looper.getMainLooper());

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
    private Object mapLoadingErrorCancelable;
    private boolean styleReady;
    private boolean styleLoading;
    private int styleAttemptIndex;
    private List<String> styleFallbackChain = Collections.emptyList();
    @Nullable
    private String pendingTalhoesGeoJson;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Log.i(TAG, "NativeAerialMapActivity.onCreate");
        setContentView(R.layout.activity_aerial_map);

        createMapViewWithOfflineRuntime();
        subscribeMapLoadingErrors();

        boolean networkAvailable = isNetworkAvailable();
        List<OfflineRegionMetadata> readyRegions = logOfflineRegions(networkAvailable);

        pendingTalhoesGeoJson = AerialMapSessionStore.talhoesGeoJson;
        styleFallbackChain = buildStyleFallbackChain(readyRegions);
        styleAttemptIndex = 0;
        loadStyleWithFallback();

        gesturesPlugin = (GesturesPlugin) mapView.getPlugin(Plugin.MAPBOX_GESTURES_PLUGIN_ID);
        if (gesturesPlugin != null) {
            gesturesPlugin.removeOnMapClickListener(this);
            gesturesPlugin.addOnMapClickListener(this);
        }
    }

    private void createMapViewWithOfflineRuntime() {
        FrameLayout mapContainer = findViewById(R.id.nativeAerialMapContainer);
        String accessToken = getString(R.string.mapbox_access_token);
        AerialMapboxRuntime.configureMapbox(getApplicationContext(), accessToken);
        MapInitOptions mapInitOptions = new MapInitOptions(getApplicationContext());
        mapView = new MapView(this, mapInitOptions);
        applyTileStoreToMapView(mapView);
        mapContainer.addView(mapView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));
        Log.i(TAG, "MapView criado com MapInitOptions após configurar runtime global do Mapbox");
    }

    private void applyTileStoreToMapView(@NonNull MapView targetMapView) {
        TileStore tileStore = AerialMapboxRuntime.getTileStore(getApplicationContext());
        Log.i(TAG, "Tentando aplicar TileStore persistente ao MapView por reflection");

        boolean tileStoreApplied = invokeMapboxMapMethod(targetMapView, "setTileStore", new Class<?>[]{TileStore.class}, tileStore);
        boolean usageModeApplied = applyTileStoreUsageMode(targetMapView);

        if (tileStoreApplied && usageModeApplied) {
            Log.i(TAG, "TileStore aplicado com sucesso ao MapView (setTileStore + setTileStoreUsageMode)");
        } else if (tileStoreApplied) {
            Log.i(TAG, "TileStore aplicado ao MapView; setTileStoreUsageMode indisponível nesta versão do SDK");
        } else {
            Log.w(TAG, "Não foi possível aplicar TileStore ao MapView com a API disponível em runtime; fallback seguro mantido");
        }
    }

    private boolean applyTileStoreUsageMode(@NonNull MapView targetMapView) {
        try {
            Class<?> usageModeClass = Class.forName("com.mapbox.maps.TileStoreUsageMode");
            Object readAndUpdate = Enum.valueOf((Class<Enum>) usageModeClass.asSubclass(Enum.class), "READ_AND_UPDATE");
            return invokeMapboxMapMethod(targetMapView, "setTileStoreUsageMode", new Class<?>[]{usageModeClass}, readAndUpdate);
        } catch (ClassNotFoundException classNotFoundException) {
            Log.i(TAG, "TileStoreUsageMode indisponível no SDK atual; seguindo sem setTileStoreUsageMode");
            return false;
        } catch (IllegalArgumentException illegalArgumentException) {
            Log.w(TAG, "Enum READ_AND_UPDATE não disponível em TileStoreUsageMode; seguindo fallback seguro", illegalArgumentException);
            return false;
        }
    }

    private boolean invokeMapboxMapMethod(@NonNull MapView targetMapView,
                                          @NonNull String methodName,
                                          @NonNull Class<?>[] parameterTypes,
                                          @Nullable Object argument) {
        Object mapboxMap = targetMapView.getMapboxMap();
        try {
            Method method = mapboxMap.getClass().getMethod(methodName, parameterTypes);
            method.invoke(mapboxMap, argument);
            Log.i(TAG, "Método aplicado por reflection com sucesso: " + methodName);
            return true;
        } catch (NoSuchMethodException noSuchMethodException) {
            Log.i(TAG, "Método não disponível no runtime do SDK: " + methodName);
            return false;
        } catch (Exception reflectionError) {
            Log.w(TAG, "Falha ao aplicar método por reflection: " + methodName, reflectionError);
            return false;
        }
    }

    @Override
    protected void onStart() {
        super.onStart();
        Log.i(TAG, "NativeAerialMapActivity.onStart");
        activeInstance = new WeakReference<>(this);
        if (mapView != null) {
            mapView.onStart();
        }
    }

    @Override
    protected void onStop() {
        Log.i(TAG, "NativeAerialMapActivity.onStop");
        NativeAerialMapActivity current = activeInstance.get();
        if (current == this) {
            activeInstance = new WeakReference<>(null);
        }
        if (mapView != null) {
            mapView.onStop();
        }
        super.onStop();
    }

    public static void updateCameraIfVisible(double[] center, double zoom) {
        NativeAerialMapActivity current = activeInstance.get();
        if (current == null || current.mapView == null) {
            return;
        }

        current.runOnUiThread(() -> current.mapView.getMapboxMap().setCamera(
                new CameraOptions.Builder()
                        .center(Point.fromLngLat(center[0], center[1]))
                        .zoom(zoom)
                        .build()
        ));
    }

    public static void reloadTalhoesIfVisible(String geojson) {
        NativeAerialMapActivity current = activeInstance.get();
        AerialMapSessionStore.talhoesGeoJson = geojson;

        if (current == null || current.mapView == null) {
            return;
        }

        current.runOnUiThread(() -> {
            current.pendingTalhoesGeoJson = geojson;
            if (!current.styleReady) {
                Log.i(TAG, "Talhões recebidos antes do style pronto. Aplicação será postergada.");
                return;
            }

            current.mapView.getMapboxMap().getStyle(style -> {
                current.setupTalhoes(style, current.pendingTalhoesGeoJson);
                current.applyHighlight(style, AerialMapSessionStore.highlightedTalhaoId);
            });
        });
    }

    public static void highlightTalhaoIfVisible(String talhaoId) {
        NativeAerialMapActivity current = activeInstance.get();
        if (current == null || current.mapView == null) {
            return;
        }

        current.runOnUiThread(() -> current.mapView.getMapboxMap().getStyle(style -> current.applyHighlight(style, talhaoId)));
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
            AerialMapPlugin.notifyError("Falha ao abrir mapa offline", "Nenhum styleUri disponível para fallback.");
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
        AerialMapPlugin.notifyError("Falha ao carregar mapa offline", reason + " | styles tentados=" + styleFallbackChain);
    }

    private String buildDetailedFailureReason(String reasonType, String styleUri) {
        AerialOfflineRegionStore regionStore = new AerialOfflineRegionStore(getApplicationContext());
        List<OfflineRegionMetadata> regions = regionStore.readAll();
        boolean readyRegionExists = false;
        boolean matchingStylePack = false;
        boolean matchingTileRegion = false;

        for (OfflineRegionMetadata region : regions) {
            if (!"ready".equals(region.status)) {
                continue;
            }
            readyRegionExists = true;
            if (styleUri.equals(region.styleUri)) {
                if (region.stylePackId != null && !region.stylePackId.trim().isEmpty()) {
                    matchingStylePack = true;
                }
                if (region.tileRegionId != null && !region.tileRegionId.trim().isEmpty()) {
                    matchingTileRegion = true;
                }
            }
        }

        if (!readyRegionExists) {
            return reasonType + ": mapa sem região ready persistida";
        }
        if (!matchingStylePack) {
            return reasonType + ": style pack ausente para styleUri=" + styleUri;
        }
        if (!matchingTileRegion) {
            return reasonType + ": tile region ausente para styleUri=" + styleUri;
        }
        return reasonType + ": map loading error para styleUri=" + styleUri + " (TileStore já aplicado na criação do MapView)";
    }

    private List<String> buildStyleFallbackChain(List<OfflineRegionMetadata> readyRegions) {
        Set<String> chain = new LinkedHashSet<>();
        if (AerialMapSessionStore.styleUri != null && !AerialMapSessionStore.styleUri.trim().isEmpty()) {
            chain.add(AerialMapSessionStore.styleUri);
        }

        for (OfflineRegionMetadata region : readyRegions) {
            if (region.styleUri != null && !region.styleUri.trim().isEmpty()) {
                chain.add(region.styleUri);
            }
        }

        chain.add("mapbox://styles/mapbox/standard-satellite");
        return new ArrayList<>(chain);
    }

    private List<OfflineRegionMetadata> logOfflineRegions(boolean networkAvailable) {
        AerialOfflineRegionStore regionStore = new AerialOfflineRegionStore(getApplicationContext());
        List<OfflineRegionMetadata> regions = regionStore.readAll();
        List<OfflineRegionMetadata> readyRegions = new ArrayList<>();
        for (OfflineRegionMetadata region : regions) {
            if ("ready".equals(region.status)) {
                readyRegions.add(region);
                Log.i(TAG, "Offline ready region: id=" + region.regionId + " styleUri=" + region.styleUri + " stylePackId=" + region.stylePackId + " tileRegionId=" + region.tileRegionId);
            } else {
                Log.i(TAG, "Offline region: id=" + region.regionId + " status=" + region.status + " stylePackId=" + region.stylePackId + " tileRegionId=" + region.tileRegionId + " styleUri=" + region.styleUri);
            }
        }
        Log.i(TAG, "Abertura do mapa: online=" + networkAvailable + " totalRegioes=" + regions.size() + " ready=" + readyRegions.size() + " styleSessao=" + AerialMapSessionStore.styleUri);
        return readyRegions;
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
            AerialMapPlugin.notifyError("Falha ao desenhar talhões no mapa nativo", error.getMessage());
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
        ConnectivityManager connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (connectivityManager == null) {
            return false;
        }

        Network network = connectivityManager.getActiveNetwork();
        if (network == null) {
            return false;
        }

        NetworkCapabilities capabilities = connectivityManager.getNetworkCapabilities(network);
        return capabilities != null &&
                (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
                        || capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)
                        || capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET));
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
                                String failingStyleUri = styleFallbackChain.isEmpty() ? "<none>" : styleFallbackChain.get(Math.min(styleAttemptIndex, styleFallbackChain.size() - 1));
                                proceedToNextStyleOrFail("map_loading_error", failingStyleUri);
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

    @Override
    protected void onDestroy() {
        Log.i(TAG, "NativeAerialMapActivity.onDestroy");
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
        mainHandler.removeCallbacksAndMessages(null);
        if (mapView != null) {
            mapView.onDestroy();
        }
        super.onDestroy();
    }
}

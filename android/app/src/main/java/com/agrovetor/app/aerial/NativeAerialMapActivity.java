package com.agrovetor.app.aerial;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Bundle;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;

import com.agrovetor.app.R;
import com.agrovetor.app.plugins.AerialMapPlugin;
import com.mapbox.geojson.Feature;
import com.mapbox.geojson.FeatureCollection;
import com.mapbox.geojson.Point;
import com.mapbox.maps.CameraOptions;
import com.mapbox.maps.MapView;
import com.mapbox.maps.QueriedRenderedFeature;
import com.mapbox.maps.RenderedQueryGeometry;
import com.mapbox.maps.RenderedQueryOptions;
import com.mapbox.maps.Style;
import com.mapbox.maps.ScreenCoordinate;
import com.mapbox.maps.extension.style.expressions.generated.Expression;
import com.mapbox.maps.extension.style.layers.generated.FillLayer;
import com.mapbox.maps.extension.style.layers.generated.LineLayer;
import com.mapbox.maps.extension.style.sources.generated.GeoJsonSource;
import com.mapbox.maps.plugin.Plugin;
import com.mapbox.maps.plugin.gestures.GesturesPlugin;
import com.mapbox.maps.plugin.gestures.OnMapClickListener;

import java.lang.ref.WeakReference;
import java.lang.reflect.Method;
import java.util.Collections;
import java.util.List;

public class NativeAerialMapActivity extends AppCompatActivity implements OnMapClickListener {
    private static final String TAG = "NativeAerialMapActivity";
    private static final String TALHOES_SOURCE = "native-talhoes-source";
    private static final String TALHOES_FILL_LAYER = "native-talhoes-fill";
    private static final String TALHOES_HIGHLIGHT_LAYER = "native-talhoes-highlight";
    private static final String TALHOES_BORDER_LAYER = "native-talhoes-border";

    private static WeakReference<NativeAerialMapActivity> activeInstance = new WeakReference<>(null);

    private MapView mapView;
    @Nullable
    private GesturesPlugin gesturesPlugin;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_aerial_map);

        mapView = findViewById(R.id.nativeAerialMapView);

        if (!isNetworkAvailable()) {
            Log.i(TAG, "Sem internet: tentando abrir mapa com dados offline disponíveis.");
        }

        mapView.getMapboxMap().loadStyleUri(AerialMapSessionStore.styleUri, style -> {
            Log.i(TAG, "Estilo carregado com sucesso (online/offline)");
            setupTalhoes(style);
            applyHighlight(style, AerialMapSessionStore.highlightedTalhaoId);
            setupCamera();
        });

        gesturesPlugin = (GesturesPlugin) mapView.getPlugin(Plugin.MAPBOX_GESTURES_PLUGIN_ID);
        if (gesturesPlugin != null) {
            gesturesPlugin.addOnMapClickListener(this);
        }
    }

    @Override
    protected void onStart() {
        super.onStart();
        activeInstance = new WeakReference<>(this);
    }

    @Override
    protected void onStop() {
        NativeAerialMapActivity current = activeInstance.get();
        if (current == this) {
            activeInstance = new WeakReference<>(null);
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
        if (current == null || current.mapView == null) {
            return;
        }

        current.runOnUiThread(() -> current.mapView.getMapboxMap().getStyle(style -> {
            AerialMapSessionStore.talhoesGeoJson = geojson;
            current.setupTalhoes(style);
            current.applyHighlight(style, AerialMapSessionStore.highlightedTalhaoId);
        }));
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

    private void setupTalhoes(Style style) {
        if (AerialMapSessionStore.talhoesGeoJson == null) return;
        try {
            FeatureCollection featureCollection = FeatureCollection.fromJson(AerialMapSessionStore.talhoesGeoJson);

            GeoJsonSource source = (GeoJsonSource) style.getSource(TALHOES_SOURCE);
            if (source == null) {
                source = new GeoJsonSource.Builder(TALHOES_SOURCE)
                        .featureCollection(featureCollection)
                        .build();
                source.bindTo(style);
            } else {
                source.featureCollection(featureCollection);
            }

            if (style.getLayer(TALHOES_FILL_LAYER) == null) {
                FillLayer fillLayer = new FillLayer(TALHOES_FILL_LAYER, TALHOES_SOURCE)
                        .fillOpacity(0.45)
                        .fillColor(Expression.rgb(27.0, 94.0, 32.0));
                fillLayer.bindTo(style);
            }

            if (style.getLayer(TALHOES_HIGHLIGHT_LAYER) == null) {
                FillLayer highlightLayer = new FillLayer(TALHOES_HIGHLIGHT_LAYER, TALHOES_SOURCE)
                        .fillOpacity(0.8)
                        .fillColor(Expression.rgb(255.0, 235.0, 59.0))
                        .filter(Expression.literal(false));
                highlightLayer.bindTo(style);
            }

            if (style.getLayer(TALHOES_BORDER_LAYER) == null) {
                LineLayer lineLayer = new LineLayer(TALHOES_BORDER_LAYER, TALHOES_SOURCE)
                        .lineColor(Expression.rgb(255.0, 255.0, 255.0))
                        .lineWidth(2.0);
                lineLayer.bindTo(style);
            }
        } catch (Exception error) {
            Log.e(TAG, "Falha ao desenhar talhões", error);
            AerialMapPlugin.notifyError("Falha ao desenhar talhões no mapa nativo", error.getMessage());
        }
    }

    private void applyHighlight(Style style, String talhaoId) {
        try {
            FillLayer highlightLayer = (FillLayer) style.getLayer(TALHOES_HIGHLIGHT_LAYER);
            if (highlightLayer == null) {
                return;
            }

            if (talhaoId == null || talhaoId.trim().isEmpty()) {
                highlightLayer.filter(Expression.literal(false));
                return;
            }

            highlightLayer.filter(Expression.any(
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

    @Override
    protected void onDestroy() {
        if (gesturesPlugin != null) {
            gesturesPlugin.removeOnMapClickListener(this);
        }
        super.onDestroy();
    }
}

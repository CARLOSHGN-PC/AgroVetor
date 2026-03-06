package com.agrovetor.app.aerial;

import android.util.Log;
import android.view.View;
import android.widget.FrameLayout;

import androidx.annotation.Nullable;

import com.agrovetor.app.MainActivity;
import com.agrovetor.app.R;
import com.agrovetor.app.plugins.AerialMapPlugin;
import com.mapbox.geojson.FeatureCollection;
import com.mapbox.geojson.Point;
import com.mapbox.maps.CameraOptions;
import com.mapbox.maps.MapInitOptions;
import com.mapbox.maps.MapView;
import com.mapbox.maps.Style;
import com.mapbox.maps.extension.style.expressions.generated.Expression;
import com.mapbox.maps.extension.style.layers.generated.CircleLayer;
import com.mapbox.maps.extension.style.layers.generated.FillLayer;
import com.mapbox.maps.extension.style.layers.generated.LineLayer;
import com.mapbox.maps.extension.style.sources.generated.GeoJsonSource;

public class MainActivityAerialMapController {
    private static final String TAG = "AerialMainMap";

    private static final String TALHOES_SOURCE = "main-talhoes-source";
    private static final String TALHOES_FILL_LAYER = "main-talhoes-fill";
    private static final String TALHOES_HIGHLIGHT_LAYER = "main-talhoes-highlight";
    private static final String TALHOES_BORDER_LAYER = "main-talhoes-border";
    private static final String ARMADILHAS_SOURCE = "main-armadilhas-source";
    private static final String ARMADILHAS_CIRCLE_LAYER = "main-armadilhas-circle";

    private final MainActivity activity;
    @Nullable private MapView mapView;
    private boolean styleReady = false;
    @Nullable private String pendingTalhoes;
    @Nullable private String pendingArmadilhas;

    public MainActivityAerialMapController(MainActivity activity) {
        this.activity = activity;
    }

    public void openMap(String styleUri, double[] center, double zoom) {
        FrameLayout container = activity.getNativeAerialMapContainer();
        if (container == null) {
            AerialMapPlugin.notifyError("Container nativo do mapa não encontrado.", "MainActivity container ausente");
            return;
        }

        ensureMapView(container);
        container.setVisibility(View.VISIBLE);
        activity.setAerialNativeModeEnabled(true);
        loadStyle(styleUri);
        setCamera(center, zoom);
    }

    public void hideMap() {
        FrameLayout container = activity.getNativeAerialMapContainer();
        if (container != null) {
            container.setVisibility(View.GONE);
        }
        activity.setAerialNativeModeEnabled(false);
    }

    public void loadTalhoes(String geojson) {
        pendingTalhoes = geojson;
        if (mapView == null || !styleReady) return;
        mapView.getMapboxMap().getStyle(style -> setupTalhoes(style, geojson));
    }

    public void loadArmadilhas(String geojson) {
        pendingArmadilhas = geojson;
        if (mapView == null || !styleReady) return;
        mapView.getMapboxMap().getStyle(style -> setupArmadilhas(style, geojson));
    }

    public void highlightTalhao(@Nullable String talhaoId) {
        if (mapView == null || !styleReady) return;
        mapView.getMapboxMap().getStyle(style -> applyHighlight(style, talhaoId));
    }

    public void setCamera(double[] center, double zoom) {
        if (mapView == null) return;
        mapView.getMapboxMap().setCamera(new CameraOptions.Builder()
                .center(Point.fromLngLat(center[0], center[1]))
                .zoom(zoom)
                .build());
    }

    private void ensureMapView(FrameLayout container) {
        if (mapView != null) return;
        String accessToken = activity.getString(R.string.mapbox_access_token);
        AerialMapboxRuntime.configureMapbox(activity.getApplicationContext(), accessToken);
        mapView = new MapView(activity, new MapInitOptions(activity));
        mapView.setLayoutParams(new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));
        container.removeAllViews();
        container.addView(mapView);
        mapView.onStart();
        Log.i(TAG, "MapView anexado ao container da MainActivity");
    }

    private void loadStyle(String styleUri) {
        if (mapView == null) return;
        styleReady = false;
        mapView.getMapboxMap().loadStyleUri(styleUri, style -> {
            styleReady = true;
            setupTalhoes(style, pendingTalhoes != null ? pendingTalhoes : AerialMapSessionStore.talhoesGeoJson);
            setupArmadilhas(style, pendingArmadilhas != null ? pendingArmadilhas : AerialMapSessionStore.armadilhasGeoJson);
            applyHighlight(style, AerialMapSessionStore.highlightedTalhaoId);
            Log.i(TAG, "Style satélite carregado na MainActivity: " + styleUri);
        });
    }

    private void setupTalhoes(Style style, @Nullable String geojson) {
        if (geojson == null || geojson.trim().isEmpty()) return;
        try {
            if (style.styleSourceExists(TALHOES_SOURCE)) {
                GeoJsonSource source = (GeoJsonSource) style.getSource(TALHOES_SOURCE);
                if (source != null) {
                    source.geometry(FeatureCollection.fromJson(geojson));
                }
                applyHighlight(style, AerialMapSessionStore.highlightedTalhaoId);
                return;
            }
            GeoJsonSource source = new GeoJsonSource.Builder(TALHOES_SOURCE)
                    .featureCollection(FeatureCollection.fromJson(geojson))
                    .build();
            style.addSource(source);

            FillLayer fill = new FillLayer(TALHOES_FILL_LAYER, TALHOES_SOURCE)
                    .fillColor("#2ecc71")
                    .fillOpacity(0.18);
            style.addLayer(fill);

            FillLayer highlight = new FillLayer(TALHOES_HIGHLIGHT_LAYER, TALHOES_SOURCE)
                    .fillColor("#f1c40f")
                    .fillOpacity(0.45)
                    .filter(Expression.literal(false));
            style.addLayer(highlight);

            LineLayer border = new LineLayer(TALHOES_BORDER_LAYER, TALHOES_SOURCE)
                    .lineColor("#145a32")
                    .lineWidth(1.6)
                    .lineOpacity(0.85);
            style.addLayer(border);

            applyHighlight(style, AerialMapSessionStore.highlightedTalhaoId);
        } catch (Exception e) {
            Log.e(TAG, "Falha ao desenhar talhões", e);
        }
    }

    private void setupArmadilhas(Style style, @Nullable String geojson) {
        if (geojson == null || geojson.trim().isEmpty()) return;
        try {
            if (style.styleSourceExists(ARMADILHAS_SOURCE)) {
                GeoJsonSource source = (GeoJsonSource) style.getSource(ARMADILHAS_SOURCE);
                if (source != null) {
                    source.geometry(FeatureCollection.fromJson(geojson));
                }
                return;
            }
            GeoJsonSource source = new GeoJsonSource.Builder(ARMADILHAS_SOURCE)
                    .featureCollection(FeatureCollection.fromJson(geojson))
                    .build();
            style.addSource(source);

            CircleLayer circle = new CircleLayer(ARMADILHAS_CIRCLE_LAYER, ARMADILHAS_SOURCE)
                    .circleRadius(6.0)
                    .circleColor("#e74c3c")
                    .circleStrokeColor("#ffffff")
                    .circleStrokeWidth(1.4);
            style.addLayer(circle);
        } catch (Exception e) {
            Log.e(TAG, "Falha ao desenhar armadilhas", e);
        }
    }

    private void applyHighlight(Style style, @Nullable String talhaoId) {
        if (!style.styleLayerExists(TALHOES_HIGHLIGHT_LAYER)) return;
        FillLayer highlightLayer = (FillLayer) style.getLayer(TALHOES_HIGHLIGHT_LAYER);
        if (highlightLayer == null) return;

        if (talhaoId == null || talhaoId.trim().isEmpty()) {
            highlightLayer.filter(Expression.literal(false));
            return;
        }
        highlightLayer.filter(Expression.eq(Expression.get("id"), Expression.literal(talhaoId)));
    }
}

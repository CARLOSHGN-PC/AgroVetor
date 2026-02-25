package com.agrovetor.app.aerial;

import android.os.Bundle;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;

import com.agrovetor.app.R;
import com.agrovetor.app.plugins.AerialMapPlugin;
import com.mapbox.common.MapboxOptions;
import com.mapbox.geojson.Feature;
import com.mapbox.geojson.FeatureCollection;
import com.mapbox.geojson.Point;
import com.mapbox.maps.MapView;
import com.mapbox.maps.QueriedRenderedFeature;
import com.mapbox.maps.RenderedQueryGeometry;
import com.mapbox.maps.Style;
import com.mapbox.maps.ScreenCoordinate;
import com.mapbox.maps.extension.style.expressions.generated.Expression;
import com.mapbox.maps.extension.style.layers.generated.FillLayer;
import com.mapbox.maps.extension.style.layers.generated.LineLayer;
import com.mapbox.maps.extension.style.sources.generated.GeoJsonSource;
import com.mapbox.maps.plugin.gestures.OnMapClickListener;
import com.mapbox.maps.RenderedQueryOptions;

import java.util.Collections;
import java.util.List;
import java.lang.reflect.Method;

public class NativeAerialMapActivity extends AppCompatActivity implements OnMapClickListener {
    private static final String TAG = "NativeAerialMapActivity";
    private static final String TALHOES_SOURCE = "native-talhoes-source";
    private static final String TALHOES_FILL_LAYER = "native-talhoes-fill";
    private static final String TALHOES_BORDER_LAYER = "native-talhoes-border";

    private MapView mapView;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_aerial_map);

        MapboxOptions.accessToken = getString(R.string.mapbox_access_token);
        mapView = findViewById(R.id.nativeAerialMapView);
        mapView.getMapboxMap().loadStyleUri(AerialMapSessionStore.styleUri, style -> {
            setupTalhoes(style);
            setupCamera();
        });

        mapView.getGesturesPlugin().addOnMapClickListener(this);
    }

    private void setupCamera() {
        mapView.getMapboxMap().setCamera(new com.mapbox.maps.CameraOptions.Builder()
                .center(com.mapbox.geojson.Point.fromLngLat(AerialMapSessionStore.center[0], AerialMapSessionStore.center[1]))
                .zoom(AerialMapSessionStore.zoom)
                .build());
    }

    private void setupTalhoes(Style style) {
        if (AerialMapSessionStore.talhoesGeoJson == null) return;
        try {
            FeatureCollection featureCollection = FeatureCollection.fromJson(AerialMapSessionStore.talhoesGeoJson);
            GeoJsonSource source = new GeoJsonSource.Builder(TALHOES_SOURCE)
                    .featureCollection(featureCollection)
                    .build();
            source.bindTo(style);

            FillLayer fillLayer = new FillLayer(TALHOES_FILL_LAYER, TALHOES_SOURCE)
                    .fillOpacity(0.65)
                    .fillColor(Expression.rgb(27.0, 94.0, 32.0));
            fillLayer.bindTo(style);

            LineLayer lineLayer = new LineLayer(TALHOES_BORDER_LAYER, TALHOES_SOURCE)
                    .lineColor(Expression.rgb(255.0, 255.0, 255.0))
                    .lineWidth(2.0);
            lineLayer.bindTo(style);
        } catch (Exception error) {
            Log.e(TAG, "Falha ao desenhar talhões", error);
            AerialMapPlugin.notifyError("Falha ao desenhar talhões no mapa nativo", error.getMessage());
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
            if (feature != null) {
                AerialMapPlugin.notifyTalhaoClick(feature.toJson());
            }
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

    @Override
    protected void onDestroy() {
        if (mapView != null) {
            mapView.getGesturesPlugin().removeOnMapClickListener(this);
        }
        super.onDestroy();
    }
}

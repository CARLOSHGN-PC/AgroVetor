package com.agrovetor.app.aerial;

import android.graphics.PointF;
import android.os.Bundle;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;

import com.agrovetor.app.R;
import com.agrovetor.app.plugins.AerialMapPlugin;
import com.mapbox.geojson.Feature;
import com.mapbox.geojson.FeatureCollection;
import com.mapbox.geojson.Point;
import com.mapbox.maps.MapView;
import com.mapbox.maps.MapboxOptions;
import com.mapbox.maps.Style;
import com.mapbox.maps.extension.style.expressions.generated.Expression;
import com.mapbox.maps.extension.style.layers.generated.FillLayer;
import com.mapbox.maps.extension.style.layers.generated.LineLayer;
import com.mapbox.maps.extension.style.sources.generated.GeoJsonSource;
import com.mapbox.maps.plugin.gestures.OnMapClickListener;
import com.mapbox.maps.RenderedQueryOptions;

import java.util.Collections;
import java.util.List;

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

        mapView.getGestures().addOnMapClickListener(this);
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
            style.addSource(source);

            FillLayer fillLayer = new FillLayer(TALHOES_FILL_LAYER, TALHOES_SOURCE)
                    .fillOpacity(0.65)
                    .fillColor(Expression.rgb(27.0, 94.0, 32.0));
            style.addLayer(fillLayer);

            LineLayer lineLayer = new LineLayer(TALHOES_BORDER_LAYER, TALHOES_SOURCE)
                    .lineColor(Expression.rgb(255.0, 255.0, 255.0))
                    .lineWidth(2.0);
            style.addLayer(lineLayer);
        } catch (Exception error) {
            Log.e(TAG, "Falha ao desenhar talhões", error);
            AerialMapPlugin.notifyError("Falha ao desenhar talhões no mapa nativo", error.getMessage());
        }
    }

    @Override
    public boolean onMapClick(@androidx.annotation.NonNull Point point) {
        PointF screenPoint = mapView.getMapboxMap().pixelForCoordinate(point);
        RenderedQueryOptions options = new RenderedQueryOptions(Collections.singletonList(TALHOES_FILL_LAYER), null);

        mapView.getMapboxMap().queryRenderedFeatures(screenPoint, options, queryFeatures -> {
            List<com.mapbox.maps.QueriedRenderedFeature> queried = queryFeatures.getValue();
            if (queried == null || queried.isEmpty()) return;

            Feature feature = queried.get(0).getQueriedFeature().getFeature();
            if (feature != null) {
                AerialMapPlugin.notifyTalhaoClick(feature.toJson());
            }
        });
        return true;
    }

    @Override
    protected void onDestroy() {
        if (mapView != null) {
            mapView.getGestures().removeOnMapClickListener(this);
        }
        super.onDestroy();
    }
}

package com.agrovetor.app;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.mapbox.maps.GlyphsRasterizationMode;
import com.mapbox.maps.OfflineManager;
import com.mapbox.maps.StylePackLoadOptions;
import com.mapbox.maps.extension.style.sources.generated.GeoJsonSource;
import com.mapbox.maps.plugin.offline.OfflineCallback;
import com.mapbox.maps.plugin.offline.OfflineRegion;
import com.mapbox.maps.plugin.offline.OfflineRegionError;
import com.mapbox.maps.plugin.offline.OfflineRegionStatus;
import com.mapbox.maps.plugin.offline.createOfflineRegion;

import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "MapboxOffline")
public class MapboxOfflinePlugin extends Plugin {

    private OfflineManager offlineManager;

    @Override
    public void load() {
        super.load();
        this.offlineManager = new OfflineManager(getContext());
    }

    @PluginMethod
    public void echo(PluginCall call) {
        String value = call.getString("value");

        JSObject ret = new JSObject();
        ret.put("value", "Native echo: " + value);
        call.resolve(ret);
    }

    @PluginMethod
    public void downloadRegion(PluginCall call) {
        String geoJsonStr = call.getString("geoJson");
        String regionName = call.getString("regionName");

        if (geoJsonStr == null || regionName == null) {
            call.reject("Missing required parameters: geoJson and regionName");
            return;
        }

        try {
            // 1. Create Metadata
            JSONObject metadata = new JSONObject();
            metadata.put("name", regionName);

            // 2. Define Geometry from GeoJSON
            // This part is tricky as the SDK expects a specific Geometry object, not just GeoJSON string.
            // For simplicity, we'll assume a bounding box can be extracted or the user provides it.
            // For a real implementation, you would parse the GeoJSON string.
            // Let's assume the call includes a bounding box for this example.
            // Double minZoom = call.getDouble("minZoom", 10.0);
            // Double maxZoom = call.getDouble("maxZoom", 16.0);
            // LatLngBounds bounds = ...; // You'd need to create this from call data.
            // For now, let's proceed with Style Pack loading which is the first step.

            // 3. Create StylePackLoadOptions
            StylePackLoadOptions stylePackLoadOptions = new StylePackLoadOptions.Builder()
                .glyphsRasterizationMode(GlyphsRasterizationMode.IDEOGRAPHS_RASTERIZED_LOCALLY)
                .metadata(metadata.toString())
                .build();

            // 4. Load the style pack
            offlineManager.loadStylePack(
                "mapbox://styles/mapbox/satellite-streets-v12",
                stylePackLoadOptions,
                (completed, required) -> {
                    // This is a progress callback
                    Log.d("MapboxOffline", "StylePackLoadProgress: " + completed + "/" + required);
                    JSObject progressUpdate = new JSObject();
                    progressUpdate.put("type", "stylePackProgress");
                    progressUpdate.put("completed", completed);
                    progressUpdate.put("required", required);
                    notifyListeners("downloadProgress", progressUpdate);
                },
                result -> {
                    if (result.isValue()) {
                        Log.d("MapboxOffline", "Style pack loaded successfully.");
                        // Now you would typically proceed to load the tiles for a specific geometry.
                        // The `createOfflineRegion` method would be called here.
                        // This part is complex and requires more setup (like LatLngBounds).
                        // We will add this in the next step.

                        JSObject ret = new JSObject();
                        ret.put("message", "Style pack for '" + regionName + "' downloaded successfully. Tile download not yet implemented.");
                        call.resolve(ret);
                    } else {
                        Log.e("MapboxOffline", "Style pack failed to load: " + result.getError());
                        call.reject("Style pack failed to load: " + result.getError().getMessage());
                    }
                }
            );

        } catch (JSONException e) {
            call.reject("Invalid JSON for metadata: " + e.getMessage());
        } catch (Exception e) {
            call.reject("An unexpected error occurred: " + e.getMessage());
        }
    }
}

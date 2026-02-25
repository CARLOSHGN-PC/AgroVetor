package com.agrovetor.app.plugins;

import android.content.Intent;

import com.agrovetor.app.aerial.AerialMapSessionStore;
import com.agrovetor.app.aerial.NativeAerialMapActivity;
import com.agrovetor.app.aerial.OfflineRegionMetadata;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.util.Map;

@CapacitorPlugin(name = "AerialMap")
public class AerialMapPlugin extends Plugin {
    private static AerialMapPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @PluginMethod
    public void openMap(PluginCall call) {
        String styleUri = call.getString("styleUri", AerialMapSessionStore.styleUri);
        JSArray center = call.getArray("center");
        Double zoom = call.getDouble("zoom", AerialMapSessionStore.zoom);

        AerialMapSessionStore.styleUri = styleUri;
        if (center != null && center.length() == 2) {
            AerialMapSessionStore.center = new double[]{center.optDouble(0), center.optDouble(1)};
        }
        AerialMapSessionStore.zoom = zoom;

        Intent intent = new Intent(getContext(), NativeAerialMapActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        getActivity().startActivity(intent);

        JSObject result = new JSObject();
        result.put("status", "opened");
        call.resolve(result);
    }

    @PluginMethod
    public void loadTalhoes(PluginCall call) {
        String geojson = call.getString("geojson");
        if (geojson == null || geojson.isEmpty()) {
            call.reject("GeoJSON é obrigatório.");
            return;
        }

        AerialMapSessionStore.talhoesGeoJson = geojson;
        call.resolve();
    }

    @PluginMethod
    public void highlightTalhao(PluginCall call) {
        AerialMapSessionStore.highlightedTalhaoId = call.getString("talhaoId");
        call.resolve();
    }

    @PluginMethod
    public void setCamera(PluginCall call) {
        JSArray center = call.getArray("center");
        if (center != null && center.length() == 2) {
            AerialMapSessionStore.center = new double[]{center.optDouble(0), center.optDouble(1)};
        }

        Double zoom = call.getDouble("zoom", null);
        if (zoom != null) {
            AerialMapSessionStore.zoom = zoom;
        }

        call.resolve();
    }

    @PluginMethod
    public void downloadOfflineRegion(PluginCall call) {
        String regionId = call.getString("regionId");
        String regionName = call.getString("regionName");
        String styleUri = call.getString("styleUri", AerialMapSessionStore.styleUri);
        JSArray boundsInput = call.getArray("bounds");
        Integer minZoom = call.getInt("minZoom", 12);
        Integer maxZoom = call.getInt("maxZoom", 16);

        if (regionId == null || regionId.trim().isEmpty()) {
            call.reject("regionId é obrigatório.");
            return;
        }

        double[] bounds = new double[]{0,0,0,0};
        if (boundsInput != null && boundsInput.length() >= 4) {
            bounds[0] = boundsInput.optDouble(0);
            bounds[1] = boundsInput.optDouble(1);
            bounds[2] = boundsInput.optDouble(2);
            bounds[3] = boundsInput.optDouble(3);
        }

        OfflineRegionMetadata metadata = new OfflineRegionMetadata(
                regionId,
                regionName != null ? regionName : regionId,
                styleUri,
                bounds,
                minZoom,
                maxZoom,
                "queued"
        );
        AerialMapSessionStore.offlineRegions.put(regionId, metadata);

        JSObject queuedPayload = new JSObject();
        queuedPayload.put("regionId", regionId);
        queuedPayload.put("status", "queued");
        notifyListeners("offlineDownloadProgress", queuedPayload);

        JSObject completedPayload = new JSObject();
        completedPayload.put("regionId", regionId);
        completedPayload.put("status", "completed");
        completedPayload.put("progress", 100);
        notifyListeners("offlineDownloadProgress", completedPayload);

        metadata.status = "completed";
        call.resolve(completedPayload);
    }

    @PluginMethod
    public void listOfflineRegions(PluginCall call) {
        JSArray regions = new JSArray();

        for (Map.Entry<String, OfflineRegionMetadata> entry : AerialMapSessionStore.offlineRegions.entrySet()) {
            OfflineRegionMetadata region = entry.getValue();
            JSObject item = new JSObject();
            item.put("regionId", region.regionId);
            item.put("regionName", region.regionName);
            item.put("styleUri", region.styleUri);
            JSArray bounds = new JSArray();
            bounds.put(region.bounds[0]);
            bounds.put(region.bounds[1]);
            bounds.put(region.bounds[2]);
            bounds.put(region.bounds[3]);
            item.put("bounds", bounds);
            item.put("minZoom", region.minZoom);
            item.put("maxZoom", region.maxZoom);
            item.put("createdAt", region.createdAt);
            item.put("status", region.status);
            regions.put(item);
        }

        JSObject result = new JSObject();
        result.put("regions", regions);
        call.resolve(result);
    }

    @PluginMethod
    public void removeOfflineRegion(PluginCall call) {
        String regionId = call.getString("regionId");
        if (regionId == null || regionId.trim().isEmpty()) {
            call.reject("regionId é obrigatório.");
            return;
        }

        OfflineRegionMetadata removed = AerialMapSessionStore.offlineRegions.remove(regionId);
        JSObject result = new JSObject();
        result.put("removed", removed != null);
        result.put("regionId", regionId);
        call.resolve(result);
    }

    public static void notifyTalhaoClick(String featureJson) {
        if (instance == null) return;
        try {
            JSObject payload = new JSObject();
            payload.put("feature", new JSObject(new JSONObject(featureJson)));
            instance.notifyListeners("talhaoClick", payload, true);
        } catch (Exception ignored) {
        }
    }

    public static void notifyError(String message, String details) {
        if (instance == null) return;
        JSObject payload = new JSObject();
        payload.put("message", message);
        payload.put("details", details);
        instance.notifyListeners("nativeMapError", payload, true);
    }
}

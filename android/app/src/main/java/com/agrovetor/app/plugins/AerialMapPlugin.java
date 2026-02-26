package com.agrovetor.app.plugins;

import android.content.Intent;
import android.util.Log;

import com.agrovetor.app.aerial.AerialMapSessionStore;
import com.agrovetor.app.aerial.AerialOfflinePackageManager;
import com.agrovetor.app.aerial.AerialOfflinePackageStatus;
import com.agrovetor.app.aerial.AerialOfflinePackageValidator;
import com.agrovetor.app.aerial.AerialOfflineRegionStore;
import com.agrovetor.app.aerial.NativeAerialMapActivity;
import com.agrovetor.app.aerial.OfflineRegionMetadata;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.util.List;

@CapacitorPlugin(name = "AerialMap")
public class AerialMapPlugin extends Plugin {
    private static final String TAG = "AerialOfflinePackage";
    private static AerialMapPlugin instance;

    private AerialOfflineRegionStore regionStore;
    private AerialOfflinePackageManager packageManager;
    private AerialOfflinePackageValidator validator;

    @Override
    public void load() {
        instance = this;
        regionStore = new AerialOfflineRegionStore(getContext());
        packageManager = new AerialOfflinePackageManager(getContext());
        validator = new AerialOfflinePackageValidator();
        refreshSessionCache();
        Log.i(TAG, "Plugin carregado. pacotes=" + AerialMapSessionStore.offlineRegions.size());
    }

    @PluginMethod
    public void openMap(PluginCall call) {
        String styleUri = call.getString("styleUri", AerialMapSessionStore.styleUri);
        JSArray center = call.getArray("center");
        Double zoomValue = call.getDouble("zoom", null);
        double zoom = zoomValue != null ? zoomValue : AerialMapSessionStore.zoom;

        AerialMapSessionStore.styleUri = styleUri;
        if (center != null && center.length() == 2) {
            AerialMapSessionStore.center = new double[]{center.optDouble(0), center.optDouble(1)};
        }
        AerialMapSessionStore.zoom = zoom;

        Intent intent = new Intent(getContext(), NativeAerialMapActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        getActivity().startActivity(intent);

        JSObject result = new JSObject();
        result.put("status", "opened");
        call.resolve(result);
    }

    @PluginMethod
    public void openOfflinePackage(PluginCall call) {
        String packageId = call.getString("packageId");
        OfflineRegionMetadata metadata = regionStore.findByRegionId(packageId);
        if (metadata == null) {
            call.reject("Pacote não encontrado: " + packageId);
            return;
        }
        AerialOfflinePackageValidator.ValidationResult result = validator.validate(getContext(), metadata);
        if (!result.isReady()) {
            call.reject(result.errorMessage);
            return;
        }
        if (!AerialOfflinePackageStatus.READY.equals(metadata.status)) {
            call.reject("Pacote offline não está pronto: " + metadata.status);
            return;
        }
        AerialMapSessionStore.styleUri = metadata.styleUri;
        AerialMapSessionStore.talhoesGeoJson = metadata.talhoesGeoJson;
        openMap(call);
    }

    @PluginMethod
    public void loadTalhoes(PluginCall call) {
        String geojson = call.getString("geojson");
        if (geojson == null || geojson.isEmpty()) {
            call.reject("GeoJSON é obrigatório.");
            return;
        }

        AerialMapSessionStore.talhoesGeoJson = geojson;
        NativeAerialMapActivity.reloadTalhoesIfVisible(geojson);
        call.resolve();
    }

    @PluginMethod
    public void highlightTalhao(PluginCall call) {
        AerialMapSessionStore.highlightedTalhaoId = call.getString("talhaoId");
        NativeAerialMapActivity.highlightTalhaoIfVisible(AerialMapSessionStore.highlightedTalhaoId);
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

        NativeAerialMapActivity.updateCameraIfVisible(AerialMapSessionStore.center, AerialMapSessionStore.zoom);
        call.resolve();
    }

    @PluginMethod
    public void prepareOfflinePackage(PluginCall call) {
        startOfflineDownload(call, false);
    }

    @PluginMethod
    public void updateOfflinePackage(PluginCall call) {
        startOfflineDownload(call, true);
    }

    @PluginMethod
    public void downloadOfflineRegion(PluginCall call) {
        startOfflineDownload(call, true);
    }

    private void startOfflineDownload(PluginCall call, boolean upsert) {
        String regionId = call.getString("regionId");
        String regionName = call.getString("regionName", regionId);
        String styleUri = call.getString("styleUri", AerialMapSessionStore.styleUri);
        JSArray boundsInput = call.getArray("bounds");
        if (regionId == null || regionId.trim().isEmpty() || styleUri == null || styleUri.trim().isEmpty() || boundsInput == null || boundsInput.length() < 4) {
            call.reject("Parâmetros obrigatórios: regionId, styleUri, bounds[4].");
            return;
        }
        OfflineRegionMetadata existing = regionStore.findByRegionId(regionId);
        if (existing != null && !upsert) {
            call.reject("Pacote já existe: " + regionId);
            return;
        }

        OfflineRegionMetadata metadata = existing != null ? existing : new OfflineRegionMetadata(regionId, regionName, styleUri,
                new double[]{boundsInput.optDouble(0), boundsInput.optDouble(1), boundsInput.optDouble(2), boundsInput.optDouble(3)},
                call.getInt("minZoom", 12), call.getInt("maxZoom", 16), AerialOfflinePackageStatus.QUEUED);

        metadata.packageId = call.getString("packageId", regionId);
        metadata.regionName = regionName;
        metadata.companyId = call.getString("companyId", null);
        metadata.farmId = call.getString("farmId", null);
        metadata.styleUri = styleUri;
        metadata.stylePackId = call.getString("stylePackId", styleUri);
        metadata.tileRegionId = call.getString("tileRegionId", regionId);
        metadata.bounds = new double[]{boundsInput.optDouble(0), boundsInput.optDouble(1), boundsInput.optDouble(2), boundsInput.optDouble(3)};
        metadata.minZoom = call.getInt("minZoom", 12);
        metadata.maxZoom = call.getInt("maxZoom", 16);
        metadata.talhoesGeoJson = call.getString("talhoesGeoJson", metadata.talhoesGeoJson);
        metadata.armadilhasGeoJson = call.getString("armadilhasGeoJson", metadata.armadilhasGeoJson);
        metadata.status = upsert && existing != null ? AerialOfflinePackageStatus.UPDATE_AVAILABLE : AerialOfflinePackageStatus.QUEUED;
        metadata.errorMessage = null;

        persistMetadata(metadata);
        call.resolve(metadata.toJSObject());

        packageManager.downloadPackage(metadata, new AerialOfflinePackageManager.Listener() {
            @Override
            public void onProgress(OfflineRegionMetadata updated, int progress) {
                persistMetadata(updated);
                JSObject payload = updated.toJSObject();
                payload.put("progress", progress);
                notifyListeners("offlineDownloadProgress", payload, true);
            }

            @Override
            public void onFinished(OfflineRegionMetadata updated) {
                persistMetadata(updated);
                JSObject payload = updated.toJSObject();
                payload.put("progress", 100);
                notifyListeners("offlineDownloadProgress", payload, true);
                if (updated.errorMessage != null) {
                    notifyError("Falha no pacote offline", updated.errorMessage);
                }
            }
        });
    }

    @PluginMethod
    public void listOfflinePackages(PluginCall call) {
        listOfflineRegions(call);
    }

    @PluginMethod
    public void listOfflineRegions(PluginCall call) {
        List<OfflineRegionMetadata> regionsList = regionStore.readAll();
        JSArray regions = new JSArray();
        for (OfflineRegionMetadata region : regionsList) {
            regions.put(region.toJSObject());
        }
        refreshSessionCache();
        JSObject result = new JSObject();
        result.put("regions", regions);
        call.resolve(result);
    }

    @PluginMethod
    public void removeOfflineRegion(PluginCall call) {
        removeOfflinePackage(call);
    }

    @PluginMethod
    public void removeOfflinePackage(PluginCall call) {
        String regionId = call.getString("regionId", call.getString("packageId"));
        if (regionId == null || regionId.trim().isEmpty()) {
            call.reject("regionId é obrigatório.");
            return;
        }
        boolean removed = regionStore.remove(regionId);
        AerialMapSessionStore.offlineRegions.remove(regionId);
        JSObject payload = new JSObject();
        payload.put("regionId", regionId);
        payload.put("removed", removed);
        payload.put("status", removed ? "removed" : "failed");
        notifyListeners("offlineDownloadProgress", payload, true);
        call.resolve(payload);
    }

    @PluginMethod
    public void getOfflineStatus(PluginCall call) {
        List<OfflineRegionMetadata> regions = regionStore.readAll();
        JSArray regionsPayload = new JSArray();
        int readyCount = 0;
        for (OfflineRegionMetadata metadata : regions) {
            regionsPayload.put(metadata.toJSObject());
            if (AerialOfflinePackageStatus.READY.equals(metadata.status)) {
                readyCount++;
            }
        }

        JSObject result = new JSObject();
        result.put("regions", regionsPayload);
        result.put("total", regions.size());
        result.put("ready", readyCount);
        call.resolve(result);
    }

    private void persistMetadata(OfflineRegionMetadata metadata) {
        metadata.updatedAt = System.currentTimeMillis();
        regionStore.upsert(metadata);
        AerialMapSessionStore.offlineRegions.put(metadata.regionId, metadata);
    }

    private void refreshSessionCache() {
        AerialMapSessionStore.offlineRegions.clear();
        for (OfflineRegionMetadata metadata : regionStore.readAll()) {
            AerialMapSessionStore.offlineRegions.put(metadata.regionId, metadata);
        }
    }

    public static void notifyTalhaoClick(String featureJson) {
        if (instance == null) return;
        try {
            JSObject payload = new JSObject();
            payload.put("feature", new JSONObject(featureJson));
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
        instance.notifyListeners("error", payload, true);
    }
}

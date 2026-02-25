package com.agrovetor.app.plugins;

import android.content.Intent;
import android.util.Log;

import androidx.annotation.NonNull;

import com.agrovetor.app.aerial.AerialMapSessionStore;
import com.agrovetor.app.aerial.AerialOfflineRegionStore;
import com.agrovetor.app.aerial.NativeAerialMapActivity;
import com.agrovetor.app.aerial.OfflineRegionMetadata;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.mapbox.common.GlyphsRasterizationMode;
import com.mapbox.common.TileRegion;
import com.mapbox.common.TileRegionLoadOptions;
import com.mapbox.common.TileRegionLoadProgress;
import com.mapbox.common.TileStore;
import com.mapbox.common.TilesetDescriptor;
import com.mapbox.common.TilesetDescriptorOptions;
import com.mapbox.geojson.Point;
import com.mapbox.geojson.Polygon;
import com.mapbox.maps.OfflineManager;
import com.mapbox.maps.StylePackLoadOptions;
import com.mapbox.maps.StylePackLoadProgress;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@CapacitorPlugin(name = "AerialMap")
public class AerialMapPlugin extends Plugin {
    private static final String TAG = "AerialMapPlugin";
    private static AerialMapPlugin instance;

    private AerialOfflineRegionStore regionStore;
    private TileStore tileStore;
    private OfflineManager offlineManager;

    @Override
    public void load() {
        instance = this;
        regionStore = new AerialOfflineRegionStore(getContext());
        tileStore = TileStore.create();
        offlineManager = new OfflineManager();

        for (OfflineRegionMetadata metadata : regionStore.readAll()) {
            AerialMapSessionStore.offlineRegions.put(metadata.regionId, metadata);
        }
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
    public void downloadOfflineRegion(PluginCall call) {
        String regionId = call.getString("regionId");
        String regionName = call.getString("regionName");
        String styleUri = call.getString("styleUri", AerialMapSessionStore.styleUri);
        JSArray boundsInput = call.getArray("bounds");
        Integer minZoomValue = call.getInt("minZoom", 12);
        Integer maxZoomValue = call.getInt("maxZoom", 16);
        int minZoom = minZoomValue != null ? minZoomValue : 12;
        int maxZoom = maxZoomValue != null ? maxZoomValue : 16;

        String validationError = validateOfflineDownloadParams(regionId, styleUri, boundsInput, minZoom, maxZoom);
        if (validationError != null) {
            call.reject(validationError);
            return;
        }

        OfflineRegionMetadata existing = regionStore.findByRegionId(regionId);
        if (existing != null && !"failed".equals(existing.status)) {
            call.reject("regionId já existe: " + regionId);
            return;
        }

        double[] bounds = new double[]{
                boundsInput.optDouble(0),
                boundsInput.optDouble(1),
                boundsInput.optDouble(2),
                boundsInput.optDouble(3)
        };

        OfflineRegionMetadata metadata = new OfflineRegionMetadata(
                regionId,
                regionName != null ? regionName : regionId,
                styleUri,
                bounds,
                minZoom,
                maxZoom,
                "queued"
        );

        if (!persistRegion(metadata)) {
            call.reject("Falha ao persistir metadados offline antes do download.");
            return;
        }

        emitOfflineProgress(metadata, 0);
        call.resolve(metadata.toJSObject());

        runOfflineDownload(metadata);
    }

    @PluginMethod
    public void listOfflineRegions(PluginCall call) {
        List<OfflineRegionMetadata> regionsList = regionStore.readAll();
        JSArray regions = new JSArray();

        AerialMapSessionStore.offlineRegions.clear();
        for (OfflineRegionMetadata region : regionsList) {
            AerialMapSessionStore.offlineRegions.put(region.regionId, region);
            regions.put(region.toJSObject());
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

        OfflineRegionMetadata metadata = regionStore.findByRegionId(regionId);
        if (metadata == null) {
            JSObject result = new JSObject();
            result.put("removed", false);
            result.put("regionId", regionId);
            result.put("message", "Região não encontrada.");
            call.resolve(result);
            return;
        }

        metadata.status = "removing";
        metadata.updatedAt = System.currentTimeMillis();
        persistRegion(metadata);
        emitOfflineProgress(metadata, 0);

        tileStore.removeTileRegion(metadata.tileRegionId, tileExpected -> {
            boolean tileRemoved = tileExpected != null && tileExpected.isValue();
            if (tileExpected != null && tileExpected.isError()) {
                Log.e(TAG, "Falha ao remover tile region " + metadata.tileRegionId + ": " + tileExpected.getError());
            }

            offlineManager.removeStylePack(metadata.stylePackId, styleExpected -> {
                boolean styleRemoved = styleExpected != null && styleExpected.isValue();
                if (styleExpected != null && styleExpected.isError()) {
                    Log.e(TAG, "Falha ao remover style pack " + metadata.stylePackId + ": " + styleExpected.getError());
                }

                boolean metadataRemoved = regionStore.remove(regionId);
                AerialMapSessionStore.offlineRegions.remove(regionId);

                JSObject result = new JSObject();
                result.put("regionId", regionId);
                result.put("removed", tileRemoved || styleRemoved || metadataRemoved);
                result.put("tileRemoved", tileRemoved);
                result.put("styleRemoved", styleRemoved);
                result.put("metadataRemoved", metadataRemoved);

                if (!metadataRemoved) {
                    notifyError("Falha na remoção da região offline", "Remoção parcial: tile/style removidos, mas metadados persistidos.");
                }

                Boolean removedObj = result.getBool("removed");
                emitRemovalCompleted(regionId, Boolean.TRUE.equals(removedObj));
                call.resolve(result);
            });
        });
    }

    private void runOfflineDownload(@NonNull OfflineRegionMetadata metadata) {
        metadata.status = "downloading";
        metadata.updatedAt = System.currentTimeMillis();
        persistRegion(metadata);
        emitOfflineProgress(metadata, 0);

        TilesetDescriptor descriptor = offlineManager.createTilesetDescriptor(
                new TilesetDescriptorOptions.Builder()
                        .styleURI(metadata.styleUri)
                        .minZoom((byte) metadata.minZoom)
                        .maxZoom((byte) metadata.maxZoom)
                        .build()
        );

        StylePackLoadOptions stylePackLoadOptions = new StylePackLoadOptions.Builder()
                .glyphsRasterizationMode(GlyphsRasterizationMode.IDEOGRAPHS_RASTERIZED_LOCALLY)
                .build();

        Log.i(TAG, "Iniciando download de style pack para região " + metadata.regionId);
        offlineManager.loadStylePack(metadata.styleUri, stylePackLoadOptions, styleProgress -> {
            emitOfflineProgress(metadata, calculateProgress(styleProgress, null));
        }, styleExpected -> {
            if (styleExpected == null || styleExpected.isError()) {
                String message = styleExpected == null ? "Falha desconhecida ao baixar style pack" : String.valueOf(styleExpected.getError());
                markDownloadFailed(metadata, "Falha no style pack: " + message);
                return;
            }

            Log.i(TAG, "Style pack concluído para região " + metadata.regionId);
            startTileRegionDownload(metadata, descriptor);
        });
    }

    private void startTileRegionDownload(@NonNull OfflineRegionMetadata metadata, @NonNull TilesetDescriptor descriptor) {
        List<Point> ring = new ArrayList<>();
        ring.add(Point.fromLngLat(metadata.bounds[0], metadata.bounds[1]));
        ring.add(Point.fromLngLat(metadata.bounds[2], metadata.bounds[1]));
        ring.add(Point.fromLngLat(metadata.bounds[2], metadata.bounds[3]));
        ring.add(Point.fromLngLat(metadata.bounds[0], metadata.bounds[3]));
        ring.add(Point.fromLngLat(metadata.bounds[0], metadata.bounds[1]));
        Polygon polygon = Polygon.fromLngLats(Collections.singletonList(ring));

        TileRegionLoadOptions tileRegionLoadOptions = new TileRegionLoadOptions.Builder()
                .geometry(polygon)
                .descriptors(Collections.singletonList(descriptor))
                .acceptExpired(true)
                .networkRestriction(com.mapbox.common.NetworkRestriction.NONE)
                .build();

        Log.i(TAG, "Iniciando download de tile region para " + metadata.regionId);
        tileStore.loadTileRegion(metadata.tileRegionId, tileRegionLoadOptions, tileProgress -> {
            emitOfflineProgress(metadata, calculateProgress(null, tileProgress));
        }, tileExpected -> {
            if (tileExpected == null || tileExpected.isError()) {
                String message = tileExpected == null ? "Falha desconhecida ao baixar tile region" : String.valueOf(tileExpected.getError());
                markDownloadFailed(metadata, "Falha na tile region: " + message);
                return;
            }

            TileRegion region = tileExpected.getValue();
            Log.i(TAG, "Tile region concluída para " + metadata.regionId + ", id=" + region.getId());
            metadata.status = "ready";
            metadata.updatedAt = System.currentTimeMillis();
            metadata.errorMessage = null;
            persistRegion(metadata);

            JSObject payload = metadata.toJSObject();
            payload.put("progress", 100);
            payload.put("status", "completed");
            notifyListeners("offlineDownloadProgress", payload, true);
        });
    }

    private void markDownloadFailed(OfflineRegionMetadata metadata, String errorMessage) {
        metadata.status = "failed";
        metadata.updatedAt = System.currentTimeMillis();
        metadata.errorMessage = errorMessage;
        persistRegion(metadata);

        JSObject payload = metadata.toJSObject();
        payload.put("status", "failed");
        payload.put("progress", 0);
        payload.put("message", errorMessage);
        notifyListeners("offlineDownloadProgress", payload, true);
        notifyError("Falha no download offline", errorMessage);
    }

    private void emitOfflineProgress(OfflineRegionMetadata metadata, int progress) {
        JSObject payload = metadata.toJSObject();
        payload.put("progress", progress);
        notifyListeners("offlineDownloadProgress", payload, true);
    }

    private void emitRemovalCompleted(String regionId, boolean removed) {
        JSObject payload = new JSObject();
        payload.put("regionId", regionId);
        payload.put("status", removed ? "removed" : "failed");
        payload.put("progress", 100);
        notifyListeners("offlineDownloadProgress", payload, true);
    }

    private boolean persistRegion(OfflineRegionMetadata metadata) {
        metadata.updatedAt = System.currentTimeMillis();
        boolean saved = regionStore.upsert(metadata);
        if (saved) {
            AerialMapSessionStore.offlineRegions.put(metadata.regionId, metadata);
        }
        return saved;
    }

    private int calculateProgress(StylePackLoadProgress styleProgress, TileRegionLoadProgress tileProgress) {
        if (tileProgress != null) {
            long required = tileProgress.getRequiredResourceCount();
            long completed = tileProgress.getCompletedResourceCount();
            if (required <= 0) {
                return 0;
            }
            return (int) Math.min(100, (completed * 100) / required);
        }

        if (styleProgress != null) {
            long required = styleProgress.getRequiredResourceCount();
            long completed = styleProgress.getCompletedResourceCount();
            if (required <= 0) {
                return 0;
            }
            return (int) Math.min(90, (completed * 90) / required);
        }

        return 0;
    }

    private String validateOfflineDownloadParams(String regionId, String styleUri, JSArray boundsInput, int minZoom, int maxZoom) {
        if (regionId == null || regionId.trim().isEmpty()) {
            return "regionId é obrigatório.";
        }
        if (styleUri == null || styleUri.trim().isEmpty()) {
            return "styleUri é obrigatório.";
        }
        if (boundsInput == null || boundsInput.length() < 4) {
            return "bounds deve conter [west, south, east, north].";
        }
        if (minZoom < 0 || maxZoom < 0 || minZoom > maxZoom) {
            return "minZoom/maxZoom inválidos.";
        }
        return null;
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

package com.agrovetor.app.aerial;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public class AerialOfflineRegionStore {
    private static final String TAG = "AerialOfflineRegionStore";
    private static final String PREF_NAME = "agrovetor_aerial_offline";
    private static final String KEY_REGIONS = "regions_json";

    private final SharedPreferences preferences;

    public AerialOfflineRegionStore(Context context) {
        this.preferences = context.getApplicationContext().getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
    }

    public synchronized List<OfflineRegionMetadata> readAll() {
        List<OfflineRegionMetadata> regions = new ArrayList<>();
        String raw = preferences.getString(KEY_REGIONS, "[]");
        try {
            JSONArray array = new JSONArray(raw);
            for (int i = 0; i < array.length(); i++) {
                JSONObject json = array.optJSONObject(i);
                if (json == null) {
                    continue;
                }
                OfflineRegionMetadata region = fromJson(json);
                if (region != null) {
                    regions.add(region);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Falha ao carregar metadados offline persistidos", e);
        }
        return regions;
    }

    public synchronized OfflineRegionMetadata findByRegionId(String regionId) {
        List<OfflineRegionMetadata> regions = readAll();
        for (OfflineRegionMetadata region : regions) {
            if (regionId.equals(region.regionId) || regionId.equals(region.packageId)) {
                return region;
            }
        }
        return null;
    }

    public synchronized boolean upsert(OfflineRegionMetadata metadata) {
        List<OfflineRegionMetadata> regions = readAll();
        boolean replaced = false;
        for (int i = 0; i < regions.size(); i++) {
            OfflineRegionMetadata current = regions.get(i);
            if (metadata.regionId.equals(current.regionId) || metadata.packageId.equals(current.packageId)) {
                regions.set(i, metadata);
                replaced = true;
                break;
            }
        }
        if (!replaced) {
            regions.add(metadata);
        }
        return saveAll(regions);
    }

    public synchronized boolean remove(String regionId) {
        List<OfflineRegionMetadata> regions = readAll();
        boolean changed = regions.removeIf(region -> regionId.equals(region.regionId) || regionId.equals(region.packageId));
        if (!changed) {
            return true;
        }
        return saveAll(regions);
    }

    private boolean saveAll(List<OfflineRegionMetadata> regions) {
        JSONArray array = new JSONArray();
        try {
            for (OfflineRegionMetadata region : regions) {
                JSONObject json = new JSONObject();
                json.put("packageId", region.packageId);
                json.put("regionId", region.regionId);
                json.put("regionName", region.regionName);
                json.put("companyId", region.companyId);
                json.put("farmId", region.farmId);
                json.put("styleUri", region.styleUri);
                json.put("minZoom", region.minZoom);
                json.put("maxZoom", region.maxZoom);
                json.put("createdAt", region.createdAt);
                json.put("updatedAt", region.updatedAt);
                json.put("lastValidatedAt", region.lastValidatedAt);
                json.put("status", region.status);
                json.put("tileRegionId", region.tileRegionId);
                json.put("stylePackId", region.stylePackId);
                json.put("hasStylePack", region.hasStylePack);
                json.put("hasTileRegion", region.hasTileRegion);
                json.put("hasTalhoes", region.hasTalhoes);
                json.put("hasArmadilhas", region.hasArmadilhas);
                if (region.errorMessage != null) {
                    json.put("errorMessage", region.errorMessage);
                }
                if (region.talhoesGeoJson != null) {
                    json.put("talhoesGeoJson", region.talhoesGeoJson);
                }
                if (region.armadilhasGeoJson != null) {
                    json.put("armadilhasGeoJson", region.armadilhasGeoJson);
                }

                JSONArray bounds = new JSONArray();
                if (region.bounds != null && region.bounds.length >= 4) {
                    bounds.put(region.bounds[0]);
                    bounds.put(region.bounds[1]);
                    bounds.put(region.bounds[2]);
                    bounds.put(region.bounds[3]);
                }
                json.put("bounds", bounds);
                array.put(json);
            }

            return preferences.edit().putString(KEY_REGIONS, array.toString()).commit();
        } catch (Exception e) {
            Log.e(TAG, "Falha ao persistir metadados offline", e);
            return false;
        }
    }

    private OfflineRegionMetadata fromJson(JSONObject json) {
        try {
            String regionId = json.optString("regionId", null);
            if (regionId == null || regionId.trim().isEmpty()) {
                return null;
            }

            JSONArray boundsInput = json.optJSONArray("bounds");
            double[] bounds = new double[]{0, 0, 0, 0};
            if (boundsInput != null && boundsInput.length() >= 4) {
                bounds[0] = boundsInput.optDouble(0);
                bounds[1] = boundsInput.optDouble(1);
                bounds[2] = boundsInput.optDouble(2);
                bounds[3] = boundsInput.optDouble(3);
            }

            OfflineRegionMetadata metadata = new OfflineRegionMetadata(
                    regionId,
                    json.optString("regionName", regionId),
                    json.optString("styleUri", "mapbox://styles/mapbox/standard-satellite"),
                    bounds,
                    json.optInt("minZoom", 12),
                    json.optInt("maxZoom", 16),
                    json.optString("status", "queued")
            );

            metadata.packageId = json.optString("packageId", metadata.regionId);
            metadata.companyId = json.optString("companyId", null);
            metadata.farmId = json.optString("farmId", null);
            metadata.createdAt = json.optLong("createdAt", metadata.createdAt);
            metadata.updatedAt = json.optLong("updatedAt", metadata.updatedAt);
            metadata.lastValidatedAt = json.optLong("lastValidatedAt", 0L);
            metadata.tileRegionId = json.optString("tileRegionId", metadata.regionId);
            metadata.stylePackId = json.optString("stylePackId", metadata.styleUri);
            metadata.hasStylePack = json.optBoolean("hasStylePack", false);
            metadata.hasTileRegion = json.optBoolean("hasTileRegion", false);
            metadata.hasTalhoes = json.optBoolean("hasTalhoes", false);
            metadata.hasArmadilhas = json.optBoolean("hasArmadilhas", false);
            metadata.errorMessage = json.optString("errorMessage", null);
            metadata.talhoesGeoJson = json.optString("talhoesGeoJson", null);
            metadata.armadilhasGeoJson = json.optString("armadilhasGeoJson", null);
            return metadata;
        } catch (Exception e) {
            Log.e(TAG, "Falha ao desserializar metadado offline", e);
            return null;
        }
    }
}

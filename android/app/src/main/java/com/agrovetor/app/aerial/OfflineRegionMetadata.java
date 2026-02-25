package com.agrovetor.app.aerial;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONException;

public class OfflineRegionMetadata {
    public String regionId;
    public String regionName;
    public String styleUri;
    public double[] bounds;
    public Integer minZoom;
    public Integer maxZoom;
    public long createdAt;
    public long updatedAt;
    public String status;
    public String tileRegionId;
    public String stylePackId;
    public String errorMessage;

    public OfflineRegionMetadata(String regionId, String regionName, String styleUri, double[] bounds, Integer minZoom, Integer maxZoom, String status) {
        this.regionId = regionId;
        this.regionName = regionName;
        this.styleUri = styleUri;
        this.bounds = bounds;
        this.minZoom = minZoom;
        this.maxZoom = maxZoom;
        long now = System.currentTimeMillis();
        this.createdAt = now;
        this.updatedAt = now;
        this.status = status;
        this.tileRegionId = regionId;
        this.stylePackId = styleUri;
        this.errorMessage = null;
    }

    public JSObject toJSObject() {
        JSObject item = new JSObject();
        item.put("regionId", regionId);
        item.put("regionName", regionName);
        item.put("styleUri", styleUri);

        JSArray boundsArray = new JSArray();
        if (bounds != null && bounds.length >= 4) {
            try {
                boundsArray.put(bounds[0]);
                boundsArray.put(bounds[1]);
                boundsArray.put(bounds[2]);
                boundsArray.put(bounds[3]);
            } catch (JSONException ignored) {
            }
        }

        item.put("bounds", boundsArray);
        item.put("minZoom", minZoom);
        item.put("maxZoom", maxZoom);
        item.put("createdAt", createdAt);
        item.put("updatedAt", updatedAt);
        item.put("status", status);
        item.put("tileRegionId", tileRegionId);
        item.put("stylePackId", stylePackId);
        if (errorMessage != null) {
            item.put("errorMessage", errorMessage);
        }
        return item;
    }
}

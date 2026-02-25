package com.agrovetor.app.aerial;

public class OfflineRegionMetadata {
    public String regionId;
    public String regionName;
    public String styleUri;
    public double[] bounds;
    public Integer minZoom;
    public Integer maxZoom;
    public long createdAt;
    public String status;

    public OfflineRegionMetadata(String regionId, String regionName, String styleUri, double[] bounds, Integer minZoom, Integer maxZoom, String status) {
        this.regionId = regionId;
        this.regionName = regionName;
        this.styleUri = styleUri;
        this.bounds = bounds;
        this.minZoom = minZoom;
        this.maxZoom = maxZoom;
        this.createdAt = System.currentTimeMillis();
        this.status = status;
    }
}

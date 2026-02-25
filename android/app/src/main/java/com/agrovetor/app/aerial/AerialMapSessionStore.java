package com.agrovetor.app.aerial;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public final class AerialMapSessionStore {
    public static String styleUri = "mapbox://styles/mapbox/standard-satellite";
    public static double[] center = new double[]{-48.45, -21.17};
    public static double zoom = 12.0;
    public static String talhoesGeoJson = null;
    public static String highlightedTalhaoId = null;
    public static final Map<String, OfflineRegionMetadata> offlineRegions = new ConcurrentHashMap<>();

    private AerialMapSessionStore() {}
}

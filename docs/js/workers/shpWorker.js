/* eslint-disable no-restricted-globals */
importScripts('../lib/shp.js');
importScripts('../../vendor/proj4.js');

const hasProj4 = typeof self.proj4 === 'function';
if (!hasProj4) {
  console.error('[SHP Worker] Proj4 local não carregado. A reprojeção foi desativada, mas o desenho seguirá com CRS original.');
}

if (hasProj4) {
  proj4.defs('EPSG:4674', '+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs');
  proj4.defs('EPSG:31982', '+proj=utm +zone=22 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
  proj4.defs('WGS84', '+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs');
}

function collectCoordinateStats(geojson) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;

  const visit = (coords) => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const x = coords[0];
      const y = coords[1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      count += 1;
      return;
    }
    coords.forEach(visit);
  };

  (geojson?.features || []).forEach((feature) => visit(feature?.geometry?.coordinates));
  return { minX, minY, maxX, maxY, count };
}

function isLikelyGeographic(stats) {
  if (!stats?.count) return false;
  return stats.minX >= -180 && stats.maxX <= 180 && stats.minY >= -90 && stats.maxY <= 90;
}

function cloneGeoJSON(geojson) {
  return JSON.parse(JSON.stringify(geojson));
}

function resolveProjectionHints(geojson) {
  const hints = [];
  const fileNameHint = geojson?.fileName?.toUpperCase?.() || '';
  if (fileNameHint.includes('4674') || fileNameHint.includes('SIRGAS')) hints.push('EPSG:4674');
  if (fileNameHint.includes('4326') || fileNameHint.includes('WGS84')) hints.push('WGS84');

  // fallbacks mais comuns no projeto
  hints.push('EPSG:31982', 'EPSG:4674', 'WGS84');
  return [...new Set(hints)];
}

function reprojectFrom(sourceProjection, geojson) {
  const destProjection = 'WGS84';
  let reprojected = 0;

  const reprojectPolygon = (rings) => rings.map((ring) => ring.map((coord) => {
    const transformed = proj4(sourceProjection, destProjection, [coord[0], coord[1]]);
    return [transformed[0], transformed[1]];
  }));

  geojson.features.forEach((feature) => {
    if (!feature?.geometry?.coordinates) return;
    if (feature.geometry.type === 'Polygon') {
      feature.geometry.coordinates = reprojectPolygon(feature.geometry.coordinates);
      reprojected += 1;
    } else if (feature.geometry.type === 'MultiPolygon') {
      feature.geometry.coordinates = feature.geometry.coordinates.map((poly) => reprojectPolygon(poly));
      reprojected += 1;
    }
  });

  return { geojson, reprojected };
}

function reprojectGeoJSON(geojson) {
  if (!geojson?.features?.length) {
    return { geojson, reprojected: 0, sourceProjection: null, fallbackReason: 'sem-features', skippedReprojection: true };
  }

  const sourceStats = collectCoordinateStats(geojson);
  if (isLikelyGeographic(sourceStats)) {
    return {
      geojson,
      reprojected: 0,
      sourceProjection: 'WGS84-like',
      fallbackReason: null,
      skippedReprojection: true,
      sourceStats
    };
  }

  if (!hasProj4) {
    return {
      geojson,
      reprojected: 0,
      sourceProjection: null,
      fallbackReason: 'proj4-indisponivel',
      skippedReprojection: true,
      sourceStats
    };
  }

  const candidates = resolveProjectionHints(geojson);
  for (const sourceProjection of candidates) {
    try {
      const cloned = cloneGeoJSON(geojson);
      const result = reprojectFrom(sourceProjection, cloned);
      const transformedStats = collectCoordinateStats(result.geojson);
      const validGeographic = isLikelyGeographic(transformedStats);

      if (validGeographic) {
        return {
          geojson: result.geojson,
          reprojected: result.reprojected,
          sourceProjection,
          fallbackReason: null,
          skippedReprojection: false,
          sourceStats,
          transformedStats
        };
      }
    } catch (error) {
      // tenta o próximo candidate
      console.warn(`[SHP Worker] Falha ao reprojetar usando ${sourceProjection}.`, error?.message || error);
    }
  }

  console.warn('[SHP Worker] Não foi possível validar reprojeção para coordenadas geográficas. Mantendo geometria original.');
  return {
    geojson,
    reprojected: 0,
    sourceProjection: null,
    fallbackReason: 'reprojecao-invalida-mantida-original',
    skippedReprojection: true,
    sourceStats
  };
}

self.onmessage = async (event) => {
  const { type, payload } = event.data || {};
  if (type !== 'PARSE_SHP_BUFFER') return;

  const startedAt = Date.now();
  try {
    const geojson = await shp(payload);
    const featuresCount = geojson?.features?.length || 0;
    const processed = reprojectGeoJSON(geojson);
    const durationMs = Date.now() - startedAt;

    self.postMessage({
      ok: true,
      geojson: processed.geojson,
      debug: {
        proj4Loaded: hasProj4,
        featuresCount,
        reprojectedCount: processed.reprojected,
        sourceProjection: processed.sourceProjection,
        fallbackReason: processed.fallbackReason,
        skippedReprojection: processed.skippedReprojection,
        sourceStats: processed.sourceStats || null,
        transformedStats: processed.transformedStats || null,
        durationMs
      }
    });
  } catch (error) {
    self.postMessage({ ok: false, error: error?.message || 'Erro ao processar shapefile no worker.' });
  }
};

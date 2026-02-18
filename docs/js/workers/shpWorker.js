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

function resolveSourceProjection(geojson) {
  const defaultProjection = 'EPSG:31982';
  const prjName = geojson?.fileName?.toUpperCase?.() || '';

  if (prjName.includes('4674') || prjName.includes('SIRGAS 2000')) return 'EPSG:4674';
  if (prjName.includes('4326') || prjName.includes('WGS84')) return 'WGS84';
  return defaultProjection;
}

function reprojectGeoJSON(geojson) {
  if (!geojson?.features?.length) return { geojson, reprojected: 0, sourceProjection: null, fallbackReason: 'sem-features' };
  if (!hasProj4) return { geojson, reprojected: 0, sourceProjection: null, fallbackReason: 'proj4-indisponivel' };

  const sourceProjection = resolveSourceProjection(geojson);
  const destProjection = 'WGS84';
  let reprojected = 0;

  try {
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

    return { geojson, reprojected, sourceProjection, fallbackReason: null };
  } catch (error) {
    console.warn('[SHP Worker] Falha na reprojeção. Seguindo com geometria original.', error?.message || error);
    return { geojson, reprojected: 0, sourceProjection, fallbackReason: error?.message || 'erro-reprojecao' };
  }
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
        durationMs
      }
    });
  } catch (error) {
    self.postMessage({ ok: false, error: error?.message || 'Erro ao processar shapefile no worker.' });
  }
};

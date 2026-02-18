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
  const prjContent = geojson?.prj?.toUpperCase?.() || '';

  if (prjName.includes('4674') || prjName.includes('SIRGAS 2000') || prjContent.includes('SIRGAS_2000')) return 'EPSG:4674';
  if (prjName.includes('31982') || prjContent.includes('31982') || prjContent.includes('UTM') || prjContent.includes('22S')) return 'EPSG:31982';
  if (prjName.includes('4326') || prjName.includes('WGS84') || prjContent.includes('WGS_1984')) return 'WGS84';
  console.info('[SHP] reprojection fallback sem PRJ detectado: assumindo EPSG:31982');
  return defaultProjection;
}

function getZipComponentSizes(arrayBuffer) {
  try {
    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const sizes = { shp: 0, dbf: 0, prj: 0 };

    let i = 0;
    while (i + 30 <= view.byteLength) {
      if (view.getUint32(i, true) !== 0x04034b50) {
        i += 1;
        continue;
      }

      const compressedSize = view.getUint32(i + 18, true);
      const fileNameLength = view.getUint16(i + 26, true);
      const extraLength = view.getUint16(i + 28, true);
      const fileNameStart = i + 30;
      const fileNameEnd = fileNameStart + fileNameLength;
      if (fileNameEnd > view.byteLength) break;

      const fileName = new TextDecoder().decode(bytes.slice(fileNameStart, fileNameEnd)).toLowerCase();
      const next = fileNameEnd + extraLength + compressedSize;
      if (fileName.endsWith('.shp')) sizes.shp = Math.max(sizes.shp, compressedSize);
      if (fileName.endsWith('.dbf')) sizes.dbf = Math.max(sizes.dbf, compressedSize);
      if (fileName.endsWith('.prj')) sizes.prj = Math.max(sizes.prj, compressedSize);

      i = next;
    }

    return sizes;
  } catch (error) {
    console.warn('[SHP] bytes: falha ao inspecionar ZIP no worker', error?.message || error);
    return { shp: 0, dbf: 0, prj: 0 };
  }
}

function safeReproject(geojson, fromCrs, toCrs) {
  if (!geojson?.features?.length) return { geojson, reprojected: 0, sourceProjection: null, fallbackReason: 'sem-features' };
  if (!hasProj4) return { geojson, reprojected: 0, sourceProjection: null, fallbackReason: 'proj4-indisponivel' };

  const sourceProjection = fromCrs || resolveSourceProjection(geojson);
  const destProjection = toCrs || 'WGS84';
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

    console.info('[SHP] reprojection ok');

    return { geojson, reprojected, sourceProjection, fallbackReason: null };
  } catch (error) {
    console.info('[SHP] reprojection failed');
    console.warn('[SHP Worker] Falha na reprojeção. Seguindo com geometria original.', error?.message || error);
    return { geojson, reprojected: 0, sourceProjection, fallbackReason: error?.message || 'erro-reprojecao' };
  }
}

self.onmessage = async (event) => {
  const { type, payload } = event.data || {};
  if (type !== 'PARSE_SHP_BUFFER') return;

  const startedAt = Date.now();
  try {
    const bytes = getZipComponentSizes(payload);
    console.info(`[SHP] bytes shp=${bytes.shp} dbf=${bytes.dbf} prj=${bytes.prj}`);
    const geojson = await shp(payload);
    const featuresCount = geojson?.features?.length || 0;
    console.info(`[SHP] parsed features=${featuresCount}`);
    const processed = safeReproject(geojson, null, 'WGS84');
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
        durationMs,
        bytes
      }
    });
  } catch (error) {
    self.postMessage({ ok: false, error: error?.message || 'Erro ao processar shapefile no worker.' });
  }
};

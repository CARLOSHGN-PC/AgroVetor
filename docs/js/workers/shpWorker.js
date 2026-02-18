/* eslint-disable no-restricted-globals */
importScripts('../lib/shp.js');
importScripts('https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.11.0/proj4.min.js');

proj4.defs('EPSG:4674', '+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs');
proj4.defs('EPSG:31982', '+proj=utm +zone=22 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
proj4.defs('WGS84', '+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs');

function reprojectGeoJSON(geojson) {
  if (!geojson?.features?.length) return geojson;
  const sourceProjection = 'EPSG:31982';
  const destProjection = 'WGS84';

  const reprojectPolygon = (rings) => rings.map((ring) => ring.map((coord) => proj4(sourceProjection, destProjection, [coord[0], coord[1]])));

  geojson.features.forEach((feature) => {
    if (!feature?.geometry?.coordinates) return;
    if (feature.geometry.type === 'Polygon') {
      feature.geometry.coordinates = reprojectPolygon(feature.geometry.coordinates);
    } else if (feature.geometry.type === 'MultiPolygon') {
      feature.geometry.coordinates = feature.geometry.coordinates.map((poly) => reprojectPolygon(poly));
    }
  });

  return geojson;
}

self.onmessage = async (event) => {
  const { type, payload } = event.data || {};
  if (type !== 'PARSE_SHP_BUFFER') return;

  try {
    const geojson = await shp(payload);
    const processed = reprojectGeoJSON(geojson);
    self.postMessage({ ok: true, geojson: processed });
  } catch (error) {
    self.postMessage({ ok: false, error: error?.message || 'Erro ao processar shapefile no worker.' });
  }
};

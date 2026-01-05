const axios = require('axios');
const shp = require('shpjs');
const pointInPolygon = require('point-in-polygon');
const admin = require('firebase-admin');

// Shared utility to handle shapefile caching and retrieval
let cachedShapefiles = {};
let lastFetchTimes = {};

const getGeojsonFeatures = (geojsonData) => {
    if (!geojsonData) {
        return [];
    }

    if (Array.isArray(geojsonData)) {
        return geojsonData.flatMap(layer => {
            if (!layer) return [];
            if (Array.isArray(layer.features)) return layer.features;
            if (layer.type === 'FeatureCollection' && Array.isArray(layer.features)) return layer.features;
            return [];
        });
    }

    if (geojsonData.type === 'FeatureCollection' && Array.isArray(geojsonData.features)) {
        return geojsonData.features;
    }

    if (Array.isArray(geojsonData.features)) {
        return geojsonData.features;
    }

    return [];
};

const getShapefileData = async (db, companyId) => {
    if (!companyId) {
        throw new Error('O ID da empresa é obrigatório para obter dados do shapefile.');
    }
    const now = new Date();
    // Cache em memória por 5 minutos
    if (cachedShapefiles[companyId] && lastFetchTimes[companyId] && (now - lastFetchTimes[companyId] < 5 * 60 * 1000)) {
        return cachedShapefiles[companyId];
    }

    const shapefileDoc = await db.collection('config').doc(companyId).get();
    if (!shapefileDoc.exists || !shapefileDoc.data().shapefileURL) {
        console.warn(`Shapefile não encontrado para a empresa ${companyId}.`);
        return null;
    }
    const url = shapefileDoc.data().shapefileURL;

    const response = await axios({ url, responseType: 'arraybuffer' });
    const geojson = await shp(response.data);

    cachedShapefiles[companyId] = geojson;
    lastFetchTimes[companyId] = now;
    return geojson;
};

const findTalhaoForTrap = (trap, geojsonData) => {
    if (!trap || trap.longitude === undefined || trap.latitude === undefined) {
        return null;
    }
    const longitude = parseFloat(trap.longitude);
    const latitude = parseFloat(trap.latitude);
    if (Number.isNaN(longitude) || Number.isNaN(latitude)) {
        return null;
    }

    const point = [longitude, latitude];
    const features = getGeojsonFeatures(geojsonData);
    if (features.length === 0) {
        return null;
    }

    for (const feature of features) {
        if (feature.geometry) {
            if (feature.geometry.type === 'Polygon') {
                if (feature.geometry.coordinates?.[0] && pointInPolygon(point, feature.geometry.coordinates[0])) {
                    return feature.properties;
                }
            } else if (feature.geometry.type === 'MultiPolygon') {
                for (const polygon of feature.geometry.coordinates) {
                    if (polygon?.[0] && pointInPolygon(point, polygon[0])) {
                        return feature.properties;
                    }
                }
            }
        }
    }
    return null;
};

const findShapefileProp = (props, keys) => {
    if (!props) return null;
    const propKeys = Object.keys(props);
    for (const key of keys) {
        const matchingPropKey = propKeys.find(pk => pk.toLowerCase() === key.toLowerCase());
        if (matchingPropKey && props[matchingPropKey] !== undefined && props[matchingPropKey] !== null) {
            return props[matchingPropKey];
        }
    }
    return null;
};

const safeToDate = (dateInput) => {
    if (!dateInput) return null;
    if (dateInput && typeof dateInput.toDate === 'function') {
        return dateInput.toDate();
    }
    if (dateInput instanceof Date) {
        return dateInput;
    }
    const date = new Date(dateInput);
    if (!isNaN(date.getTime())) {
        return date;
    }
    return null;
};

module.exports = {
    getShapefileData,
    findTalhaoForTrap,
    findShapefileProp,
    safeToDate
};

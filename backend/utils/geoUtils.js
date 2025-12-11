const axios = require('axios');
const shp = require('shpjs');
const pointInPolygon = require('point-in-polygon');
const admin = require('firebase-admin');

// Shared utility to handle shapefile caching and retrieval
let cachedShapefiles = {};
let lastFetchTimes = {};

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
    const point = [trap.longitude, trap.latitude];
    for (const feature of geojsonData.features) {
        if (feature.geometry) {
            if (feature.geometry.type === 'Polygon') {
                if (pointInPolygon(point, feature.geometry.coordinates[0])) {
                    return feature.properties;
                }
            } else if (feature.geometry.type === 'MultiPolygon') {
                for (const polygon of feature.geometry.coordinates) {
                    if (pointInPolygon(point, polygon[0])) {
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

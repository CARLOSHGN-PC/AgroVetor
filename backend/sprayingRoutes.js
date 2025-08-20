const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const turf = require('@turf/turf');

// As Firebase is initialized in server.js, we can get the instance here
const db = admin.firestore();

// Generic error handler
const handleError = (res, error) => {
    console.error("API Error:", error);
    res.status(500).send({ message: "An internal server error occurred.", error: error.message });
};

// --- Farms CRUD ---
const farmsCollection = db.collection('spraying_farms');

// Create Farm
router.post('/farms', async (req, res) => {
    try {
        const { name, city, state } = req.body;
        if (!name) {
            return res.status(400).send({ message: "Farm name is required." });
        }
        const docRef = await farmsCollection.add({ name, city, state, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        res.status(201).send({ id: docRef.id, name, city, state });
    } catch (error) {
        handleError(res, error);
    }
});

// Read all Farms
router.get('/farms', async (req, res) => {
    try {
        const snapshot = await farmsCollection.orderBy('name').get();
        const farms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).send(farms);
    } catch (error) {
        handleError(res, error);
    }
});

// Read single Farm
router.get('/farms/:id', async (req, res) => {
    try {
        const doc = await farmsCollection.doc(req.params.id).get();
        if (!doc.exists) {
            return res.status(404).send({ message: "Farm not found." });
        }
        res.status(200).send({ id: doc.id, ...doc.data() });
    } catch (error) {
        handleError(res, error);
    }
});

// Update Farm
router.put('/farms/:id', async (req, res) => {
    try {
        const { name, city, state } = req.body;
        await farmsCollection.doc(req.params.id).update({ name, city, state });
        res.status(200).send({ message: "Farm updated successfully." });
    } catch (error) {
        handleError(res, error);
    }
});

// Delete Farm
router.delete('/farms/:id', async (req, res) => {
    try {
        // Note: In a real app, we should check for dependencies (like fields) before deleting.
        await farmsCollection.doc(req.params.id).delete();
        res.status(200).send({ message: "Farm deleted successfully." });
    } catch (error) {
        handleError(res, error);
    }
});


// --- Work Orders (OS) CRUD ---
const workOrdersCollection = db.collection('spraying_work_orders');

// Create Work Order
router.post('/work-orders', async (req, res) => {
    try {
        const { plannedDate, productId, aircraftId, dosage, fieldIds } = req.body;
        if (!plannedDate || !productId || !aircraftId || !dosage || !fieldIds || !Array.isArray(fieldIds) || fieldIds.length === 0) {
            return res.status(400).send({ message: "Missing required fields for Work Order." });
        }

        const newWorkOrder = {
            plannedDate,
            productId,
            aircraftId,
            dosage,
            fieldIds,
            status: 'Planejada', // Planned
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const docRef = await workOrdersCollection.add(newWorkOrder);
        res.status(201).send({ id: docRef.id, ...newWorkOrder });
    } catch (error) {
        handleError(res, error);
    }
});

// Get all Work Orders
router.get('/work-orders', async (req, res) => {
    try {
        const snapshot = await workOrdersCollection.orderBy('plannedDate', 'desc').get();
        const workOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).send(workOrders);
    } catch (error) {
        handleError(res, error);
    }
});

// Get single Work Order
router.get('/work-orders/:id', async (req, res) => {
    try {
        const doc = await workOrdersCollection.doc(req.params.id).get();
        if (!doc.exists) {
            return res.status(404).send({ message: "Work Order not found." });
        }
        res.status(200).send({ id: doc.id, ...doc.data() });
    } catch (error) {
        handleError(res, error);
    }
});

// Upload flight log and process it
router.post('/work-orders/:id/process-log', async (req, res) => {
    const { id } = req.params;
    const { flightPath } = req.body; // Expecting a GeoJSON LineString for the flight path

    if (!flightPath || flightPath.type !== 'LineString') {
        return res.status(400).send({ message: "A valid GeoJSON LineString 'flightPath' is required." });
    }

    try {
        const workOrderRef = workOrdersCollection.doc(id);
        const workOrderDoc = await workOrderRef.get();
        if (!workOrderDoc.exists) {
            return res.status(404).send({ message: "Work Order not found." });
        }
        const workOrder = workOrderDoc.data();

        // 1. Get Aircraft Swath Width
        const aircraftDoc = await aircraftsCollection.doc(workOrder.aircraftId).get();
        if (!aircraftDoc.exists) {
            return res.status(404).send({ message: "Aircraft for this Work Order not found." });
        }
        const swathWidth = aircraftDoc.data().swathWidth; // in meters

        // 2. Get and combine all field geometries for this WO
        const fieldPromises = workOrder.fieldIds.map(fieldId => fieldsCollection.doc(fieldId).get());
        const fieldDocs = await Promise.all(fieldPromises);

        let plannedPolygons = fieldDocs.map(doc => {
            if (!doc.exists) throw new Error(`Field with ID ${doc.id} not found.`);
            // Assuming geometry is stored as a JSON string
            return JSON.parse(doc.data().geometry);
        });

        if (plannedPolygons.length === 0) {
            return res.status(400).send({ message: "No valid fields found for this Work Order." });
        }

        // Combine all field polygons into one for analysis
        let plannedAreaPolygon = plannedPolygons[0];
        if(plannedPolygons.length > 1) {
            for(let i = 1; i < plannedPolygons.length; i++) {
                plannedAreaPolygon = turf.union(plannedAreaPolygon, plannedPolygons[i]);
            }
        }

        // 3. Create the application polygon by buffering the flight path
        const bufferDistance = swathWidth / 2;
        const appliedAreaPolygon = turf.buffer(flightPath, bufferDistance, { units: 'meters' });

        // 4. Perform Geospatial Calculations
        const appliedCorrectlyGeom = turf.intersect(appliedAreaPolygon, plannedAreaPolygon);
        const wasteGeom = turf.difference(appliedAreaPolygon, plannedAreaPolygon);
        const missedGeom = turf.difference(plannedAreaPolygon, appliedAreaPolygon);

        // 5. Calculate Areas (result is in square meters, convert to hectares)
        const toHectares = (sqMeters) => (sqMeters / 10000);
        const appliedCorrectlyArea = appliedCorrectlyGeom ? toHectares(turf.area(appliedCorrectlyGeom)) : 0;
        const wasteArea = wasteGeom ? toHectares(turf.area(wasteGeom)) : 0;
        const missedArea = missedGeom ? toHectares(turf.area(missedGeom)) : 0;
        const totalAppliedArea = toHectares(turf.area(appliedAreaPolygon));
        const totalPlannedArea = toHectares(turf.area(plannedAreaPolygon));

        // 6. Save results to a new 'spraying_applications' document
        const applicationsCollection = db.collection('spraying_applications');
        const applicationData = {
            workOrderId: id,
            flightPath: flightPath, // The original flight path
            appliedAreaPolygon: appliedAreaPolygon, // The buffered swath
            analysis: {
                appliedCorrectlyGeom,
                wasteGeom,
                missedGeom,
                areas: {
                    appliedCorrectlyHa: appliedCorrectlyArea,
                    wasteHa: wasteArea,
                    missedHa: missedArea,
                    totalAppliedHa: totalAppliedArea,
                    totalPlannedHa: totalPlannedArea,
                    efficiency: totalPlannedArea > 0 ? (appliedCorrectlyArea / totalPlannedArea) * 100 : 0
                }
            },
            processedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const appDocRef = await applicationsCollection.add(applicationData);

        // 7. Update Work Order status
        await workOrderRef.update({ status: 'Concluída', applicationId: appDocRef.id });

        res.status(200).send({
            message: "Flight log processed successfully.",
            applicationId: appDocRef.id,
            analysis: applicationData.analysis.areas
        });

    } catch (error) {
        // If something fails, set status back to 'Planejada'
        await workOrdersCollection.doc(id).update({ status: 'Falhou' }).catch(() => {});
        handleError(res, error);
    }
});


// --- Fields CRUD ---
// Geometry is passed as GeoJSON string.
const fieldsCollection = db.collection('spraying_fields');

// Create Field
router.post('/fields', async (req, res) => {
    try {
        const { name, farmId, farmName, geometry, area } = req.body;
        if (!name || !farmId || !geometry || !area) {
            return res.status(400).send({ message: "Name, farmId, geometry, and area are required." });
        }
        const docRef = await fieldsCollection.add({ name, farmId, farmName, geometry, area, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        res.status(201).send({ id: docRef.id, name, farmId });
    } catch (error) {
        handleError(res, error);
    }
});

// Read all Fields for a Farm
router.get('/fields', async (req, res) => {
    try {
        let query = fieldsCollection;
        if (req.query.farmId) {
            query = query.where('farmId', '==', req.query.farmId);
        }
        const snapshot = await query.orderBy('name').get();
        const fields = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).send(fields);
    } catch (error) {
        handleError(res, error);
    }
});

// --- Products CRUD ---
const productsCollection = db.collection('spraying_products');

router.post('/products', async (req, res) => {
    try {
        const { name, activeIngredient, defaultDosage } = req.body;
        if (!name || !defaultDosage) {
            return res.status(400).send({ message: "Product name and default dosage are required." });
        }
        const docRef = await productsCollection.add({ name, activeIngredient, defaultDosage, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        res.status(201).send({ id: docRef.id, name });
    } catch (error) {
        handleError(res, error);
    }
});

router.get('/products', async (req, res) => {
    try {
        const snapshot = await productsCollection.orderBy('name').get();
        const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).send(products);
    } catch (error) {
        handleError(res, error);
    }
});

// --- Aircrafts CRUD ---
const aircraftsCollection = db.collection('spraying_aircrafts');

router.post('/aircrafts', async (req, res) => {
    try {
        const { prefix, model, swathWidth } = req.body;
        if (!prefix || !swathWidth) {
            return res.status(400).send({ message: "Aircraft prefix and swath width are required." });
        }
        const docRef = await aircraftsCollection.add({ prefix, model, swathWidth, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        res.status(201).send({ id: docRef.id, prefix });
    } catch (error) {
        handleError(res, error);
    }
});

router.get('/aircrafts', async (req, res) => {
    try {
        const snapshot = await aircraftsCollection.orderBy('prefix').get();
        const aircrafts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).send(aircrafts);
    } catch (error) {
        handleError(res, error);
    }
});


// --- Applications ---
const applicationsCollection = db.collection('spraying_applications');

// Get all Applications for dashboarding
router.get('/applications', async (req, res) => {
    try {
        const snapshot = await applicationsCollection.orderBy('processedAt', 'desc').get();
        const applications = [];

        // We need to enrich the application data with details from other collections
        for (const doc of snapshot.docs) {
            const appData = doc.data();

            // Get Work Order details
            const woDoc = await workOrdersCollection.doc(appData.workOrderId).get();
            if (!woDoc.exists) continue; // Skip if related work order is deleted
            const woData = woDoc.data();

            // Get Farm, Product, Aircraft details
            const farmId = woData.farmId; // Assuming farmId is on the work order
            const farmDoc = farmId ? await db.collection('spraying_farms').doc(farmId).get() : null;

            const productDoc = await productsCollection.doc(woData.productId).get();
            const aircraftDoc = await aircraftsCollection.doc(woData.aircraftId).get();

            applications.push({
                id: doc.id,
                ...appData,
                workOrder: { ...woData },
                farm: farmDoc && farmDoc.exists ? { id: farmDoc.id, ...farmDoc.data() } : { name: 'N/A' },
                product: productDoc.exists ? { id: productDoc.id, ...productDoc.data() } : { name: 'N/A' },
                aircraft: aircraftDoc.exists ? { id: aircraftDoc.id, ...aircraftDoc.data() } : { prefix: 'N/A' },
            });
        }

        res.status(200).send(applications);
    } catch (error) {
        handleError(res, error);
    }
});


// Test route to ensure the router is working
router.get('/health-check', (req, res) => {
    res.status(200).send({
        status: 'OK',
        message: 'Spraying module routes are working.'
    });
});

module.exports = router;

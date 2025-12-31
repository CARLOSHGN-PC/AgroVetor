
// core/Database.js
import { getFirestore, collection, onSnapshot, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, query, where, getDocs, orderBy, limit, startAfter, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@7.1.1/build/index.js';

// --- Configuration ---
const CACHE_DB_NAME = 'agrovetor-offline-storage';
const CACHE_DB_VERSION = 6;
const PAGE_SIZE = 50;

class DatabaseService {
    constructor(firebaseApp) {
        this.db = getFirestore(firebaseApp);
        this.idbPromise = this._initIndexedDB();
        this.unsubscribeListeners = new Map();
        this.paginationState = {}; // Stores lastDoc for each collection
        this.state = {
            registros: [],
            fazendas: [],
            // ... other collections
        };
        this.initPersistence();
    }

    initPersistence() {
        enableIndexedDbPersistence(this.db)
            .catch((err) => {
                if (err.code == 'failed-precondition') {
                    console.warn("Multiple tabs open, persistence can only be enabled in one tab at a a time.");
                } else if (err.code == 'unimplemented') {
                    console.warn("The current browser does not support all of the features required to enable persistence");
                }
            });
    }

    async _initIndexedDB() {
        return openDB(CACHE_DB_NAME, CACHE_DB_VERSION, {
            upgrade(db, oldVersion) {
                if (oldVersion < 1) db.createObjectStore('shapefile-cache');
                if (oldVersion < 2) db.createObjectStore('offline-writes', { autoIncrement: true });
                if (oldVersion < 3) db.createObjectStore('sync-history', { keyPath: 'timestamp' });
                if (oldVersion < 4) db.createObjectStore('notifications', { autoIncrement: true });
                if (oldVersion < 5) db.createObjectStore('gps-locations', { autoIncrement: true });
                if (oldVersion < 6) db.createObjectStore('offline-credentials', { keyPath: 'email' });
            },
        });
    }

    // --- Core Data Methods ---

    async getDocument(collectionName, docId) {
        const docSnap = await getDoc(doc(this.db, collectionName, docId));
        return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
    }

    // --- Lazy Loading & Pagination Logic ---

    /**
     * Loads the initial page of a collection.
     * Use this for heavy lists (e.g., Registros, Perdas).
     */
    async loadCollectionPage(collectionName, companyId) {
        console.log(`Loading first page for: ${collectionName}`);

        let q = query(
            collection(this.db, collectionName),
            where("companyId", "==", companyId),
            orderBy('createdAt', 'desc'), // Assuming 'createdAt' exists, fallback to other field if needed
            limit(PAGE_SIZE)
        );

        try {
            const querySnapshot = await getDocs(q);
            const data = [];
            querySnapshot.forEach((doc) => data.push({ id: doc.id, ...doc.data() }));

            // Store last doc for next page
            const lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];
            this.paginationState[collectionName] = lastVisible;

            // Update state (append or replace? For initial load, replace)
            this.state[collectionName] = data;

            return data;
        } catch (error) {
            console.error(`Error loading page for ${collectionName}:`, error);
            // Fallback to offline cache if online fails
            return this.getOfflineDataPaginated(collectionName, PAGE_SIZE, 1);
        }
    }

    async loadNextPage(collectionName, companyId) {
        const lastVisible = this.paginationState[collectionName];
        if (!lastVisible) {
            console.log("No more data to load or initial load not done.");
            return [];
        }

        console.log(`Loading next page for: ${collectionName}`);
        let q = query(
            collection(this.db, collectionName),
            where("companyId", "==", companyId),
            orderBy('createdAt', 'desc'),
            startAfter(lastVisible),
            limit(PAGE_SIZE)
        );

        const querySnapshot = await getDocs(q);
        const data = [];
        querySnapshot.forEach((doc) => data.push({ id: doc.id, ...doc.data() }));

        if (querySnapshot.docs.length > 0) {
            this.paginationState[collectionName] = querySnapshot.docs[querySnapshot.docs.length - 1];
            // Append to state
            this.state[collectionName] = [...this.state[collectionName], ...data];
        }

        return data;
    }

    /**
     * Subscribes to a collection for real-time updates.
     * WARN: Use with caution on heavy collections. Prefer loadCollectionPage for lists.
     * This is suitable for 'Config', 'Users', etc.
     */
    subscribeToCollection(collectionName, companyId, callback) {
        if (this.unsubscribeListeners.has(collectionName)) return;

        console.log(`Subscribing to (Realtime): ${collectionName}`);

        let q = query(collection(this.db, collectionName), where("companyId", "==", companyId));

        // Safety limit for realtime listeners to prevent OOM if used accidentally on large collections
        if (['registros', 'perdas'].includes(collectionName)) {
             console.warn(`Realtime subscription on heavy collection ${collectionName} is dangerous. Limiting to 50.`);
             q = query(q, limit(50));
        }

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const data = [];
            querySnapshot.forEach((doc) => data.push({ id: doc.id, ...doc.data() }));
            this.state[collectionName] = data;
            callback(data);
        }, (error) => {
            console.error(`Error subscribing to ${collectionName}:`, error);
        });

        this.unsubscribeListeners.set(collectionName, unsubscribe);
    }

    unsubscribeFrom(collectionName) {
        if (this.unsubscribeListeners.has(collectionName)) {
            this.unsubscribeListeners.get(collectionName)();
            this.unsubscribeListeners.delete(collectionName);
            // Clear RAM state for heavy collections
            if (['registros', 'perdas', 'armadilhas'].includes(collectionName)) {
                this.state[collectionName] = [];
                console.log(`Cleared RAM for: ${collectionName}`);
            }
        }
    }

    // --- Offline Optimized Reading ---

    async getOfflineDataPaginated(storeName, pageSize = 50, page = 1) {
        const db = await this.idbPromise;
        // Check if store exists first
        if (!db.objectStoreNames.contains(storeName)) {
            console.warn(`Store ${storeName} not found in IndexedDB.`);
            return [];
        }

        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);

        let cursor = await store.openCursor();
        const results = [];
        let skipped = 0;
        const offset = (page - 1) * pageSize;

        // Efficient skipping
        if (offset > 0 && cursor) {
            await cursor.advance(offset);
        }

        while (cursor && results.length < pageSize) {
            results.push(cursor.value);
            cursor = await cursor.continue();
        }
        return results;
    }

    // --- Data Mutation ---

    async addDocument(collectionName, data) {
        if (navigator.onLine) {
             return await addDoc(collection(this.db, collectionName), data);
        } else {
             const entryId = `offline_${Date.now()}`;
             const db = await this.idbPromise;
             await db.add('offline-writes', {
                 id: entryId,
                 collection: collectionName,
                 data: data,
                 type: 'CREATE'
             });
             return { id: entryId, ...data };
        }
    }
}

export default DatabaseService;

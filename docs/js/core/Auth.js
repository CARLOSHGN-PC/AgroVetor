
// core/Auth.js
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, browserSessionPersistence, setPersistence } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getDoc, doc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// Crypto for offline auth
import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@7.1.1/build/index.js';
// Assuming CryptoJS is loaded globally via script tag as requested ("Sem frameworks novos" -> use existing global)

class AuthService {
    constructor(firebaseApp, databaseService) {
        this.auth = getAuth(firebaseApp);
        this.dbService = databaseService;
        this.currentUser = null;
    }

    async checkSession(onUserChanged) {
        onAuthStateChanged(this.auth, async (user) => {
            if (user) {
                // Fetch extra user data
                const userDoc = await this.dbService.getDocument('users', user.uid);

                if (userDoc && userDoc.active) {
                    this.currentUser = { ...user, ...userDoc };
                    // Persist profile locally for offline check later
                    this.saveProfileLocally(this.currentUser);
                    onUserChanged(this.currentUser);
                } else {
                    this.logout();
                    onUserChanged(null, "Conta desativada ou não encontrada.");
                }
            } else {
                this.currentUser = null;
                onUserChanged(null);
            }
        });
    }

    async login(email, password) {
        try {
            await setPersistence(this.auth, browserSessionPersistence);
            await signInWithEmailAndPassword(this.auth, email, password);
            return { success: true };
        } catch (error) {
            console.error("Auth Error:", error);
            return { success: false, error: error.code };
        }
    }

    async logout() {
        if (navigator.onLine) {
            await signOut(this.auth);
        }
        this.currentUser = null;
        // Clean up sensitive local data if needed
    }

    // --- Offline Logic ---

    saveProfileLocally(userProfile) {
        const safeProfile = {
            uid: userProfile.uid,
            email: userProfile.email,
            username: userProfile.username,
            role: userProfile.role,
            companyId: userProfile.companyId,
            permissions: userProfile.permissions
        };
        localStorage.setItem('localUserProfiles', JSON.stringify([safeProfile])); // Simplified for single user per device typically
    }

    async loginOffline(email, password) {
       // Logic moved from app.js
       const db = await openDB('agrovetor-offline-storage', 6);
       const credentials = await db.get('offline-credentials', email.toLowerCase());

       if (!credentials) return { success: false, message: 'Credenciais offline não encontradas.' };

       const hashedPassword = CryptoJS.PBKDF2(password, credentials.salt, {
            keySize: 256 / 32,
            iterations: 1000
       }).toString();

       if (hashedPassword === credentials.hashedPassword) {
           this.currentUser = credentials.userProfile;
           return { success: true, user: this.currentUser };
       }
       return { success: false, message: 'Senha incorreta.' };
    }
}

export default AuthService;

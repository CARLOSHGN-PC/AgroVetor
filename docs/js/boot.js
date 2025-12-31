
// boot.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import DatabaseService from './core/Database.js';
import AuthService from './core/Auth.js';
import Router from './core/Router.js';

const firebaseConfig = {
    apiKey: "AIzaSyBFXgXKDIBo9JD9vuGik5VDYZFDb_tbCrY",
    authDomain: "agrovetor-v2.firebaseapp.com",
    projectId: "agrovetor-v2",
    storageBucket: "agrovetor-v2.firebasestorage.app",
    messagingSenderId: "782518751171",
    appId: "1:782518751171:web:d501ee31c1db33da4eb776",
    measurementId: "G-JN4MSW63JR"
};

class Application {
    constructor() {
        this.firebaseApp = initializeApp(firebaseConfig);
        this.db = new DatabaseService(this.firebaseApp);
        this.auth = new AuthService(this.firebaseApp, this.db);
        this.router = new Router(this);
        this.ui = {}; // Placeholder for UI modules
    }

    start() {
        console.log("App Booting...");
        this.auth.checkSession((user, error) => {
            if (user) {
                console.log("User logged in:", user.email);
                document.getElementById('loginScreen').style.display = 'none';
                document.getElementById('appScreen').style.display = 'flex';
                this.router.init();
            } else {
                console.log("No session, showing login.");
                document.getElementById('loginScreen').style.display = 'flex';
                document.getElementById('appScreen').style.display = 'none';
                if (error) alert(error);
            }
        });
    }
}

// Initialize and Expose
window.App = new Application(); // Keep 'App' global for compatibility
document.addEventListener('DOMContentLoaded', () => {
    window.App.start();
});

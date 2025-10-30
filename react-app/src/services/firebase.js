import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyBFXgXKDIBo9JD9vuGik5VDYZFDb_tbCrY",
    authDomain: "agrovetor-v2.firebaseapp.com",
    projectId: "agrovetor-v2",
    storageBucket: "agrovetor-v2.firebasestorage.app",
    messagingSenderId: "782518751171",
    appId: "1:782518751171:web:d501ee31c1db33da4eb776",
    measurementId: "G-JN4MSW63JR"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

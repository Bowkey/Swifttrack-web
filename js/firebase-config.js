// Firebase configuration and service initialization.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCZhKbOvy_Vi_qsFL41ju3Kzs165rZjrVA",
    authDomain: "projects-88c6f.firebaseapp.com",
    projectId: "projects-88c6f",
    storageBucket: "projects-88c6f.firebasestorage.app",
    messagingSenderId: "962265126859",
    appId: "1:962265126859:web:ce46f52df563177d54c84e",
    measurementId: "G-2J5JQF55LF"
};

export const ADMIN_EMAIL = "admin@admin.com";

const app = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
export const db = getFirestore(app);

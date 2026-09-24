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

// Accounts allowed into the admin panel. This is the single source of truth
// for "is this user an admin?". app.js used to hard-code a different address
// in its own admin checks, which let the admin panel open without its data
// ever being loaded.
export const ADMIN_EMAILS = [
  ADMIN_EMAIL,
  "nimissolomon@gmail.com"
].map(email => email.toLowerCase());

export function isAdminEmail(email) {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}

const app = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
export const db = getFirestore(app);


const year = document.getElementById("copy-right-year");

// The footer year is cosmetic - never let a missing element throw here.
// app.js imports this module, so a throw would stop the whole site dead.
if (year) year.textContent = new Date().getFullYear();
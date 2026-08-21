/**
 * XJ Games — Firebase client configuration
 *
 * A Google account is required to create this project. I cannot finish
 * that step from this computer (no Firebase/Google login here).
 *
 * 1. Open https://console.firebase.google.com
 * 2. Add project (example name: xj-games-website)
 * 3. Authentication → Sign-in method → enable Email/Password and Google
 * 4. Authentication → Settings → Authorized domains
 *    Add localhost and your GitHub Pages domain (example: yourname.github.io)
 * 5. Firestore Database → Create database (start in production mode)
 *    Then use the rules from firestore.rules in this folder
 * 6. Project settings → Your apps → Web app (</>) → copy the config below
 *
 * Do NOT put Admin SDK or service-account keys here — client config only.
 */
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDzRWlT_CjinX4N3GZPpNcajPModyGjyqY",
  authDomain: "xj-games.firebaseapp.com",
  projectId: "xj-games",
  storageBucket: "xj-games.firebasestorage.app",
  messagingSenderId: "986208671056",
  appId: "1:986208671056:web:196f2b5823c93c8176c855",
  measurementId: "G-Q4JNDR8H0P"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
};

/** Emails allowed to manage product inventory (also set in Firestore config/admins) */
const XJ_ADMIN_EMAILS = [ifeadia21@gmail.com];

/** Returns true when Firebase config has been filled in */
function xjIsFirebaseConfigured() {
  return XJ_FIREBASE_CONFIG.apiKey &&
    XJ_FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY" &&
    XJ_FIREBASE_CONFIG.projectId &&
    XJ_FIREBASE_CONFIG.projectId !== "YOUR_PROJECT_ID";
}

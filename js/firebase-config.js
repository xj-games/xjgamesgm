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
const XJ_FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

/** Emails allowed to manage product inventory (also set in Firestore config/admins) */
const XJ_ADMIN_EMAILS = [];

/** Returns true when Firebase config has been filled in */
function xjIsFirebaseConfigured() {
  return XJ_FIREBASE_CONFIG.apiKey &&
    XJ_FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY" &&
    XJ_FIREBASE_CONFIG.projectId &&
    XJ_FIREBASE_CONFIG.projectId !== "YOUR_PROJECT_ID";
}

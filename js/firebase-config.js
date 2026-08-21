/**
 * XJ Games — Firebase client configuration
 *
 * Replace the placeholder values below with your Firebase project settings
 * (Firebase Console → Project settings → Your apps → Web app).
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

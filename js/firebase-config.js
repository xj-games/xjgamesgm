/**
 * XJ Games — Firebase client configuration
 */

const XJ_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDzRWlT_CjinX4N3GZPpNcajPModyGjyqY",
  authDomain: "xj-games.firebaseapp.com",
  projectId: "xj-games",
  storageBucket: "xj-games.firebasestorage.app",
  messagingSenderId: "986208671056",
  appId: "1:986208671056:web:196f2b5823c93c8176c855",
  measurementId: "G-Q4JNDR8H0P"
};

/** Emails allowed to manage product inventory */
const XJ_ADMIN_EMAILS = ["ifeadia21@gmail.com"];

function xjIsFirebaseConfigured() {
  return !!(
    XJ_FIREBASE_CONFIG.apiKey &&
    XJ_FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY" &&
    XJ_FIREBASE_CONFIG.projectId &&
    XJ_FIREBASE_CONFIG.projectId !== "YOUR_PROJECT_ID"
  );
}
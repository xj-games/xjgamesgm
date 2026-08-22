/**
 * XJ Games — Firebase client configuration (project: xj-games)
 */
const XJ_FIREBASE_CONFIG = {
  apiKey: "AIzaSyD5Bo-lxWxmNomkneOw-08Ba3ASf_Om-NE",
  authDomain: "xj-games.firebaseapp.com",
  projectId: "xj-games",
  storageBucket: "xj-games.firebasestorage.app",
  messagingSenderId: "986208671056",
  appId: "1:986208671056:web:adac016adedf8c5976c855",
  measurementId: "G-PCTDDKFCTJ"
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

/**
 * XJ Games — Firebase client configuration (project: xj-games-7b410)
 */
const XJ_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBJ9cjQvVemEOU-P152b2d7khhpMWyg5JM",
  authDomain: "xj-games-7b410.firebaseapp.com",
  projectId: "xj-games-7b410",
  storageBucket: "xj-games-7b410.firebasestorage.app",
  messagingSenderId: "985093533994",
  appId: "1:985093533994:web:8011d27e30cca3979bae53",
  measurementId: "G-8LXV1V3EPY"
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

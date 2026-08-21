/**
 * XJ Games — Firebase Authentication (real auth state only; no fake localStorage login)
 */
var xjAuth = null;
var xjDb = null;
var xjFirebaseUser = null;
var xjAuthReady = false;
var xjAuthReadyCallbacks = [];

function xjOnAuthReady(callback) {
  if (xjAuthReady) {
    callback(xjFirebaseUser);
  } else {
    xjAuthReadyCallbacks.push(callback);
  }
}

function xjNotifyAuthReady(user) {
  xjAuthReady = true;
  xjAuthReadyCallbacks.forEach(function(cb) {
    cb(user);
  });
  xjAuthReadyCallbacks = [];
}

async function xjInitFirebase() {
  try {
    localStorage.removeItem("xj_user");
  } catch (e) {}

  if (!xjIsFirebaseConfigured()) {
    await xjTryLoadHostedFirebaseConfig();
  }

  if (!xjIsFirebaseConfigured()) {
    console.warn("XJ Games: Firebase is not configured. Add your credentials in js/firebase-config.js");
    xjUpdateAuthUI();
    xjNotifyAuthReady(null);
    return false;
  }

  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(XJ_FIREBASE_CONFIG);
    }
    xjAuth = firebase.auth();
    xjDb = firebase.firestore();

    xjAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function(error) {
      console.error("Firebase persistence error:", error);
    });

    xjAuth.getRedirectResult().then(function(result) {
      if (result && result.user) {
        return xjSaveUserProfile(result.user, {
          firstName: result.user.displayName ? result.user.displayName.split(" ")[0] : "",
          lastName: result.user.displayName ? result.user.displayName.split(" ").slice(1).join(" ") : ""
        }).catch(function(profileError) {
          console.error("Signed in, but profile save failed:", profileError);
        });
      }
    }).catch(function(error) {
      console.error("Google redirect result error:", error);
      showToast("Sign In Failed", xjAuthErrorMessage(error), "error");
    });

    xjAuth.onAuthStateChanged(function(user) {
      xjFirebaseUser = user || null;
      xjUpdateAuthUI();
      if (user) {
        xjLoadAdminEmailsFromFirestore().then(function() {
          xjUpdateAdminVisibility();
        });
      } else {
        xjUpdateAdminVisibility();
      }
      xjNotifyAuthReady(user);
    }, function(error) {
      console.error("Auth state error:", error);
      showToast("Authentication Error", xjAuthErrorMessage(error), "error");
    });

    return true;
  } catch (error) {
    console.error("Firebase init error:", error);
    xjFirebaseUser = null;
    xjUpdateAuthUI();
    xjNotifyAuthReady(null);
    return false;
  }
}

async function xjTryLoadHostedFirebaseConfig() {
  try {
    const response = await fetch("/__/firebase/init.json");
    if (!response.ok) return;
    const hosted = await response.json();
    if (hosted && hosted.apiKey && hosted.projectId) {
      Object.keys(hosted).forEach(function(key) {
        XJ_FIREBASE_CONFIG[key] = hosted[key];
      });
    }
  } catch (error) {
    /* Not hosted on Firebase Hosting — keep existing config. */
  }
}

function xjIsAuthenticated() {
  const liveUser = xjAuth && xjAuth.currentUser ? xjAuth.currentUser : null;
  xjFirebaseUser = liveUser;
  return !!liveUser;
}

function xjShowAuthFormError(message) {
  const el = document.getElementById("authFormError");
  if (!el) {
    showToast("Authentication Failed", message, "error");
    return;
  }
  el.style.display = "block";
  el.textContent = message;
}

function xjClearAuthFormError() {
  const el = document.getElementById("authFormError");
  if (el) {
    el.style.display = "none";
    el.textContent = "";
  }
}

function xjRequireAuth(message) {
  if (xjIsAuthenticated()) {
    return true;
  }
  xjShowAuthRequiredModal(message || "Please sign in to continue.");
  return false;
}

function xjShowAuthRequiredModal(message) {
  const modal = document.getElementById("authRequiredModal");
  const body = document.getElementById("authRequiredMessage");
  if (body) {
    body.textContent = message;
  }
  if (modal) {
    modal.classList.add("active");
  } else {
    showToast("Authentication Required", message, "error");
  }
}

function closeAuthRequiredModal() {
  const modal = document.getElementById("authRequiredModal");
  if (modal) {
    modal.classList.remove("active");
  }
}

function xjIsAdmin() {
  if (!xjFirebaseUser || !xjFirebaseUser.email) return false;
  if (XJ_ADMIN_EMAILS.length > 0) {
    return XJ_ADMIN_EMAILS.some(function(email) {
      return email.toLowerCase() === xjFirebaseUser.email.toLowerCase();
    });
  }
  return false;
}

async function xjLoadAdminEmailsFromFirestore() {
  if (!xjDb) return;
  try {
    const snap = await xjDb.collection("config").doc("admins").get();
    if (snap.exists && Array.isArray(snap.data().emails)) {
      XJ_ADMIN_EMAILS.length = 0;
      snap.data().emails.forEach(function(email) {
        XJ_ADMIN_EMAILS.push(email);
      });
      xjUpdateAdminVisibility();
    }
  } catch (error) {
    console.warn("Could not load admin config:", error);
  }
}

function xjAuthErrorMessage(error) {
  const code = error && error.code ? error.code : "";
  const loginRetry = "Please check your login details and try again.";
  const messages = {
    "auth/invalid-email": loginRetry,
    "auth/user-disabled": "This account has been disabled. Please contact support.",
    "auth/user-not-found": loginRetry,
    "auth/wrong-password": loginRetry,
    "auth/email-already-in-use": "An account with this email already exists. Try signing in.",
    "auth/weak-password": "Please choose a password with at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
    "auth/popup-closed-by-user": "Google sign-in was cancelled.",
    "auth/popup-blocked": "Your browser blocked the sign-in window. Please allow pop-ups and try again.",
    "auth/network-request-failed": "We could not connect right now. Please check your internet and try again.",
    "auth/invalid-credential": loginRetry,
    "auth/invalid-login-credentials": loginRetry,
    "auth/operation-not-allowed": loginRetry,
    "auth/unauthorized-domain": loginRetry,
    "auth/account-exists-with-different-credential": "An account already exists with this email using a different sign-in method."
  };
  return messages[code] || loginRetry;
}

async function handleGoogleLogin() {
  xjClearAuthFormError();
  if (!xjAuth) {
    console.error("Google sign-in blocked: Firebase Auth is not initialized.");
    xjShowAuthFormError("Please check your login details and try again.");
    return;
  }

  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope("email");
    provider.addScope("profile");
    provider.setCustomParameters({ prompt: "select_account" });

    const result = await xjAuth.signInWithPopup(provider);
    if (!result || !result.user) {
      console.error("Google sign-in returned no Firebase user.");
      xjShowAuthFormError("Google authentication did not complete. You are not signed in.");
      return;
    }

    try {
      await xjSaveUserProfile(result.user, {
        firstName: result.user.displayName ? result.user.displayName.split(" ")[0] : "",
        lastName: result.user.displayName ? result.user.displayName.split(" ").slice(1).join(" ") : ""
      });
    } catch (profileError) {
      console.error("Signed in, but profile save failed:", profileError);
    }

    closeAuthModal();
    showToast("Success", "Signed in with Google successfully!");
  } catch (error) {
    console.error("Google sign-in error:", error);
    if (error.code === "auth/popup-blocked") {
      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        await xjAuth.signInWithRedirect(provider);
        return;
      } catch (redirectError) {
        console.error("Google redirect sign-in error:", redirectError);
        showToast("Sign In Failed", xjAuthErrorMessage(redirectError), "error");
        return;
      }
    }
    if (error.code !== "auth/popup-closed-by-user") {
      xjShowAuthFormError(xjAuthErrorMessage(error));
      showToast("Sign In Failed", xjAuthErrorMessage(error), "error");
    }
  }
}

async function handleEmailSubmit() {
  xjClearAuthFormError();
  if (!xjAuth) {
    console.error("Email sign-in blocked: Firebase Auth is not initialized.");
    xjShowAuthFormError("Please check your login details and try again.");
    return;
  }

  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;

  if (!email || !password) {
    showToast("Error", "Please fill in all required fields.", "error");
    return;
  }

  try {
    if (isRegisterMode) {
      const firstName = document.getElementById("regFirstName").value.trim();
      const lastName = document.getElementById("regLastName").value.trim();
      const age = document.getElementById("regAge").value.trim();
      const gender = document.getElementById("regGender").value;
      const phone = document.getElementById("regPhone").value.trim();

      if (!firstName || !lastName || !age || !gender) {
        showToast("Error", "Please fill in all personal registration fields.", "error");
        return;
      }

      const credential = await xjAuth.createUserWithEmailAndPassword(email, password);
      await credential.user.updateProfile({
        displayName: firstName + " " + lastName
      });
      try {
        await xjSaveUserProfile(credential.user, {
          firstName: firstName,
          lastName: lastName,
          age: parseInt(age, 10),
          gender: gender,
          phone: phone
        });
      } catch (profileError) {
        console.error("Account created, but profile save failed:", profileError);
      }
      closeAuthModal();
      showToast("Success", "Account created successfully!");
    } else {
      const credential = await xjAuth.signInWithEmailAndPassword(email, password);
      if (!credential || !credential.user) {
        console.error("Email sign-in returned no Firebase user.");
        xjShowAuthFormError("Sign-in did not complete. You are not signed in.");
        return;
      }
      closeAuthModal();
      showToast("Success", "Signed in successfully!");
    }
  } catch (error) {
    console.error("Email authentication error:", error);
    xjShowAuthFormError(xjAuthErrorMessage(error));
    showToast("Authentication Failed", xjAuthErrorMessage(error), "error");
  }
}

async function xjSaveUserProfile(user, extra) {
  if (!xjDb || !user) return;
  const profile = {
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || ((extra.firstName || "") + " " + (extra.lastName || "")).trim(),
    photoURL: user.photoURL || "",
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  if (extra.firstName) profile.firstName = extra.firstName;
  if (extra.lastName) profile.lastName = extra.lastName;
  if (extra.age) profile.age = extra.age;
  if (extra.gender) profile.gender = extra.gender;
  if (extra.phone) profile.phone = extra.phone;

  await xjDb.collection("users").doc(user.uid).set(profile, { merge: true });
}

async function logoutUser() {
  if (!xjAuth) return;
  try {
    await xjAuth.signOut();
    xjFirebaseUser = null;
    xjUpdateAuthUI();
    showToast("Logged Out", "You have been signed out.");
  } catch (error) {
    console.error("Sign-out error:", error);
    showToast("Error", xjAuthErrorMessage(error), "error");
  }
}

async function handleForgotPassword(e) {
  e.preventDefault();
  if (!xjAuth) {
    showToast("Unable to reset password", "Please check the email address and try again.", "error");
    return;
  }

  const email = document.getElementById("authEmail").value.trim();
  if (!email) {
    showToast("Error", "Please enter your email address first.", "error");
    return;
  }

  try {
    await xjAuth.sendPasswordResetEmail(email);
    showToast("Password Reset", "Reset instructions sent to " + email);
  } catch (error) {
    showToast("Error", xjAuthErrorMessage(error), "error");
  }
}

function xjGetCurrentUserDisplay() {
  const user = (xjAuth && xjAuth.currentUser) || null;
  xjFirebaseUser = user;
  if (!user) return null;
  return {
    uid: user.uid,
    name: user.displayName || (user.email ? user.email.split("@")[0] : "User"),
    email: user.email || "",
    avatar: user.photoURL || "https://www.svgrepo.com/show/498369/profile-circle.svg"
  };
}

function xjUpdateAuthUI() {
  const container = document.getElementById("authContainer");
  const user = xjGetCurrentUserDisplay();

  if (user) {
    container.innerHTML =
      '<div class="user-profile">' +
        '<img src="' + user.avatar + '" alt="User">' +
        '<span>' + user.name.split(" ")[0] + '</span>' +
        '<button class="logout-btn" onclick="logoutUser()" title="Sign Out">✕</button>' +
      '</div>';
  } else {
    container.innerHTML =
      '<button class="auth-btn" onclick="openAuthModal()">' +
        '<span>👤</span> Sign In' +
      '</button>';
  }
}

function openAuthModal() {
  xjClearAuthFormError();
  isRegisterMode = false;
  if (typeof setupEmailModeView === "function") {
    setupEmailModeView();
  }
  document.getElementById("authModal").classList.add("active");
}

function closeAuthModal() {
  document.getElementById("authModal").classList.remove("active");
}

function showEmailForm() {
  isRegisterMode = false;
  setupEmailModeView();
}

function backToSelection() {
  closeAuthModal();
}

function toggleEmailMode(e) {
  e.preventDefault();
  isRegisterMode = !isRegisterMode;
  setupEmailModeView();
}

function setupEmailModeView() {
  const title = document.getElementById("emailFormTitle");
  const btn = document.getElementById("emailSubmitBtn");
  const toggleText = document.getElementById("emailToggleText");
  const extraFields = document.getElementById("registerExtraFields");

  if (isRegisterMode) {
    title.innerText = "Create Account";
    btn.innerText = "Register";
    extraFields.style.display = "block";
    toggleText.innerHTML = 'Already have an account? <a href="#" onclick="toggleEmailMode(event)" style="color:#00bfff; text-decoration:none; font-weight:600;">Sign In</a>';
  } else {
    title.innerText = "Sign In with Email";
    btn.innerText = "Sign In";
    extraFields.style.display = "none";
    toggleText.innerHTML = 'Don\'t have an account? <a href="#" onclick="toggleEmailMode(event)" style="color:#00bfff; text-decoration:none; font-weight:600;">Create Account</a>';
  }
}

function xjUpdateAdminVisibility() {
  const adminBtn = document.getElementById("adminToggleBtn");
  if (adminBtn) {
    adminBtn.style.display = xjIsAdmin() ? "inline-flex" : "none";
  }
}

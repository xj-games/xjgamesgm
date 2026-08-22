/**
 * XJ Games — Account profile, settings, and letter avatars
 */
var xjProfileCache = null;
var xjAccountMenuOpen = false;
var XJ_AVATAR_COLORS = ["#1a73e8", "#d93025", "#188038", "#e37400", "#9334e6", "#007b83", "#c5221f", "#1967d2"];

function xjAvatarLetter(name) {
  var source = String(name || "").trim();
  if (!source) return "U";
  return source.charAt(0).toUpperCase();
}

function xjAvatarColor(name) {
  var str = String(name || "U");
  var hash = 0;
  for (var i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return XJ_AVATAR_COLORS[Math.abs(hash) % XJ_AVATAR_COLORS.length];
}

function xjLetterAvatarDataUrl(name) {
  var letter = xjAvatarLetter(name);
  var color = xjAvatarColor(name);
  var svg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 128 128'>" +
      "<rect width='128' height='128' rx='64' fill='" + color + "'/>" +
      "<text x='50%' y='54%' dominant-baseline='middle' text-anchor='middle' fill='#ffffff' font-family='Segoe UI, Arial, sans-serif' font-size='64' font-weight='700'>" + letter + "</text>" +
    "</svg>";
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

function xjProfileFullName(profile, user) {
  if (profile && (profile.firstName || profile.lastName)) {
    return ((profile.firstName || "") + " " + (profile.lastName || "")).trim();
  }
  if (user && user.displayName) return user.displayName;
  if (user && user.email) return user.email.split("@")[0];
  return "Account";
}

function xjProfileAvatar(profile, user) {
  if (profile && profile.photoDataUrl) return profile.photoDataUrl;
  return xjLetterAvatarDataUrl(xjProfileFullName(profile, user));
}

async function xjLoadUserProfile(user) {
  if (!user) {
    xjProfileCache = null;
    return null;
  }
  if (!xjDb) {
    xjProfileCache = { uid: user.uid, email: user.email || "" };
    return xjProfileCache;
  }
  try {
    var snap = await xjDb.collection("users").doc(user.uid).get();
    xjProfileCache = snap.exists ? snap.data() : { uid: user.uid, email: user.email || "" };
    if (!xjProfileCache.nameLocked && xjProfileCache.firstName) {
      xjProfileCache.nameLocked = true;
      await xjDb.collection("users").doc(user.uid).set({ nameLocked: true }, { merge: true });
    }
    if (!xjProfileCache.ageLocked && xjProfileCache.age) {
      xjProfileCache.ageLocked = true;
      await xjDb.collection("users").doc(user.uid).set({ ageLocked: true }, { merge: true });
    }
    return xjProfileCache;
  } catch (error) {
    console.warn("Could not load profile:", error);
    xjProfileCache = { uid: user.uid, email: user.email || "" };
    return xjProfileCache;
  }
}

function xjValidateAge(value) {
  var age = parseInt(value, 10);
  if (!Number.isFinite(age) || String(value).trim() === "") {
    return { ok: false, message: "Please enter a valid age." };
  }
  if (age < 13 || age > 90) {
    return { ok: false, message: "Age must be between 13 and 90." };
  }
  return { ok: true, age: age };
}

function xjValidateName(value) {
  var name = String(value || "").trim().replace(/\s+/g, " ");
  if (name.length < 2) {
    return { ok: false, message: "Please enter your name." };
  }
  if (name.length > 60) {
    return { ok: false, message: "That name is too long." };
  }
  if (!/^[A-Za-z][A-Za-z\s.'-]*$/.test(name)) {
    return { ok: false, message: "Please use a real name with letters only." };
  }
  return { ok: true, name: name };
}

function xjSplitFullName(fullName) {
  var parts = fullName.trim().split(" ");
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" ")
  };
}

function xjValidatePhone(value) {
  var phone = String(value || "").trim();
  if (!phone) {
    return { ok: true, phone: "" };
  }
  var compact = phone.replace(/[\s()-]/g, "");
  if (!/^\+?\d{7,15}$/.test(compact)) {
    return { ok: false, message: "Enter a valid phone number, including country code if needed." };
  }
  return { ok: true, phone: phone };
}

function xjToggleAccountMenu(event) {
  if (event) event.stopPropagation();
  var menu = document.getElementById("xjAccountDropdown");
  if (!menu) return;
  if (xjAccountMenuOpen) {
    xjCloseAccountMenu();
    return;
  }
  if (menu.parentElement !== document.body) {
    document.body.appendChild(menu);
  }
  xjAccountMenuOpen = true;
  menu.classList.add("open");
  xjPositionAccountDropdown();
}

function xjPositionAccountDropdown() {
  var menu = document.getElementById("xjAccountDropdown");
  var btn = document.querySelector("#xjAccountMenuWrap .user-profile");
  if (!menu || !btn || !menu.classList.contains("open")) return;

  var rect = btn.getBoundingClientRect();
  var width = Math.min(280, window.innerWidth - 24);
  var left = rect.right - width;
  if (left < 12) left = 12;
  if (left + width > window.innerWidth - 12) {
    left = Math.max(12, window.innerWidth - width - 12);
  }

  menu.style.top = (rect.bottom + 8) + "px";
  menu.style.left = left + "px";
  menu.style.width = width + "px";
  menu.style.right = "auto";
}

function xjCloseAccountMenu() {
  xjAccountMenuOpen = false;
  var menu = document.getElementById("xjAccountDropdown");
  var wrap = document.getElementById("xjAccountMenuWrap");
  if (!menu) return;
  menu.classList.remove("open");
  if (wrap && menu.parentElement === document.body) {
    wrap.appendChild(menu);
  }
}

function openAccountSettings() {
  xjCloseAccountMenu();
  if (!xjRequireAuth("Please sign in to manage your account.")) return;
  xjRenderAccountSettings();
  document.getElementById("accountSettingsModal").classList.add("active");
}

function closeAccountSettings() {
  document.getElementById("accountSettingsModal").classList.remove("active");
}

function xjRenderAccountSettings() {
  var user = xjAuth && xjAuth.currentUser;
  var profile = xjProfileCache || {};
  var fullName = xjProfileFullName(profile, user);
  var avatar = xjProfileAvatar(profile, user);
  var nameLocked = !!profile.nameLocked;
  var ageLocked = !!profile.ageLocked;

  document.getElementById("accountSettingsNamePreview").textContent = fullName;
  document.getElementById("accountSettingsEmailPreview").textContent = (user && user.email) || profile.email || "";
  document.getElementById("accountSettingsAvatarPreview").src = avatar;

  var nameInput = document.getElementById("settingsFullName");
  var ageInput = document.getElementById("settingsAge");
  var phoneInput = document.getElementById("settingsPhone");
  nameInput.value = fullName === "Account" ? "" : fullName;
  ageInput.value = profile.age || "";
  phoneInput.value = profile.phone || "";

  nameInput.disabled = nameLocked;
  ageInput.disabled = ageLocked;
  document.getElementById("settingsNameHint").textContent = nameLocked
    ? "Your name can only be set once and cannot be changed."
    : "You can set your name once. After saving, it cannot be changed.";
  document.getElementById("settingsAgeHint").textContent = ageLocked
    ? "Your age can only be set once and cannot be changed."
    : "You can set your age once. After saving, it cannot be changed.";

  document.getElementById("settingsSaveNameBtn").style.display = nameLocked ? "none" : "inline-flex";
  document.getElementById("settingsSaveAgeBtn").style.display = ageLocked ? "none" : "inline-flex";
  document.getElementById("settingsRemovePhotoBtn").style.display = profile.photoDataUrl ? "inline-flex" : "none";
}

async function xjSaveSettingsName() {
  var checked = xjValidateName(document.getElementById("settingsFullName").value);
  if (!checked.ok) {
    showToast("Name", checked.message, "error");
    return;
  }
  if (xjProfileCache && xjProfileCache.nameLocked) {
    showToast("Name locked", "Your name can only be set once.", "error");
    return;
  }
  var parts = xjSplitFullName(checked.name);
  try {
    await xjSaveUserProfile(xjAuth.currentUser, {
      firstName: parts.firstName,
      lastName: parts.lastName,
      lockName: true
    });
    if (xjAuth.currentUser) {
      await xjAuth.currentUser.updateProfile({ displayName: checked.name });
    }
    await xjLoadUserProfile(xjAuth.currentUser);
    xjUpdateAuthUI();
    xjRenderAccountSettings();
    showToast("Name saved", "Your name has been set and cannot be changed.");
  } catch (error) {
    console.error(error);
    showToast("Error", "Could not save your name. Please try again.", "error");
  }
}

async function xjSaveSettingsAge() {
  var checked = xjValidateAge(document.getElementById("settingsAge").value);
  if (!checked.ok) {
    showToast("Age", checked.message, "error");
    return;
  }
  if (xjProfileCache && xjProfileCache.ageLocked) {
    showToast("Age locked", "Your age can only be set once.", "error");
    return;
  }
  try {
    await xjSaveUserProfile(xjAuth.currentUser, { age: checked.age, lockAge: true });
    await xjLoadUserProfile(xjAuth.currentUser);
    xjRenderAccountSettings();
    showToast("Age saved", "Your age has been set and cannot be changed.");
  } catch (error) {
    console.error(error);
    showToast("Error", "Could not save your age. Please try again.", "error");
  }
}

async function xjSaveSettingsPhone() {
  var checked = xjValidatePhone(document.getElementById("settingsPhone").value);
  if (!checked.ok) {
    showToast("Phone", checked.message, "error");
    return;
  }
  try {
    await xjSaveUserProfile(xjAuth.currentUser, { phone: checked.phone });
    await xjLoadUserProfile(xjAuth.currentUser);
    xjRenderAccountSettings();
    showToast("Phone saved", checked.phone ? "Your phone number has been updated." : "Your phone number was removed.");
  } catch (error) {
    console.error(error);
    showToast("Error", "Could not save your phone number. Please try again.", "error");
  }
}

function xjOnProfilePhotoSelected(event) {
  var file = event.target.files && event.target.files[0];
  event.target.value = "";
  if (!file) return;
  if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) {
    showToast("Photo", "Please choose a JPG, PNG, WEBP, or GIF image.", "error");
    return;
  }
  if (file.size > 4 * 1024 * 1024) {
    showToast("Photo", "Please choose an image smaller than 4 MB.", "error");
    return;
  }
  var reader = new FileReader();
  reader.onload = function() {
    xjCompressProfilePhoto(reader.result, function(dataUrl) {
      xjSaveProfilePhoto(dataUrl);
    });
  };
  reader.readAsDataURL(file);
}

function xjCompressProfilePhoto(dataUrl, callback) {
  var img = new Image();
  img.onload = function() {
    var canvas = document.createElement("canvas");
    var size = 256;
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext("2d");
    var min = Math.min(img.width, img.height);
    var sx = (img.width - min) / 2;
    var sy = (img.height - min) / 2;
    ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
    callback(canvas.toDataURL("image/jpeg", 0.72));
  };
  img.onerror = function() {
    showToast("Photo", "That image could not be read. Please try another file.", "error");
  };
  img.src = dataUrl;
}

async function xjSaveProfilePhoto(dataUrl) {
  try {
    await xjSaveUserProfile(xjAuth.currentUser, { photoDataUrl: dataUrl, photoRemoved: false });
    await xjLoadUserProfile(xjAuth.currentUser);
    xjUpdateAuthUI();
    xjRenderAccountSettings();
    showToast("Photo updated", "Your profile picture has been saved.");
  } catch (error) {
    console.error(error);
    showToast("Error", "Could not save your profile picture. Please try a smaller image.", "error");
  }
}

async function xjRemoveProfilePhoto() {
  if (!window.confirm("Remove your profile picture? Your account will use a letter avatar instead.")) {
    return;
  }
  try {
    await xjSaveUserProfile(xjAuth.currentUser, { photoDataUrl: "", photoRemoved: true });
    await xjLoadUserProfile(xjAuth.currentUser);
    xjUpdateAuthUI();
    xjRenderAccountSettings();
    showToast("Photo removed", "Your letter avatar is now in use.");
  } catch (error) {
    console.error(error);
    showToast("Error", "Could not remove your profile picture.", "error");
  }
}

async function xjSendPasswordResetFromSettings() {
  var user = xjAuth && xjAuth.currentUser;
  if (!user || !user.email) {
    showToast("Error", "No email is attached to this account.", "error");
    return;
  }
  try {
    await xjAuth.sendPasswordResetEmail(user.email);
    showToast("Email sent", "Password reset instructions were sent to " + user.email);
  } catch (error) {
    showToast("Error", xjAuthErrorMessage(error), "error");
  }
}

function xjConfirmSignOut() {
  if (!window.confirm("Sign out of your XJ Games account?")) return;
  closeAccountSettings();
  xjCloseAccountMenu();
  logoutUser();
}

document.addEventListener("click", function(event) {
  var wrap = document.getElementById("xjAccountMenuWrap");
  var menu = document.getElementById("xjAccountDropdown");
  if (!xjAccountMenuOpen) return;
  if (wrap && wrap.contains(event.target)) return;
  if (menu && menu.contains(event.target)) return;
  xjCloseAccountMenu();
});

window.addEventListener("resize", xjPositionAccountDropdown);
window.addEventListener("scroll", xjPositionAccountDropdown, true);

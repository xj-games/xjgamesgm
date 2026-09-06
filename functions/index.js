const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

async function requireAdmin(request) {
  if (!request.auth || !request.auth.token.email) {
    throw new HttpsError("unauthenticated", "Sign-in required.");
  }
  const snap = await db.doc("config/admins").get();
  const emails = snap.exists && Array.isArray(snap.data().emails) ? snap.data().emails : [];
  if (emails.map((email) => String(email).toLowerCase()).indexOf(request.auth.token.email.toLowerCase()) === -1) {
    throw new HttpsError("permission-denied", "Admin permission required.");
  }
}

function cleanCode(value) {
  return String(value || "").trim().toUpperCase();
}

exports.createPromoCode = onCall(async (request) => {
  await requireAdmin(request);
  const code = cleanCode(request.data && request.data.code);
  const percent = Number(request.data && request.data.percent);
  const expiresAt = request.data && request.data.expiresAt ? new Date(request.data.expiresAt) : null;
  if (!/^[A-Z0-9]{7}$/.test(code) || !Number.isFinite(percent) || percent < 1 || percent > 90) {
    throw new HttpsError("invalid-argument", "Code must be exactly 7 letters/numbers and discount must be 1-90%.");
  }
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    throw new HttpsError("invalid-argument", "Invalid expiration date.");
  }
  const ref = db.doc(`promos/${code}`);
  await ref.create({
    code,
    percent,
    active: true,
    used: false,
    expiresAt: expiresAt ? admin.firestore.Timestamp.fromDate(expiresAt) : null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: request.auth.uid
  });
  await writeAdminLog(request, "promo_created", `promos/${code}`, { percent });
  return { code };
});

exports.redeemPromoCode = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign-in required to redeem a promo code.");
  const code = cleanCode(request.data && request.data.code);
  if (!/^[A-Z0-9]{7}$/.test(code)) throw new HttpsError("invalid-argument", "Promo code must be exactly 7 characters.");
  const ref = db.doc(`promos/${code}`);
  const result = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Promo code is invalid.");
    const promo = snap.data();
    const expires = promo.expiresAt && promo.expiresAt.toMillis ? promo.expiresAt.toMillis() : 0;
    if (promo.active !== true || promo.used === true || (expires && expires <= Date.now())) {
      throw new HttpsError("failed-precondition", "Promo code is disabled, expired, or already used.");
    }
    transaction.update(ref, {
      used: true,
      usedBy: request.auth.uid,
      usedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return { percent: promo.percent };
  });
  return result;
});

exports.createFlashSale = onCall(async (request) => {
  await requireAdmin(request);
  const productId = String(request.data && request.data.productId || "");
  const percent = Number(request.data && request.data.percent);
  const startsAt = new Date(request.data && request.data.startsAt);
  const endsAt = new Date(request.data && request.data.endsAt);
  if (!productId || !Number.isFinite(percent) || percent < 1 || percent > 80 ||
      Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    throw new HttpsError("invalid-argument", "Invalid flash sale values.");
  }
  const ref = db.collection("flashSales").doc();
  await ref.set({
    productId,
    percent,
    startsAt: admin.firestore.Timestamp.fromDate(startsAt),
    endsAt: admin.firestore.Timestamp.fromDate(endsAt),
    active: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: request.auth.uid
  });
  await writeAdminLog(request, "flash_sale_created", ref.path, { productId, percent });
  return { id: ref.id };
});

exports.cancelFlashSale = onCall(async (request) => {
  await requireAdmin(request);
  const saleId = String(request.data && request.data.saleId || "");
  if (!saleId) throw new HttpsError("invalid-argument", "Sale ID required.");
  await db.doc(`flashSales/${saleId}`).update({
    active: false,
    cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
    cancelledBy: request.auth.uid
  });

  exports.disablePromoCode = onCall(async (request) => {
    await requireAdmin(request);
    const code = cleanCode(request.data && request.data.code);
    if (!/^[A-Z0-9]{7}$/.test(code)) throw new HttpsError("invalid-argument", "Invalid promo code.");
    await db.doc(`promos/${code}`).update({ active: false, disabledAt: admin.firestore.FieldValue.serverTimestamp(), disabledBy: request.auth.uid });
    await writeAdminLog(request, "promo_disabled", `promos/${code}`);
    return { ok: true };
  });

  exports.createOrder = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign-in required.");
    const inputItems = Array.isArray(request.data && request.data.items) ? request.data.items : [];
    if (!inputItems.length || inputItems.length > 50) throw new HttpsError("invalid-argument", "Order items are required.");
    const itemRefs = inputItems.map((item) => db.doc(`products/${String(item.productId || "")}`));
    const snapshots = await db.getAll(...itemRefs);
    let total = 0;
    const items = snapshots.map((snapshot, index) => {
      if (!snapshot.exists) throw new HttpsError("not-found", "A product is no longer available.");
      const product = snapshot.data();
      const quantity = Math.max(1, Math.min(99, Number(inputItems[index].quantity) || 1));
      if (product.inStock === false) throw new HttpsError("failed-precondition", `${product.name} is out of stock.`);
      const price = Number(product.price) || 0;
      total += price * quantity;
      return { productId: snapshot.id, name: product.name, quantity, price };
    });
    const orderRef = db.collection(`users/${request.auth.uid}/orders`).doc(`XJ-${Date.now()}`);
    const order = {
      id: orderRef.id, userId: request.auth.uid, items, total, status: "Placed",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await orderRef.set(order);
    await db.collection("orders").doc(orderRef.id).set(order);
    return { id: orderRef.id, total };
  });

  exports.updateWebsiteSettings = onCall(async (request) => {
    await requireAdmin(request);
    const settings = request.data && request.data.settings;
    if (!settings || typeof settings !== "object") throw new HttpsError("invalid-argument", "Settings are required.");
    const allowed = ["maintenanceMode", "maintenanceMessage", "registrationEnabled", "orderingEnabled", "promotionsEnabled", "flashSalesEnabled"];
    const safe = {};
    allowed.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(settings, key)) safe[key] = settings[key];
    });
    await db.doc("config/settings").set({ ...safe, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await writeAdminLog(request, "website_settings_changed", "config/settings", safe);
    return { ok: true };
  });

  exports.restoreBackup = onCall(async (request) => {
    await requireAdmin(request);
    const backupId = String(request.data && request.data.backupId || "");
    const snapshot = await db.doc(`backups/${backupId}`).get();
    if (!snapshot.exists) throw new HttpsError("not-found", "Backup not found.");
    const collections = snapshot.data().collections || {};
    const batch = db.batch();
    Object.keys(collections).forEach((collection) => {
      (collections[collection] || []).forEach((entry) => {
        if (entry.id && entry.data) batch.set(db.doc(`${collection}/${entry.id}`), entry.data, { merge: true });
      });
    });
    await batch.commit();
    await writeAdminLog(request, "backup_restored", `backups/${backupId}`);
    return { ok: true };
  });
  await writeAdminLog(request, "flash_sale_cancelled", `flashSales/${saleId}`);
  return { ok: true };
});

exports.setAccountStatus = onCall(async (request) => {
  await requireAdmin(request);
  const uid = String(request.data && request.data.uid || "");
  const status = String(request.data && request.data.status || "");
  if (!uid || ["active", "suspended", "blocked"].indexOf(status) === -1) {
    throw new HttpsError("invalid-argument", "Invalid account status.");
  }
  await admin.auth().updateUser(uid, { disabled: status !== "active" });
  await db.doc(`users/${uid}`).set({
    accountStatus: status,
    statusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    statusUpdatedBy: request.auth.uid
  }, { merge: true });
  await writeAdminLog(request, "account_status_changed", `users/${uid}`, { status });
  return { ok: true };
});

async function writeAdminLog(request, action, resource, data) {
  await db.collection("adminActivity").add({
    adminUid: request.auth.uid,
    adminEmail: request.auth.token.email || "",
    action,
    resource,
    data: data || {},
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

exports.weeklyBackup = onSchedule("every monday 03:00", async () => {
  const collections = ["products", "promos", "flashSales", "config", "orders", "users"];
  const backup = { createdAt: admin.firestore.FieldValue.serverTimestamp(), collections: {} };
  for (const collection of collections) {
    const snapshot = await db.collection(collection).get();
    backup.collections[collection] = snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
  }
  const ref = await db.collection("backups").add(backup);
  logger.info("Weekly backup created", { backupId: ref.id });
});

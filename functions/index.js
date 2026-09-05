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
  const usageLimitInput = request.data && request.data.usageLimit;
  const usageLimit = usageLimitInput === undefined || usageLimitInput === null || usageLimitInput === ""
    ? null
    : Number(usageLimitInput);
  const expiresAt = request.data && request.data.expiresAt ? new Date(request.data.expiresAt) : null;
  if (!/^[A-Z0-9]{7,}$/.test(code) || !Number.isFinite(percent) || percent < 1 || percent > 90 ||
      (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 1))) {
    throw new HttpsError("invalid-argument", "Code must be at least 7 letters/numbers and discount must be 1-90%.");
  }
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    throw new HttpsError("invalid-argument", "Invalid expiration date.");
  }
  const ref = db.doc(`promoCodes/${code}`);
  await ref.create({
    code,
    percent,
    active: true,
    usageLimit,
    usageCount: 0,
    expiresAt: expiresAt ? admin.firestore.Timestamp.fromDate(expiresAt) : null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: request.auth.uid
  });
  await writeAdminLog(request, "promo_created", `promoCodes/${code}`, { percent });
  return { code };
});

exports.listPromoCodes = onCall(async (request) => {
  await requireAdmin(request);
  const snapshot = await db.collection("promoCodes").orderBy("createdAt", "desc").limit(100).get();
  return {
    promos: snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        code: data.code || doc.id,
        percent: Number(data.percent) || 0,
        active: data.active === true,
        usageLimit: data.usageLimit === null ? null : Number(data.usageLimit) || null,
        usageCount: Number(data.usageCount) || 0,
        expiresAt: data.expiresAt && data.expiresAt.toDate ? data.expiresAt.toDate().toISOString() : null
      };
    })
  };
});

exports.redeemPromoCode = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign-in required to redeem a promo code.");
  const code = cleanCode(request.data && request.data.code);
  if (!/^[A-Z0-9]{7,}$/.test(code)) throw new HttpsError("invalid-argument", "Promo code must be at least 7 characters.");
  const ref = db.doc(`promoCodes/${code}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Promo code is invalid.");
  const promo = snap.data();
  const expires = promo.expiresAt && promo.expiresAt.toMillis ? promo.expiresAt.toMillis() : 0;
  if (promo.active !== true || (promo.usageLimit !== null && Number(promo.usageCount || 0) >= Number(promo.usageLimit)) ||
      (expires && expires <= Date.now())) {
    throw new HttpsError("failed-precondition", "Promo code is disabled, expired, or already used.");
  }
  return { percent: promo.percent };
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
  await writeAdminLog(request, "flash_sale_cancelled", `flashSales/${saleId}`);
  return { ok: true };
});

exports.disablePromoCode = onCall(async (request) => {
    await requireAdmin(request);
    const code = cleanCode(request.data && request.data.code);
    if (!/^[A-Z0-9]{7,}$/.test(code)) throw new HttpsError("invalid-argument", "Invalid promo code.");
    await db.doc(`promoCodes/${code}`).update({ active: false, disabledAt: admin.firestore.FieldValue.serverTimestamp(), disabledBy: request.auth.uid });
    await writeAdminLog(request, "promo_disabled", `promoCodes/${code}`);
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
      const input = inputItems[index] || {};
      let price = Number(product.price) || 0;
      if (input.type === "ps4") {
        if (input.consoleType === "Full Set") price += 500;
        if (Number(input.psControllers) === 2) price += 1500;
        if (input.games) {
          price += String(input.games).split(",").map((game) => game.trim()).filter(Boolean).length * 1500;
        }
      } else if (input.type === "switch") {
        if (input.switchController === "Yes") price += 1500;
        if (input.switchDock === "Yes") price += 1000;
        if (input.switchGrip === "Yes") price += 1000;
      }
      if (input.delivery === "Yes") price += 300;
      total += price * quantity;
      return { productId: snapshot.id, name: product.name, quantity, price };
    });
    let discount = 0;
    const promoCode = cleanCode(request.data && request.data.promoCode);
    if (promoCode) {
      if (!/^[A-Z0-9]{7,}$/.test(promoCode)) throw new HttpsError("invalid-argument", "Invalid code, please try again");
      const promoRef = db.doc(`promoCodes/${promoCode}`);
      await db.runTransaction(async (transaction) => {
        const promoSnap = await transaction.get(promoRef);
        if (!promoSnap.exists) throw new HttpsError("not-found", "Invalid code, please try again");
        const promo = promoSnap.data();
        const expires = promo.expiresAt && promo.expiresAt.toMillis ? promo.expiresAt.toMillis() : 0;
        if (promo.active !== true || (promo.usageLimit !== null && Number(promo.usageCount || 0) >= Number(promo.usageLimit)) ||
            (expires && expires <= Date.now())) {
          throw new HttpsError("failed-precondition", "Invalid code, please try again");
        }
        discount = Math.round(total * Number(promo.percent) / 100);
        transaction.update(promoRef, {
          usageCount: admin.firestore.FieldValue.increment(1),
          usedBy: request.auth.uid,
          usedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      });
    }
    const finalTotal = Math.max(0, total - discount);
    const now = new Date();
    const day = now.getDate();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const counterRef = db.doc("config/orderCounter");
    const orderNumber = await db.runTransaction(async (transaction) => {
      const counterSnap = await transaction.get(counterRef);
      const nextNumber = (counterSnap.exists ? Number(counterSnap.data().nextNumber) || 1 : 1);
      transaction.set(counterRef, { nextNumber: nextNumber + 1 }, { merge: true });
      return nextNumber;
    });
    const orderNumberText = String(orderNumber).padStart(4, "0");
    const orderId = ["220", day, month, year, promoCode || null, orderNumberText]
      .filter((part) => part !== null)
      .join("-");
    const orderRef = db.collection(`users/${request.auth.uid}/orders`).doc(orderId);
    const order = {
      id: orderId, orderId, userId: request.auth.uid,
      customerName: String(request.data && request.data.customerName || "").trim().slice(0, 120),
      items, subtotal: total, promoCode: promoCode || null, total: finalTotal, discount,
      status: "Placed", paymentStatus: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await orderRef.set(order);
    await db.collection("orders").doc(orderId).set(order);
    return { id: orderId, orderId, items, promoCode: promoCode || null, total: finalTotal, discount };
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
    await db.doc("websiteSettings/main").set({ ...safe, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await writeAdminLog(request, "website_settings_changed", "websiteSettings/main", safe);
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
  await db.collection("adminLogs").add({
    adminUid: request.auth.uid,
    adminEmail: request.auth.token.email || "",
    action,
    resource,
    data: data || {},
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

exports.weeklyBackup = onSchedule("every monday 03:00", async () => {
  const collections = ["products", "promoCodes", "flashSales", "websiteSettings", "config", "orders", "users"];
  const backup = { createdAt: admin.firestore.FieldValue.serverTimestamp(), collections: {} };
  for (const collection of collections) {
    const snapshot = await db.collection(collection).get();
    backup.collections[collection] = snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
  }
  const ref = await db.collection("backups").add(backup);
  logger.info("Weekly backup created", { backupId: ref.id });
});

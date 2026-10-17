const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();

async function requireAdmin(request) {
  if (!request.auth || !request.auth.token.email) {
    throw new HttpsError("unauthenticated", "Sign-in required.");
  }

  const email = request.auth.token.email.toLowerCase();
  if (email === "ifeadia21@gmail.com") return;

  const snap = await db.doc("config/admins").get();
  const emails =
    snap.exists && Array.isArray(snap.data().emails)
      ? snap.data().emails
      : [];

  if (
    emails
      .map((email) => String(email).toLowerCase())
      .indexOf(email) === -1
  ) {
    throw new HttpsError("permission-denied", "Admin permission required.");
  }
}

function cleanCode(value) {
  return String(value || "").trim().toUpperCase();
}

function rejectRemovedCodeFeatures() {
  throw new HttpsError(
    "failed-precondition",
    "Promo codes and XJ Points are no longer available."
  );
}

exports.syncProductPrices = onCall(async (request) => {
  await requireAdmin(request);

  const prices = { "ps4-slim": 9500, "ps4-fat": 9000 };
  const migrationRef = db.doc("config/migrations");
  const applied = await db.runTransaction(async (transaction) => {
    const migration = await transaction.get(migrationRef);
    if (migration.exists && migration.data().ps4Prices20261002 === true) {
      return false;
    }
    Object.entries(prices).forEach(([productId, price]) => {
      transaction.set(db.doc(`products/${productId}`), {
        price,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    transaction.set(migrationRef, {
      ps4Prices20261002: true,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  });
  return { updated: applied ? Object.keys(prices) : [] };
});

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? 0 : time;
}

function assertPromoUsable(promo, priorRedemptionExists) {
  if (!promo) {
    throw new HttpsError("failed-precondition", "Invalid code, please try again.");
  }
  const now = Date.now();
  const starts = timestampMillis(promo.startsAt);
  const expires = timestampMillis(promo.expiresAt);
  const usageLimit = promo.usageLimit === null
    ? Infinity
    : Number(promo.usageLimit) || 1;
  const usedCount = Number(promo.usedCount) || (promo.used ? 1 : 0);

  if (!promo || promo.active !== true || promo.archived === true) {
    throw new HttpsError("failed-precondition", "Invalid code, please try again.");
  }
  if (starts && starts > now) {
    throw new HttpsError("failed-precondition", "This promo code is not active yet.");
  }
  if (expires && expires <= now) {
    throw new HttpsError("failed-precondition", "This promo code has expired.");
  }
  if (promo.used === true || usedCount >= usageLimit) {
    throw new HttpsError("failed-precondition", "This promo code has reached its redemption limit.");
  }
  if (promo.singleUsePerUser !== false && priorRedemptionExists) {
    throw new HttpsError("failed-precondition", "Invalid code, please try again.");
  }
}

function discountForSelectedItem(promo, items, appliedItemKey) {
  let targetIndex = items.length === 1 ? 0 : items.findIndex((item) =>
    item.cartItemKey && item.cartItemKey === appliedItemKey
  );
  if (targetIndex < 0) {
    throw new HttpsError(
      "invalid-argument",
      "Select which product the discount applies to."
    );
  }

  const selectedItem = items[targetIndex];
  const selectedTotal = (Number(selectedItem.price) || 0) * (Number(selectedItem.quantity) || 1);
  const discountPercent = Number(promo.percent) || 0;
  const configuredDiscount = Number(promo.discountAmount) || 0;
  const isFixed = promo.discountType === "fixed" || (!promo.discountType && configuredDiscount > 0 && discountPercent <= 0);
  const discount = isFixed
    ? Math.min(selectedTotal, configuredDiscount)
    : Math.round(selectedTotal * (discountPercent / 100));

  return {
    discount: Math.min(selectedTotal, Math.max(0, discount)),
    discountPercent,
    appliedItemIndex: targetIndex,
    appliedProductId: selectedItem.productId,
    appliedProductName: selectedItem.name,
  };
}

function optionalUsageLimit(value, maximum) {
  if (value === null || value === undefined || value === "") return null;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > maximum) return NaN;
  return limit;
}

function timestampFromOptional(value, label) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpsError("invalid-argument", `Invalid ${label} date.`);
  }
  return Timestamp.fromDate(date);
}

exports.createPromoCode = onCall(async (request) => {
  rejectRemovedCodeFeatures();
  await requireAdmin(request);

  const suppliedCode = cleanCode(request.data && request.data.code);
  const requestedType = request.data && request.data.discountType;
  const percent = Number(request.data && request.data.percent);
  const discountAmount = Number(request.data && request.data.discountAmount);
  const usageLimit = optionalUsageLimit(request.data && request.data.usageLimit, 100000);
  const minimumOrderValue = Number(request.data && request.data.minimumOrderValue) || 0;
  const discountType = requestedType === "fixed" || (!requestedType && discountAmount > 0 && percent <= 0) ? "fixed" : "percent";
  const startsAt = timestampFromOptional(request.data && request.data.startsAt, "start");
  const expiresAt = timestampFromOptional(request.data && request.data.expiresAt, "expiration");

  if (
    (suppliedCode && !/^[A-Z0-9]{3,64}$/.test(suppliedCode)) ||
    (discountType === "percent" && (!Number.isFinite(percent) || percent < 1 || percent > 90)) ||
    (discountType === "fixed" && (!Number.isSafeInteger(discountAmount) || discountAmount < 1)) ||
    Number.isNaN(usageLimit) ||
    !Number.isSafeInteger(minimumOrderValue) || minimumOrderValue < 0
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Use a 3-64 character code and enter a valid discount, minimum, and use limit."
    );
  }

  if (startsAt && expiresAt && expiresAt.toMillis() <= startsAt.toMillis()) {
    throw new HttpsError("invalid-argument", "Expiration must be after the start date.");
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = suppliedCode || `XJ${generatePointsCode().replace(/-/g, "")}`;
    const ref = db.doc(`promos/${code}`);
    try {
      await ref.create({
        code,
        type: "discount",
        discountType,
        percent: discountType === "percent" ? percent : 0,
        discountAmount: discountType === "fixed" ? discountAmount : 0,
        minimumOrderValue,
        active: true,
        used: false,
        usedCount: 0,
        usageLimit,
        singleUsePerUser: true,
        startsAt,
        expiresAt,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: request.auth.uid,
      });
      await writeAdminLog(request, "promo_created", ref.path, {
        discountType, percent, discountAmount, minimumOrderValue, usageLimit,
      });
      return { code };
    } catch (error) {
      if (error.code !== 6 && error.code !== "already-exists") throw error;
      if (suppliedCode) {
        throw new HttpsError("already-exists", "That discount code already exists.");
      }
    }
  }
  throw new HttpsError("internal", "Could not generate a unique discount code. Try again.");
});

function generatePointsCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(8);
  const value = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `XJ-${value.slice(0, 4)}-${value.slice(4)}`;
}

exports.createPointsCode = onCall(async (request) => {
  rejectRemovedCodeFeatures();
  await requireAdmin(request);
  const valueGmd = Number(request.data && request.data.valueGmd);
  const suppliedCode = cleanCode(request.data && request.data.code);
  const usageLimit = optionalUsageLimit(request.data && request.data.usageLimit, 100000);
  const expiresAt = timestampFromOptional(request.data && request.data.expiresAt, "expiration");
  if (suppliedCode && !/^[A-Z0-9-]{3,64}$/.test(suppliedCode)) {
    throw new HttpsError("invalid-argument", "Use a 3-64 character points code.");
  }
  if (!Number.isSafeInteger(valueGmd) || valueGmd < 1 || valueGmd > 10000000 ||
      Number.isNaN(usageLimit)) {
    throw new HttpsError("invalid-argument", "Enter a valid points value and redemption limit.");
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = suppliedCode || generatePointsCode();
    const ref = db.doc(`pointsCodes/${code}`);
    try {
      await ref.create({
        code,
        type: "points",
        valueGmd,
        points: valueGmd,
        usageLimit,
        expiresAt,
        usedCount: 0,
        active: true,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: request.auth.uid,
      });
      await writeAdminLog(request, "points_code_created", ref.path, { valueGmd, usageLimit, expiresAt });
      return { code, valueGmd, usageLimit, expiresAt };
    } catch (error) {
      if (error.code !== 6 && error.code !== "already-exists") throw error;
      if (suppliedCode) {
        throw new HttpsError("already-exists", "That XJ Points code already exists.");
      }
    }
  }
  throw new HttpsError("internal", "Could not generate a unique code. Try again.");
});

exports.redeemPointsCode = onCall(async (request) => {
  rejectRemovedCodeFeatures();
  if (!request.auth) throw new HttpsError("unauthenticated", "Please sign in to redeem an XJ Points code.");
  const code = cleanCode(request.data && request.data.code);
  if (!/^[A-Z0-9-]{3,64}$/.test(code)) {
    throw new HttpsError("not-found", "Invalid code. Please try again.");
  }

  const codeRef = db.doc(`pointsCodes/${code}`);
  const userRef = db.doc(`users/${request.auth.uid}`);
  const userRedemptionRef = userRef.collection("pointsCodeRedemptions").doc(code);
  const historyRef = userRef.collection("pointsHistory").doc();

  return db.runTransaction(async (transaction) => {
    const codeSnap = await transaction.get(codeRef);
    const userSnap = await transaction.get(userRef);
    const userRedemptionSnap = await transaction.get(userRedemptionRef);
    if (!codeSnap.exists) throw new HttpsError("not-found", "Invalid code. Please try again.");
    const codeData = codeSnap.data();
    if (userRedemptionSnap.exists) {
      throw new HttpsError("already-exists", "This XJ Points code has already been redeemed.");
    }
    const usedCount = Number(codeData.usedCount) || 0;
    const usageLimit = codeData.usageLimit === null ? Infinity : Number(codeData.usageLimit) || 1;
    if (codeData.active !== true || codeData.archived === true) {
      throw new HttpsError("failed-precondition", "This XJ Points code is disabled.");
    }
    if (timestampMillis(codeData.startsAt) && timestampMillis(codeData.startsAt) > Date.now()) {
      throw new HttpsError("failed-precondition", "This XJ Points code is not active yet.");
    }
    if (timestampMillis(codeData.expiresAt) && timestampMillis(codeData.expiresAt) <= Date.now()) {
      throw new HttpsError("failed-precondition", "This XJ Points code has expired.");
    }
    if (usedCount >= usageLimit) {
      throw new HttpsError("failed-precondition", "This XJ Points code has reached its redemption limit.");
    }

    const points = Number(codeData.points);
    const valueGmd = Number(codeData.valueGmd);
    const awardsPoints = Number.isSafeInteger(points) && points > 0;
    const award = awardsPoints ? points : valueGmd;
    if (!Number.isSafeInteger(award) || award < 1) {
      throw new HttpsError("failed-precondition", "This XJ Points code is unavailable.");
    }
    const nextUsedCount = usedCount + 1;
    const currentBalance = Math.max(0, Number(userSnap.exists && userSnap.data().balanceGmd) || 0);
    const currentPoints = Math.max(0, Number(userSnap.exists && userSnap.data().points) || 0);
    const balanceGmd = awardsPoints ? currentBalance : currentBalance + award;
    const pointsBalance = awardsPoints ? currentPoints + award : currentPoints;
    if (!Number.isSafeInteger(balanceGmd) || !Number.isSafeInteger(pointsBalance)) {
      throw new HttpsError("resource-exhausted", "The XJ Games points balance limit would be exceeded.");
    }
    transaction.update(codeRef, {
      usedCount: nextUsedCount,
      used: nextUsedCount >= usageLimit,
      lastRedeemedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(userRef, {
      uid: request.auth.uid,
      ...(awardsPoints
        ? { points: pointsBalance, pointsUpdatedAt: FieldValue.serverTimestamp() }
        : { balanceGmd, balanceUpdatedAt: FieldValue.serverTimestamp() }),
    }, { merge: true });
    transaction.create(userRedemptionRef, {
      code,
      points: awardsPoints ? award : 0,
      valueGmd: awardsPoints ? 0 : award,
      redeemedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(historyRef, {
      type: awardsPoints ? "redeemed" : "balance_added",
      transactionType: "points_code_redemption",
      ...(awardsPoints ? { points: award } : { balanceGmd: award }),
      code,
      createdAt: FieldValue.serverTimestamp(),
    });
    return {
      code,
      valueGmd: awardsPoints ? 0 : award,
      points: awardsPoints ? award : 0,
      balanceGmd,
      pointsBalance,
      usedCount: nextUsedCount,
    };
  });
});

exports.setCodeActive = onCall(async (request) => {
  rejectRemovedCodeFeatures();
  await requireAdmin(request);
  const code = cleanCode(request.data && request.data.code);
  const codeType = request.data && request.data.codeType;
  const active = request.data && request.data.active;
  if (!/^[A-Z0-9-]{3,64}$/.test(code) || !["points", "discount"].includes(codeType) || typeof active !== "boolean") {
    throw new HttpsError("invalid-argument", "Invalid code status request.");
  }
  const collection = codeType === "points" ? "pointsCodes" : "promos";
  const ref = db.doc(`${collection}/${code}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new HttpsError("not-found", "That code no longer exists.");
    if (snapshot.data().archived === true && active) {
      throw new HttpsError("failed-precondition", "A code with redemption history cannot be re-enabled after deletion.");
    }
    transaction.update(ref, {
      active,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: request.auth.uid,
    });
  });
  await writeAdminLog(request, active ? "code_enabled" : "code_disabled", ref.path);
  return { code, active };
});

exports.updateCode = onCall(async (request) => {
  rejectRemovedCodeFeatures();
  await requireAdmin(request);
  const code = cleanCode(request.data && request.data.code);
  const codeType = request.data && request.data.codeType;
  const usageLimit = optionalUsageLimit(request.data && request.data.usageLimit, 100000);
  const startsAt = timestampFromOptional(request.data && request.data.startsAt, "start");
  const expiresAt = timestampFromOptional(request.data && request.data.expiresAt, "expiration");
  if (!/^[A-Z0-9-]{3,64}$/.test(code) || !["points", "discount"].includes(codeType) || Number.isNaN(usageLimit)) {
    throw new HttpsError("invalid-argument", "Invalid code update.");
  }
  if (startsAt && expiresAt && expiresAt.toMillis() <= startsAt.toMillis()) {
    throw new HttpsError("invalid-argument", "Expiration must be after the start date.");
  }

  const ref = db.doc(`${codeType === "points" ? "pointsCodes" : "promos"}/${code}`);
  const updates = {
    usageLimit,
    startsAt,
    expiresAt,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: request.auth.uid,
  };
  if (codeType === "points") {
    const points = Number(request.data && request.data.points);
    if (!Number.isSafeInteger(points) || points < 1 || points > 10000000) {
      throw new HttpsError("invalid-argument", "Enter a valid points amount.");
    }
    updates.points = points;
    updates.valueGmd = points;
  } else {
    const discountType = request.data && request.data.discountType;
    const percent = Number(request.data && request.data.percent);
    const discountAmount = Number(request.data && request.data.discountAmount);
    const minimumOrderValue = Number(request.data && request.data.minimumOrderValue) || 0;
    if (!["percent", "fixed"].includes(discountType) ||
        (discountType === "percent" && (!Number.isFinite(percent) || percent < 1 || percent > 90)) ||
        (discountType === "fixed" && (!Number.isSafeInteger(discountAmount) || discountAmount < 1)) ||
        !Number.isSafeInteger(minimumOrderValue) || minimumOrderValue < 0) {
      throw new HttpsError("invalid-argument", "Enter valid discount settings.");
    }
    updates.discountType = discountType;
    updates.percent = discountType === "percent" ? percent : 0;
    updates.discountAmount = discountType === "fixed" ? discountAmount : 0;
    updates.minimumOrderValue = minimumOrderValue;
  }

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new HttpsError("not-found", "That code no longer exists.");
    const usedCount = Number(snapshot.data().usedCount) || (snapshot.data().used ? 1 : 0);
    if (usageLimit !== null && usageLimit < usedCount) {
      throw new HttpsError("failed-precondition", "The maximum uses cannot be less than the number already redeemed.");
    }
    const hasStartsAt = Object.prototype.hasOwnProperty.call(request.data || {}, "startsAt");
    const effectiveStartsAt = hasStartsAt ? startsAt : snapshot.data().startsAt;
    if (effectiveStartsAt && expiresAt && expiresAt.toMillis() <= timestampMillis(effectiveStartsAt)) {
      throw new HttpsError("invalid-argument", "Expiration must be after the start date.");
    }
    transaction.update(ref, updates);
  });
  await writeAdminLog(request, "code_updated", ref.path, {
    codeType,
    usageLimit,
    expiresAt,
  });
  return { code };
});

exports.deleteCode = onCall(async (request) => {
  rejectRemovedCodeFeatures();
  await requireAdmin(request);
  const code = cleanCode(request.data && request.data.code);
  const codeType = request.data && request.data.codeType;
  if (!/^[A-Z0-9-]{3,64}$/.test(code) || !["points", "discount"].includes(codeType)) {
    throw new HttpsError("invalid-argument", "Invalid code deletion request.");
  }

  const ref = db.doc(`${codeType === "points" ? "pointsCodes" : "promos"}/${code}`);
  const result = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new HttpsError("not-found", "That code no longer exists.");
    const data = snapshot.data();
    const usedCount = Number(data.usedCount) || (data.used ? 1 : 0);
    if (usedCount > 0) {
      transaction.update(ref, {
        active: false,
        archived: true,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: request.auth.uid,
      });
      return "archived";
    }
    transaction.delete(ref);
    return "deleted";
  });
  await writeAdminLog(request, "code_deleted", ref.path, { result });
  return { code, result };
});

/*
 * PROMO REDEMPTION
 * This now ONLY validates the code.
 * It does NOT permanently consume the code.
 * The code is consumed only when createOrder succeeds.
 */
exports.redeemPromoCode = onCall(async (request) => {
  rejectRemovedCodeFeatures();
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Sign-in required to redeem a promo code."
    );
  }

  const code = cleanCode(request.data && request.data.code);

  if (!/^[A-Z0-9]{3,64}$/.test(code)) {
    throw new HttpsError(
      "invalid-argument",
      "Promo code must be 3 to 64 letters or numbers."
    );
  }

  const ref = db.doc(`promos/${code}`);
  const snap = await ref.get();

  if (!snap.exists) {
    throw new HttpsError("not-found", "Invalid code, please try again.");
  }

  const promo = snap.data();
  const priorRedemption = await db
    .doc(`users/${request.auth.uid}/promoRedemptions/${code}`)
    .get();
  assertPromoUsable(promo, priorRedemption.exists);

  const percent = Number(promo.percent) || 0;
  const discountAmount = Number(promo.discountAmount) || 0;
  return {
    code,
    percent,
    discountAmount,
    discountType: promo.discountType || (discountAmount > 0 && percent <= 0 ? "fixed" : "percent"),
    minimumOrderValue: Number(promo.minimumOrderValue) || 0,
    points: Number(promo.points) || 0,
    valid: true,
  };
});

exports.createFlashSale = onCall(async (request) => {
  await requireAdmin(request);

  const productId = String(
    (request.data && request.data.productId) || ""
  );
  const percent = Number(request.data && request.data.percent);
  const startsAt = new Date(request.data && request.data.startsAt);
  const endsAt = new Date(request.data && request.data.endsAt);

  if (
    !productId ||
    !Number.isFinite(percent) ||
    percent < 1 ||
    percent > 80 ||
    Number.isNaN(startsAt.getTime()) ||
    Number.isNaN(endsAt.getTime()) ||
    endsAt <= startsAt
  ) {
    throw new HttpsError("invalid-argument", "Invalid flash sale values.");
  }

  const ref = db.collection("flashSales").doc();

  await ref.set({
    productId,
    percent,
    startsAt: Timestamp.fromDate(startsAt),
    endsAt: Timestamp.fromDate(endsAt),
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: request.auth.uid,
  });

  await writeAdminLog(request, "flash_sale_created", ref.path, {
    productId,
    percent,
  });

  return { id: ref.id };
});

exports.cancelFlashSale = onCall(async (request) => {
  await requireAdmin(request);

  const saleId = String((request.data && request.data.saleId) || "");

  if (!saleId) {
    throw new HttpsError("invalid-argument", "Sale ID required.");
  }

  await db.doc(`flashSales/${saleId}`).update({
    active: false,
    cancelledAt: FieldValue.serverTimestamp(),
    cancelledBy: request.auth.uid,
  });

  await writeAdminLog(
    request,
    "flash_sale_cancelled",
    `flashSales/${saleId}`
  );

  return { ok: true };
});

exports.disablePromoCode = onCall(async (request) => {
  rejectRemovedCodeFeatures();
  await requireAdmin(request);

  const code = cleanCode(request.data && request.data.code);

  if (!/^[A-Z0-9]{3,64}$/.test(code)) {
    throw new HttpsError("invalid-argument", "Invalid promo code.");
  }

  await db.doc(`promos/${code}`).update({
    active: false,
    disabledAt: FieldValue.serverTimestamp(),
    disabledBy: request.auth.uid,
  });

  await writeAdminLog(request, "promo_disabled", `promos/${code}`);

  return { ok: true };
});

/*
 * CHECKOUT / ORDER CREATION
 *
 * Guests are allowed to checkout.
 * Prices are read from Firebase, not trusted from the browser.
 * Promo code is checked and consumed atomically.
 * Order number is sequential: 0001, 0002, 0003...
 *
 * Example:
 * 220-4-9-2026-XJ25OFF-0001
 *
 * Without promo:
 * 220-4-9-2026-0002
 */
exports.createOrder = onCall(async (request) => {
  const data = request.data || {};
  const inputItems = Array.isArray(data.items) ? data.items : [];

  if (!inputItems.length || inputItems.length > 50) {
    throw new HttpsError(
      "invalid-argument",
      "Order items are required."
    );
  }

  const customerName = String(data.customerName || "Customer").trim().slice(0, 120);
  const customerEmail = String(data.customerEmail || "").trim().slice(0, 254);
  const customerPhone = String(data.customerPhone || "").trim().slice(0, 32);
  if (data.promoCode || data.useBalance === true) {
    rejectRemovedCodeFeatures();
  }
  const promoCode = cleanCode(data.promoCode);
  const useBalance = data.useBalance === true;

  if (promoCode && !/^[A-Z0-9]{3,64}$/.test(promoCode)) {
    throw new HttpsError(
      "invalid-argument",
      "Invalid promo code format."
    );
  }

  const productRefs = inputItems.map((item) =>
    db.doc(`products/${String(item.productId || "")}`)
  );

  let productSnapshots;
  let flashSaleSnapshots;

  try {
    productSnapshots = await db.getAll(...productRefs);
    flashSaleSnapshots = await db.collection("flashSales").where("active", "==", true).get();
  } catch (error) {
    logger.error("Failed reading order pricing data", error);
    throw new HttpsError(
      "internal",
      "Could not verify current product prices."
    );
  }

  const nowMillis = Date.now();
  const activeSalesByProduct = new Map();
  flashSaleSnapshots.docs.forEach((snapshot) => {
    const sale = snapshot.data();
    const startsAt = timestampMillis(sale.startsAt);
    const endsAt = timestampMillis(sale.endsAt);
    const percent = Number(sale.percent);
    if (
      !sale.productId ||
      !Number.isFinite(percent) ||
      percent < 1 ||
      percent > 80 ||
      (startsAt && startsAt > nowMillis) ||
      !endsAt ||
      endsAt <= nowMillis
    ) {
      return;
    }
    const existing = activeSalesByProduct.get(sale.productId);
    if (!existing || percent > existing.percent) {
      activeSalesByProduct.set(sale.productId, { percent });
    }
  });

  let total = 0;

  const items = productSnapshots.map((snapshot, index) => {
    if (!snapshot.exists) {
      throw new HttpsError(
        "not-found",
        "A product in your cart is no longer available."
      );
    }

    const product = snapshot.data();
    const productType = product.type || (
      ["ps4-slim", "ps4-fat", "ps5", "ps3", "ps2"].includes(snapshot.id)
        ? "ps4"
        : snapshot.id === "nintendo-switch" ? "switch" : "standalone"
    );

    if (product.inStock === false) {
      throw new HttpsError(
        "failed-precondition",
        `${product.name || "A product"} is out of stock.`
      );
    }

    const quantity = Math.max(
      1,
      Math.min(99, Number(inputItems[index].quantity) || 1)
    );

    const basePrice = Number(product.price) || 0;
    const sale = activeSalesByProduct.get(snapshot.id);
    let price = sale
      ? Math.round(basePrice * (1 - sale.percent / 100))
      : basePrice;
    const options = inputItems[index].options || {};

    if (productType === "ps4" || productType === "switch") {
      const consoleType = options.consoleType || "Console Only";
      if (!["Console Only", "Full Set"].includes(consoleType)) {
        throw new HttpsError("invalid-argument", "Invalid console option.");
      }
      if (consoleType === "Full Set") price += 500;

      if (options.delivery === "Yes") {
        if (!String(options.address || "").trim()) {
          throw new HttpsError("invalid-argument", "A delivery address is required.");
        }
        price += 300;
      } else if (options.delivery && options.delivery !== "No") {
        throw new HttpsError("invalid-argument", "Invalid delivery option.");
      }

      if (productType === "ps4") {
        const controllers = Number(options.psControllers) || 1;
        if (![1, 2].includes(controllers)) {
          throw new HttpsError("invalid-argument", "Invalid controller quantity.");
        }
        if (controllers === 2) {
          price += Math.max(0, Math.min(50000, Number(product.extraControllerPrice) || (snapshot.id === "ps5" ? 4000 : 1500)));
        }
        const games = snapshot.id === "ps5" ? [] : String(options.games || "").split(",").map((game) => game.trim()).filter(Boolean);
        if (games.length > 20) {
          throw new HttpsError("invalid-argument", "Too many games selected.");
        }
        price += games.length * 1500;
      } else {
        for (const [key, amount] of [["switchController", 1500], ["switchDock", 1000], ["switchGrip", 1000]]) {
          if (options[key] === "Yes") price += amount;
          if (options[key] && !["Yes", "No"].includes(options[key])) {
            throw new HttpsError("invalid-argument", "Invalid Nintendo option.");
          }
        }
      }
    }

    total += price * quantity;

    return {
      productId: snapshot.id,
      cartItemKey: String(inputItems[index].cartItemKey || ""),
      name: product.name || inputItems[index].name || "Product",
      quantity,
      price,
      basePrice,
      flashSalePercent: sale ? sale.percent : 0,
      options,
      details: String(inputItems[index].details || ""),
    };
  });

  const now = new Date();

  const day = now.getDate();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const datePart = `${day}-${month}-${year}`;

  const counterRef = db.doc("config/orderCounter");

  let finalOrder;

  try {
    finalOrder = await db.runTransaction(async (transaction) => {
      let promo = null;
      let promoRef = null;
      let promoRedemptionRef = null;
      let userRef = null;
      let userSnap = null;
      let usageLimit = 1;
      let usedCount = 0;
      let availableBalance = 0;

      /*
       * Check promo inside the same transaction so two customers
       * cannot successfully use the same promo code.
       */
      if (promoCode) {
        if (!request.auth) {
          throw new HttpsError("unauthenticated", "Sign in to use a promo code.");
        }
        promoRef = db.doc(`promos/${promoCode}`);
        const promoSnap = await transaction.get(promoRef);

        if (!promoSnap.exists) {
          throw new HttpsError(
            "not-found",
            "Invalid code, please try again."
          );
        }

        promo = promoSnap.data();
        usageLimit = promo.usageLimit === null ? Infinity : Number(promo.usageLimit) || 1;
        usedCount = Number(promo.usedCount) || (promo.used ? 1 : 0);
        promoRedemptionRef = db.doc(`users/${request.auth.uid}/promoRedemptions/${promoCode}`);
        userRef = db.doc(`users/${request.auth.uid}`);
        const priorRedemption = await transaction.get(promoRedemptionRef);
        userSnap = await transaction.get(userRef);
        assertPromoUsable(promo, priorRedemption.exists);
      }

      if (useBalance) {
        if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to use your XJ Games balance.");
        if (!userRef) userRef = db.doc(`users/${request.auth.uid}`);
        if (!userSnap) userSnap = await transaction.get(userRef);
        availableBalance = Math.max(0, Number(userSnap.exists && userSnap.data().balanceGmd) || 0);
      }

      const counterSnap = await transaction.get(counterRef);

      let orderNumber = 1;

      if (counterSnap.exists) {
        const current = Number(counterSnap.data().nextNumber) || 1;
        orderNumber = current;
      }

      const orderNumberText = String(orderNumber).padStart(4, "0");

      const orderId = promoCode
        ? `220-${datePart}-${promoCode}-${orderNumberText}`
        : `220-${datePart}-${orderNumberText}`;

      const promoDiscount = promo
        ? discountForSelectedItem(promo, items, data.appliedItemKey)
        : { discount: 0, discountPercent: 0, appliedItemIndex: -1, appliedProductId: null, appliedProductName: null };
      if (promo && total < (Number(promo.minimumOrderValue) || 0)) {
        throw new HttpsError(
          "failed-precondition",
          `This promo code requires a minimum order of ${(Number(promo.minimumOrderValue) || 0).toLocaleString()} GMD.`
        );
      }
      const discount = promoDiscount.discount;
      const discountPercent = promoDiscount.discountPercent;
      const balanceUsed = useBalance ? Math.min(Math.max(0, total - discount), availableBalance) : 0;
      const finalTotal = Math.max(0, total - discount - balanceUsed);

      const order = {
        id: orderId,
        orderNumber,
        customerName,
        customerEmail,
        customerPhone,
        userId: request.auth ? request.auth.uid : null,
        items,
        subtotal: total,
        discount,
        discountPercent,
        appliedItemIndex: promoDiscount.appliedItemIndex,
        appliedItemKey: promo ? String(data.appliedItemKey || "") : "",
        appliedProductId: promoDiscount.appliedProductId,
        appliedProductName: promoDiscount.appliedProductName,
        discountType: promo ? promo.discountType || (Number(promo.discountAmount) > 0 && discountPercent <= 0 ? "fixed" : "percent") : null,
        balanceUsed,
        balanceRemaining: useBalance ? availableBalance - balanceUsed : null,
        promoCode: promoCode || null,
        total: finalTotal,
        useBalance,
        status: "Pending WhatsApp confirmation",
        createdAt: FieldValue.serverTimestamp(),
      };

      /*
       * Always save to the main orders collection.
       */
      transaction.set(
        db.collection("orders").doc(orderId),
        order
      );

      /*
       * Save to the customer's order history when signed in.
       */
      if (request.auth) {
        transaction.set(
          db.doc(`users/${request.auth.uid}/orders/${orderId}`),
          order
        );
      }

      /*
       * Advance the order number.
       */
      transaction.set(
        counterRef,
        {
          nextNumber: orderNumber + 1,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return {
        id: orderId,
        total: finalTotal,
        subtotal: total,
        discount,
        discountPercent,
        appliedItemIndex: promoDiscount.appliedItemIndex,
        appliedProductId: promoDiscount.appliedProductId,
        appliedProductName: promoDiscount.appliedProductName,
        discountType: order.discountType,
        balanceUsed,
        remainingBalance: useBalance ? availableBalance - balanceUsed : null,
        promoCode: promoCode || "",
        items,
        customerName,
        status: order.status,
      };
    });
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }

    logger.error("Order transaction failed", error);

    throw new HttpsError(
      "internal",
      "Could not create the order. Please try again."
    );
  }

  return finalOrder;
});

exports.confirmOrder = onCall(async (request) => {
  await requireAdmin(request);
  const orderId = String(request.data && request.data.orderId || "").trim();
  if (!orderId || orderId.length > 160) {
    throw new HttpsError("invalid-argument", "A valid order ID is required.");
  }

  const orderRef = db.doc(`orders/${orderId}`);
  const confirmed = await db.runTransaction(async (transaction) => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists) throw new HttpsError("not-found", "Order not found.");
    const order = orderSnap.data();
    if (order.status !== "Pending WhatsApp confirmation") {
      throw new HttpsError("failed-precondition", "This order is no longer awaiting confirmation.");
    }

    const promoCode = cleanCode(order.promoCode);
    const promoRef = promoCode ? db.doc(`promos/${promoCode}`) : null;
    const userRef = order.userId ? db.doc(`users/${order.userId}`) : null;
    const redemptionRef = promoCode && order.userId
      ? userRef.collection("promoRedemptions").doc(promoCode)
      : null;
    const reads = await Promise.all([
      promoRef ? transaction.get(promoRef) : Promise.resolve(null),
      userRef ? transaction.get(userRef) : Promise.resolve(null),
      redemptionRef ? transaction.get(redemptionRef) : Promise.resolve(null),
    ]);
    const promoSnap = reads[0];
    const userSnap = reads[1];
    const redemptionSnap = reads[2];

    if (promoCode) {
      if (!order.userId || !promoSnap || !promoSnap.exists) {
        throw new HttpsError("failed-precondition", "The discount code cannot be confirmed.");
      }
      assertPromoUsable(promoSnap.data(), redemptionSnap.exists);
    }

    const promo = promoSnap && promoSnap.exists ? promoSnap.data() : null;
    if (promo && Number(order.subtotal) < (Number(promo.minimumOrderValue) || 0)) {
      throw new HttpsError("failed-precondition", "The order no longer meets the promo minimum.");
    }

    const subtotal = Number(order.subtotal) || 0;
    const discount = Number(order.discount) || 0;
    const requestedBalance = Number(order.balanceUsed) || 0;
    const currentBalance = userSnap && userSnap.exists
      ? Math.max(0, Number(userSnap.data().balanceGmd) || 0)
      : 0;
    if (requestedBalance > currentBalance) {
      throw new HttpsError("failed-precondition", "The customer's balance is no longer sufficient.");
    }

    const pointsEarned = promo ? Math.max(0, Math.floor(Number(promo.points) || 0)) : 0;
    const nextOrder = {
      status: "Confirmed",
      confirmedAt: FieldValue.serverTimestamp(),
      confirmedBy: request.auth.uid,
      total: Math.max(0, subtotal - discount - requestedBalance),
      ...(pointsEarned > 0 ? { pointsEarned } : {}),
    };
    transaction.update(orderRef, nextOrder);
    if (order.userId) {
      transaction.update(db.doc(`users/${order.userId}/orders/${orderId}`), nextOrder);
    }
    if (requestedBalance > 0 && userRef) {
      const remainingBalance = currentBalance - requestedBalance;
      transaction.set(userRef, {
        balanceGmd: remainingBalance,
        balanceUpdatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(userRef.collection("pointsHistory").doc(orderId), {
        type: "balance_spent",
        transactionType: "order_balance_spend",
        balanceGmd: -requestedBalance,
        orderId,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    if (pointsEarned > 0 && userRef && userSnap) {
      const updatedPoints = Math.max(0, Number(userSnap.exists && userSnap.data().points) || 0) + pointsEarned;
      if (!Number.isSafeInteger(updatedPoints)) {
        throw new HttpsError("resource-exhausted", "The customer's points balance limit would be exceeded.");
      }
      transaction.set(userRef, {
        points: updatedPoints,
        pointsUpdatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(userRef.collection("pointsHistory").doc(`${orderId}-promo`), {
        type: "earned",
        transactionType: "confirmed_order_promo",
        points: pointsEarned,
        promoCode,
        orderId,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    if (promoRef && promo && redemptionRef) {
      const usageLimit = promo.usageLimit === null ? Infinity : Number(promo.usageLimit) || 1;
      const usedCount = Number(promo.usedCount) || (promo.used ? 1 : 0);
      const nextUsedCount = usedCount + 1;
      transaction.update(promoRef, {
        usedCount: nextUsedCount,
        used: nextUsedCount >= usageLimit,
        lastRedeemedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(redemptionRef, {
        code: promoCode,
        orderId,
        discount,
        pointsAwarded: pointsEarned,
        appliedProductId: order.appliedProductId || null,
        appliedProductName: order.appliedProductName || null,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    return { id: orderId, status: "Confirmed" };
  });

  await writeAdminLog(request, "order_confirmed", `orders/${orderId}`);
  return confirmed;
});

exports.cancelOrder = onCall(async (request) => {
  await requireAdmin(request);
  const orderId = String(request.data && request.data.orderId || "").trim();
  if (!orderId || orderId.length > 160) {
    throw new HttpsError("invalid-argument", "A valid order ID is required.");
  }
  const orderRef = db.doc(`orders/${orderId}`);
  const cancelled = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists) throw new HttpsError("not-found", "Order not found.");
    const order = snapshot.data();
    if (order.status !== "Pending WhatsApp confirmation") {
      throw new HttpsError("failed-precondition", "Only pending orders can be cancelled.");
    }
    const update = {
      status: "Cancelled",
      cancelledAt: FieldValue.serverTimestamp(),
      cancelledBy: request.auth.uid,
    };
    transaction.update(orderRef, update);
    if (order.userId) {
      transaction.update(db.doc(`users/${order.userId}/orders/${orderId}`), update);
    }
    return { id: orderId, status: "Cancelled" };
  });
  await writeAdminLog(request, "order_cancelled", `orders/${orderId}`);
  return cancelled;
});

exports.updateWebsiteSettings = onCall(async (request) => {
  await requireAdmin(request);

  const settings = request.data && request.data.settings;

  if (!settings || typeof settings !== "object") {
    throw new HttpsError(
      "invalid-argument",
      "Settings are required."
    );
  }

  const allowed = [
    "maintenanceMode",
    "maintenanceMessage",
    "registrationEnabled",
    "orderingEnabled",
    "promotionsEnabled",
    "flashSalesEnabled",
  ];

  const safe = {};

  allowed.forEach((key) => {
    if (
      Object.prototype.hasOwnProperty.call(settings, key)
    ) {
      safe[key] = settings[key];
    }
  });

  await db
    .doc("config/settings")
    .set(
      {
        ...safe,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

  await writeAdminLog(
    request,
    "website_settings_changed",
    "config/settings",
    safe
  );

  return { ok: true };
});

exports.restoreBackup = onCall(async (request) => {
  await requireAdmin(request);

  const backupId = String(
    (request.data && request.data.backupId) || ""
  );

  const snapshot = await db.doc(`backups/${backupId}`).get();

  if (!snapshot.exists) {
    throw new HttpsError("not-found", "Backup not found.");
  }

  const collections = snapshot.data().collections || {};
  const batch = db.batch();

  Object.keys(collections).forEach((collection) => {
    (collections[collection] || []).forEach((entry) => {
      if (entry.id && entry.data) {
        batch.set(
          db.doc(`${collection}/${entry.id}`),
          entry.data,
          { merge: true }
        );
      }
    });
  });

  await batch.commit();

  await writeAdminLog(
    request,
    "backup_restored",
    `backups/${backupId}`
  );

  return { ok: true };
});

exports.setAccountStatus = onCall(async (request) => {
  await requireAdmin(request);

  const uid = String(
    (request.data && request.data.uid) || ""
  );

  const status = String(
    (request.data && request.data.status) || ""
  );

  if (
    !uid ||
    ["active", "suspended", "blocked"].indexOf(status) === -1
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Invalid account status."
    );
  }

  await admin.auth().updateUser(uid, {
    disabled: status !== "active",
  });

  await db.doc(`users/${uid}`).set(
    {
      accountStatus: status,
      statusUpdatedAt: FieldValue.serverTimestamp(),
      statusUpdatedBy: request.auth.uid,
    },
    { merge: true }
  );

  await writeAdminLog(
    request,
    "account_status_changed",
    `users/${uid}`,
    { status }
  );

  return { ok: true };
});

async function writeAdminLog(
  request,
  action,
  resource,
  data
) {
  await db.collection("adminActivity").add({
    adminUid: request.auth.uid,
    adminEmail: request.auth.token.email || "",
    action,
    resource,
    data: data || {},
    createdAt: FieldValue.serverTimestamp(),
  });
}

exports.weeklyBackup = onSchedule(
  "every monday 03:00",
  async () => {
    const collections = [
      "products",
      "promos",
      "pointsCodes",
      "flashSales",
      "config",
      "orders",
      "users",
    ];

    const backup = {
      createdAt: FieldValue.serverTimestamp(),
      collections: {},
    };

    for (const collection of collections) {
      const snapshot = await db.collection(collection).get();

      backup.collections[collection] = snapshot.docs.map(
        (doc) => ({
          id: doc.id,
          data: doc.data(),
        })
      );
    }

    const ref = await db.collection("backups").add(backup);

    logger.info("Weekly backup created", {
      backupId: ref.id,
    });
  }
);
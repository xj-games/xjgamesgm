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
  const emails =
    snap.exists && Array.isArray(snap.data().emails)
      ? snap.data().emails
      : [];

  if (
    emails
      .map((email) => String(email).toLowerCase())
      .indexOf(request.auth.token.email.toLowerCase()) === -1
  ) {
    throw new HttpsError("permission-denied", "Admin permission required.");
  }
}

function cleanCode(value) {
  return String(value || "").trim().toUpperCase();
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
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    transaction.set(migrationRef, {
      ps4Prices20261002: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  });
  return { updated: applied ? Object.keys(prices) : [] };
});

exports.createPromoCode = onCall(async (request) => {
  await requireAdmin(request);

  const code = cleanCode(request.data && request.data.code);
  const percent = Number(request.data && request.data.percent);
  const discountAmount = Number(request.data && request.data.discountAmount);
  const points = Number(request.data && request.data.points) || 0;
  const usageLimit = Number(request.data && request.data.usageLimit) || 1;
  const hasPercent = Number.isFinite(percent) && percent > 0;
  const hasAmount = Number.isFinite(discountAmount) && discountAmount > 0;
  const expiresAt =
    request.data && request.data.expiresAt
      ? new Date(request.data.expiresAt)
      : null;

  if (
    !/^[A-Z0-9]{3,64}$/.test(code) ||
    (hasPercent && (percent < 1 || percent > 90)) ||
    (!hasPercent && !hasAmount) ||
    !Number.isInteger(points) || points < 0 || points > 1000000 ||
    (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 1))
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Use a 3-64 character code and enter a valid discount, point award, and use limit."
    );
  }

  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    throw new HttpsError("invalid-argument", "Invalid expiration date.");
  }

  const ref = db.doc(`promos/${code}`);

  await ref.create({
    code,
    percent: hasPercent ? percent : 0,
    discountAmount: hasAmount ? discountAmount : 0,
    points,
    active: true,
    used: false,
    usedCount: 0,
    usageLimit,
    singleUsePerUser: true,
    expiresAt: expiresAt
      ? admin.firestore.Timestamp.fromDate(expiresAt)
      : null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: request.auth.uid,
  });

  await writeAdminLog(request, "promo_created", `promos/${code}`, {
    percent, discountAmount, points, usageLimit,
  });

  return { code };
});

/*
 * PROMO REDEMPTION
 * This now ONLY validates the code.
 * It does NOT permanently consume the code.
 * The code is consumed only when createOrder succeeds.
 */
exports.redeemPromoCode = onCall(async (request) => {
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
    throw new HttpsError("not-found", "Promo code is invalid.");
  }

  const promo = snap.data();
  const expires =
    promo.expiresAt && promo.expiresAt.toMillis
      ? promo.expiresAt.toMillis()
      : 0;
  const usageLimit = Number(promo.usageLimit) || 1;
  const usedCount = Number(promo.usedCount) || (promo.used ? 1 : 0);
  const priorRedemption = await db
    .doc(`users/${request.auth.uid}/promoRedemptions/${code}`)
    .get();

  if (
    promo.active !== true ||
    promo.used === true ||
    usedCount >= usageLimit ||
    (promo.singleUsePerUser !== false && priorRedemption.exists) ||
    (expires && expires <= Date.now())
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Promo code is disabled, expired, or already used."
    );
  }

  return {
    code,
    percent: Number(promo.percent) || 0,
    discountAmount: Number(promo.discountAmount) || 0,
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
    startsAt: admin.firestore.Timestamp.fromDate(startsAt),
    endsAt: admin.firestore.Timestamp.fromDate(endsAt),
    active: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
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
    cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
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
  await requireAdmin(request);

  const code = cleanCode(request.data && request.data.code);

  if (!/^[A-Z0-9]{7}$/.test(code)) {
    throw new HttpsError("invalid-argument", "Invalid promo code.");
  }

  await db.doc(`promos/${code}`).update({
    active: false,
    disabledAt: admin.firestore.FieldValue.serverTimestamp(),
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

  const customerName = String(data.customerName || "Customer").trim();
  const promoCode = cleanCode(data.promoCode);

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

  try {
    productSnapshots = await db.getAll(...productRefs);
  } catch (error) {
    logger.error("Failed reading order products", error);
    throw new HttpsError(
      "internal",
      "Could not verify the products."
    );
  }

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

    let price = Number(product.price) || 0;
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
      name: product.name || inputItems[index].name || "Product",
      quantity,
      price,
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

      /*
       * Check promo inside the same transaction so two customers
       * cannot successfully use the same promo code.
       */
      if (promoCode) {
        promoRef = db.doc(`promos/${promoCode}`);
        const promoSnap = await transaction.get(promoRef);

        if (!promoSnap.exists) {
          throw new HttpsError(
            "not-found",
            "Promo code is invalid."
          );
        }

        promo = promoSnap.data();

        const expires =
          promo.expiresAt && promo.expiresAt.toMillis
            ? promo.expiresAt.toMillis()
            : 0;
        usageLimit = Number(promo.usageLimit) || 1;
        usedCount = Number(promo.usedCount) || (promo.used ? 1 : 0);

        if (
          promo.active !== true ||
          promo.used === true ||
          usedCount >= usageLimit ||
          (expires && expires <= Date.now())
        ) {
          throw new HttpsError(
            "failed-precondition",
            "Promo code is invalid, expired, or already used."
          );
        }
        if (!request.auth) {
          throw new HttpsError("unauthenticated", "Sign in to use a promo code.");
        }
        promoRedemptionRef = db.doc(`users/${request.auth.uid}/promoRedemptions/${promoCode}`);
        userRef = db.doc(`users/${request.auth.uid}`);
        const priorRedemption = await transaction.get(promoRedemptionRef);
        userSnap = await transaction.get(userRef);
        if (promo.singleUsePerUser !== false && priorRedemption.exists) {
          throw new HttpsError("failed-precondition", "This promo code was already used by this account.");
        }
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

      const discountPercent = promo ? Number(promo.percent) || 0 : 0;
      const configuredDiscount = promo ? Number(promo.discountAmount) || 0 : 0;
      const discount = promo
        ? Math.min(total, configuredDiscount || Math.round(total * (discountPercent / 100)))
        : 0;

      const finalTotal = Math.max(0, total - discount);

      const order = {
        id: orderId,
        orderNumber,
        customerName,
        userId: request.auth ? request.auth.uid : null,
        items,
        subtotal: total,
        discount,
        discountPercent,
        promoCode: promoCode || null,
        total: finalTotal,
        status: "Placed",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
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
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      /*
       * Consume the promo ONLY when the order is successfully created.
       */
      if (promoRef) {
        const nextUsedCount = usedCount + 1;
        transaction.update(promoRef, {
          usedCount: nextUsedCount,
          used: nextUsedCount >= usageLimit,
          usedBy: request.auth.uid,
          usedAt: admin.firestore.FieldValue.serverTimestamp(),
          usedOrderId: orderId,
        });
        const pointsEarned = Math.max(0, Math.floor(Number(promo.points) || 0));
        transaction.set(promoRedemptionRef, {
          code: promoCode,
          orderId,
          discount,
          pointsAwarded: pointsEarned,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        if (pointsEarned > 0) {
          const currentPoints = Math.max(0, Number(userSnap.exists && userSnap.data().points) || 0);
          transaction.set(userRef, {
            uid: request.auth.uid,
            points: currentPoints + pointsEarned,
            pointsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
          transaction.set(userRef.collection("pointsHistory").doc(orderId), {
            type: "earned",
            points: pointsEarned,
            promoCode,
            orderId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }

      return {
        id: orderId,
        total: finalTotal,
        subtotal: total,
        discount,
        discountPercent,
        pointsEarned: promo ? Math.max(0, Math.floor(Number(promo.points) || 0)) : 0,
        promoCode: promoCode || "",
        items,
        customerName,
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
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
      statusUpdatedAt:
        admin.firestore.FieldValue.serverTimestamp(),
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
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

exports.weeklyBackup = onSchedule(
  "every monday 03:00",
  async () => {
    const collections = [
      "products",
      "promos",
      "flashSales",
      "config",
      "orders",
      "users",
    ];

    const backup = {
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
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
/**
 * XJ Games — Firestore-backed inventory with real-time updates
 */
var xjInventoryUnsubscribe = null;

async function xjInitInventory() {
  xjApplyAllStockStates();

  if (!xjDb || !xjIsFirebaseConfigured()) {
    return;
  }

  try {
    await xjSeedProductsIfNeeded();
  } catch (error) {
    console.warn("Could not seed product inventory:", error);
  }
  xjSubscribeToInventory();
}

async function xjSeedProductsIfNeeded() {
  const batch = xjDb.batch();
  let hasWrites = false;

  for (const productId of xjGetAllProductIds()) {
    const ref = xjDb.collection("products").doc(productId);
    const snap = await ref.get();
    if (!snap.exists) {
      const product = XJ_PRODUCT_CATALOG[productId];
      batch.set(ref, {
        id: productId,
        name: product.name,
        inStock: product.inStock,
        price: product.price,
        category: product.category,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      hasWrites = true;
    }
  }

  if (hasWrites) {
    await batch.commit();
  }
}

function xjSubscribeToInventory() {
  if (xjInventoryUnsubscribe) {
    xjInventoryUnsubscribe();
  }

  xjInventoryUnsubscribe = xjDb.collection("products").onSnapshot(function(snapshot) {
    snapshot.forEach(function(doc) {
      const data = doc.data();
      if (typeof data.inStock === "boolean") {
        xjSetProductStock(doc.id, data.inStock);
      }
    });
    xjApplyAllStockStates();
    xjRenderAdminInventoryPanel();
  }, function(error) {
    console.error("Inventory listener error:", error);
  });
}

function xjApplyAllStockStates() {
  document.querySelectorAll("#productGrid .card").forEach(function(card) {
    xjApplyStockState(card);
  });
}

function xjApplyStockState(card) {
  const productId = card.getAttribute("data-product-id");
  const stockBadge = card.querySelector(".stock");
  const button = card.querySelector("button");
  if (!stockBadge || !button || !productId) return;

  if (!button.hasAttribute("data-xj-original-onclick")) {
    const originalOnclick = button.getAttribute("onclick");
    if (originalOnclick) {
      button.setAttribute("data-xj-original-onclick", originalOnclick);
    }
  }

  const inStock = xjGetProductStock(productId);

  if (!inStock) {
    stockBadge.textContent = "● Out of Stock";
    stockBadge.classList.add("out-of-stock");
    button.textContent = "Notify Me";
    button.classList.add("xj-notify-btn");
    button.disabled = false;
    button.removeAttribute("onclick");
    button.onclick = function() {
      xjOpenStockNotifyWhatsApp(card);
    };
  } else {
    stockBadge.textContent = "● In Stock";
    stockBadge.classList.remove("out-of-stock");
    button.textContent = "Add to Cart";
    button.classList.remove("xj-notify-btn");
    button.disabled = false;
    button.onclick = null;
    const savedOnclick = button.getAttribute("data-xj-original-onclick");
    if (savedOnclick) {
      button.setAttribute("onclick", savedOnclick);
    } else {
      button.removeAttribute("onclick");
    }
  }
}

function xjIsProductInStock(productId) {
  return xjGetProductStock(productId);
}

function xjGetProductIdByName(name) {
  for (const id of xjGetAllProductIds()) {
    if (XJ_PRODUCT_CATALOG[id].name === name) {
      return id;
    }
  }
  return null;
}

function xjGuardInStock(productId, productName) {
  if (xjIsProductInStock(productId)) {
    return true;
  }
  showToast("Out of Stock", (productName || "This product") + " is currently unavailable.", "error");
  return false;
}

function xjOpenStockNotifyWhatsApp(card) {
  const productName = card.querySelector("h3").textContent.trim();
  const message = "Hi, I would like to be notified when " + productName + " is back in stock.";
  window.open("https://wa.me/" + XJ_WHATSAPP_NOTIFY_NUMBER + "?text=" + encodeURIComponent(message), "_blank");
}

/* ---- Admin inventory panel ---- */

function openAdminPanel() {
  if (!xjRequireAuth("Please log in to access admin features.")) return;
  if (!xjIsAdmin()) {
    showToast("Access Denied", "You do not have admin permissions.", "error");
    return;
  }
  xjRenderAdminInventoryPanel();
  document.getElementById("adminModal").classList.add("active");
}

function closeAdminPanel() {
  document.getElementById("adminModal").classList.remove("active");
}

function xjRenderAdminInventoryPanel() {
  const container = document.getElementById("adminInventoryList");
  if (!container) return;

  let html = "";
  xjGetAllProductIds().forEach(function(productId) {
    const product = XJ_PRODUCT_CATALOG[productId];
    const inStock = xjGetProductStock(productId);
    html +=
      '<div class="admin-inventory-row">' +
        '<div class="admin-inventory-info">' +
          '<strong>' + product.name + '</strong>' +
          '<span class="admin-inventory-status ' + (inStock ? "in-stock-label" : "out-stock-label") + '">' +
            (inStock ? "IN STOCK" : "OUT OF STOCK") +
          '</span>' +
        '</div>' +
        '<label class="admin-toggle">' +
          '<input type="checkbox" ' + (inStock ? "checked" : "") + ' onchange="xjAdminToggleStock(\'' + productId + '\', this.checked)">' +
          '<span>Available</span>' +
        '</label>' +
      '</div>';
  });

  container.innerHTML = html;
}

async function xjAdminToggleStock(productId, inStock) {
  if (!xjIsAdmin() || !xjDb) return;

  try {
    await xjDb.collection("products").doc(productId).set({
      inStock: inStock,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    showToast("Inventory Updated", XJ_PRODUCT_CATALOG[productId].name + " is now " + (inStock ? "IN STOCK" : "OUT OF STOCK") + ".");
  } catch (error) {
    console.error("Failed to update stock:", error);
    showToast("Error", "Could not update inventory. Please try again.", "error");
  }
}

var XJ_WHATSAPP_NOTIFY_NUMBER = "2202164491";

function xjInitStockSystem() {
  xjInitInventory();
}

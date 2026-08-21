/**
 * XJ Games — HTML-driven stock system
 *
 * Edit the product badge in index.html:
 *   <span class="stock">● In Stock</span>
 *   <span class="stock">● Out of Stock</span>
 * or add the class "out-of-stock" (example: class="stock out-of-stock").
 * The live page turns the badge red, blocks Add to Cart, and shows a WhatsApp notify button.
 */
var xjInventoryUnsubscribe = null;
var xjStockObserver = null;
var xjApplyingStock = false;
var XJ_WHATSAPP_NOTIFY_NUMBER = "2202164491";
var XJ_NOTIFY_BUTTON_LABEL = "Notify me when it's in stock";

function xjInitInventory() {
  xjSyncStockFromHtml();
  xjApplyAllStockStates();
  xjWatchStockHtmlChanges();
}

function xjInitStockSystem() {
  xjInitInventory();
}

function xjWatchStockHtmlChanges() {
  var grid = document.getElementById("productGrid");
  if (!grid || xjStockObserver) return;

  var timer = null;
  xjStockObserver = new MutationObserver(function() {
    if (xjApplyingStock) return;
    clearTimeout(timer);
    timer = setTimeout(function() {
      xjSyncStockFromHtml();
      xjApplyAllStockStates();
    }, 40);
  });

  xjStockObserver.observe(grid, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["class"]
  });
}

function xjGetStockBadge(card) {
  if (!card) return null;
  return card.querySelector(".stock, .out-of-stock");
}

function xjIsOutOfStockBadge(badge) {
  if (!badge) return false;

  var className = (badge.className || "").toLowerCase();
  if (className.indexOf("out-of-stock") !== -1 || className.indexOf("outofstock") !== -1) {
    return true;
  }

  var classes = className.split(/\s+/);
  if (classes.indexOf("out") !== -1 && classes.indexOf("of") !== -1 && classes.indexOf("stock") !== -1) {
    return true;
  }

  var text = (badge.textContent || "").toLowerCase().replace(/●/g, " ").replace(/\s+/g, " ").trim();
  return /out\s*of\s*stock/.test(text);
}

function xjSyncStockFromHtml() {
  document.querySelectorAll("#productGrid .card").forEach(function(card) {
    var productId = card.getAttribute("data-product-id");
    if (!productId) return;
    var inStock = !xjIsOutOfStockBadge(xjGetStockBadge(card));
    xjSetProductStock(productId, inStock);
  });
}

function xjApplyAllStockStates() {
  xjApplyingStock = true;
  try {
    document.querySelectorAll("#productGrid .card").forEach(function(card) {
      xjApplyStockState(card);
    });
  } finally {
    setTimeout(function() {
      xjApplyingStock = false;
    }, 80);
  }
}

function xjApplyStockState(card) {
  var productId = card.getAttribute("data-product-id");
  var stockBadge = xjGetStockBadge(card);
  var button = card.querySelector("button");
  if (!stockBadge || !button || !productId) return;

  if (!stockBadge.classList.contains("stock")) {
    stockBadge.classList.add("stock");
  }

  if (!button.hasAttribute("data-xj-original-onclick")) {
    var originalOnclick = button.getAttribute("onclick");
    if (originalOnclick) {
      button.setAttribute("data-xj-original-onclick", originalOnclick);
    }
  }
  if (!button.hasAttribute("data-xj-original-text")) {
    button.setAttribute("data-xj-original-text", button.textContent.trim() || "Add to Cart");
  }

  var inStock = xjGetProductStock(productId);

  if (!inStock) {
    stockBadge.textContent = "● Out of Stock";
    stockBadge.classList.add("out-of-stock");
    card.classList.add("xj-out-of-stock");
    button.textContent = XJ_NOTIFY_BUTTON_LABEL;
    button.classList.add("xj-notify-btn");
    button.disabled = false;
    button.removeAttribute("onclick");
    button.onclick = function() {
      xjOpenStockNotifyWhatsApp(card);
    };
  } else {
    stockBadge.textContent = "● In Stock";
    stockBadge.classList.remove("out-of-stock");
    card.classList.remove("xj-out-of-stock");
    button.textContent = button.getAttribute("data-xj-original-text") || "Add to Cart";
    button.classList.remove("xj-notify-btn");
    button.disabled = false;
    button.onclick = null;
    var savedOnclick = button.getAttribute("data-xj-original-onclick");
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
  for (var id of xjGetAllProductIds()) {
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
  var productName = card.querySelector("h3").textContent.trim();
  var message = "Hi, I would like to be notified when " + productName + " is back in stock.";
  window.open("https://wa.me/" + XJ_WHATSAPP_NOTIFY_NUMBER + "?text=" + encodeURIComponent(message), "_blank");
}

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
  var container = document.getElementById("adminInventoryList");
  if (!container) return;

  var html = "";
  xjGetAllProductIds().forEach(function(productId) {
    var product = XJ_PRODUCT_CATALOG[productId];
    var inStock = xjGetProductStock(productId);
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

function xjAdminToggleStock(productId, inStock) {
  var card = document.querySelector('#productGrid .card[data-product-id="' + productId + '"]');
  var badge = xjGetStockBadge(card);
  if (badge) {
    badge.textContent = inStock ? "● In Stock" : "● Out of Stock";
    badge.classList.toggle("out-of-stock", !inStock);
  }
  xjSetProductStock(productId, inStock);
  if (card) xjApplyStockState(card);
  xjRenderAdminInventoryPanel();
  showToast("Inventory Updated", XJ_PRODUCT_CATALOG[productId].name + " is now " + (inStock ? "IN STOCK" : "OUT OF STOCK") + ".");
}

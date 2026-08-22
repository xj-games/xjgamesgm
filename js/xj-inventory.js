/**
 * XJ Games — Stock, Notify Me, and admin catalog management
 */
var xjInventoryUnsubscribe = null;
var xjStockObserver = null;
var xjApplyingStock = false;
var xjAdminFormOpen = false;
var XJ_WHATSAPP_NOTIFY_NUMBER = "2202164491";
var XJ_NOTIFY_BUTTON_LABEL = "Notify Me";

function xjInitInventory() {
  xjSyncStockFromHtml();
  xjApplyAllStockStates();
  xjWatchStockHtmlChanges();
  if (xjDb && xjIsFirebaseConfigured()) {
    xjSubscribeToInventory();
  }
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

function xjSubscribeToInventory() {
  if (!xjDb) return;
  if (xjInventoryUnsubscribe) {
    xjInventoryUnsubscribe();
  }

  xjInventoryUnsubscribe = xjDb.collection("products").onSnapshot(function(snapshot) {
    snapshot.forEach(function(doc) {
      xjApplyRemoteProduct(doc.id, doc.data() || {});
    });
    xjApplyAllStockStates();
    xjRenderAdminInventoryPanel();
    if (typeof xjShowAllProductCards === "function") {
      xjShowAllProductCards();
    }
  }, function(error) {
    console.error("Inventory listener error:", error);
  });
}

function xjApplyRemoteProduct(productId, data) {
  if (data.hidden) {
    xjHideProduct(productId);
    var hiddenCard = document.querySelector('#productGrid .card[data-product-id="' + productId + '"]');
    if (hiddenCard) hiddenCard.style.display = "none";
    return;
  }

  xjUnhideProduct(productId);

  if (data.isCustom) {
    var customProduct = xjProductFromRemote(productId, data);
    xjRegisterProduct(customProduct);
    if (!document.querySelector('#productGrid .card[data-product-id="' + productId + '"]')) {
      xjInsertProductCard(customProduct);
    } else {
      xjRefreshProductCard(customProduct);
    }
  }

  if (typeof data.inStock === "boolean") {
    xjSetProductStock(productId, data.inStock);
    var card = document.querySelector('#productGrid .card[data-product-id="' + productId + '"]');
    var badge = xjGetStockBadge(card);
    if (badge) {
      badge.textContent = data.inStock ? "● In Stock" : "● Out of Stock";
      badge.classList.toggle("out-of-stock", !data.inStock);
    }
  }
}

function xjProductFromRemote(productId, data) {
  var name = data.name || "New Product";
  var type = data.type || "standalone";
  var category = data.category || (type === "standalone" ? "accessories" : "consoles");
  var categories = Array.isArray(data.categories) ? data.categories : [category];
  return {
    id: productId,
    name: name,
    slug: (data.slug || name).toLowerCase(),
    category: category,
    categories: categories,
    price: Number(data.price) || 0,
    inStock: data.inStock !== false,
    type: type,
    extraControllerPrice: Number(data.extraControllerPrice) || 1500,
    hasModal: type !== "standalone",
    image: data.image || "",
    description: data.description || "",
    aliases: Array.isArray(data.aliases) && data.aliases.length ? data.aliases : [name.toLowerCase()],
    isCustom: true
  };
}

function xjInsertProductCard(product) {
  var grid = document.getElementById("productGrid");
  if (!grid || !product) return;
  xjApplyingStock = true;
  grid.insertAdjacentHTML("beforeend", xjBuildProductCardHtml(product));
  setTimeout(function() {
    xjApplyingStock = false;
    var card = document.querySelector('#productGrid .card[data-product-id="' + product.id + '"]');
    if (card) xjApplyStockState(card);
  }, 90);
}

function xjRefreshProductCard(product) {
  var card = document.querySelector('#productGrid .card[data-product-id="' + product.id + '"]');
  if (!card) return;
  var title = card.querySelector("h3");
  var desc = card.querySelector(".desc");
  var price = card.querySelector(".price");
  var img = card.querySelector("img");
  if (title) title.textContent = product.name;
  if (desc) desc.textContent = product.description || "";
  if (price) price.textContent = Number(product.price).toLocaleString() + " GMD";
  if (img && product.image) {
    img.src = product.image;
    img.alt = product.name;
  }
}

function xjBuildProductCardHtml(product) {
  var inStock = xjGetProductStock(product.id);
  var safeName = xjEscapeHtml(product.name);
  var safeDesc = xjEscapeHtml(product.description || "");
  var safeImage = xjEscapeHtml(product.image || "xj-games-logo.png");
  var safeSlug = xjEscapeHtml(product.slug || product.name.toLowerCase());
  var safeCats = xjEscapeHtml((product.categories || []).join(","));
  var jsName = String(product.name).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  var action = product.hasModal
    ? "openCustomizationModal('" + jsName + "', " + Number(product.price) + ", '" + (product.type === "switch" ? "switch" : "ps4") + "')"
    : "directAddToCart('" + jsName + "', " + Number(product.price) + ")";

  return (
    '<div class="card" data-product-id="' + xjEscapeHtml(product.id) + '" data-name="' + safeSlug + '" data-category="' + safeCats + '">' +
      '<span class="stock' + (inStock ? "" : " out-of-stock") + '">● ' + (inStock ? "In Stock" : "Out of Stock") + "</span>" +
      '<img src="' + safeImage + '" alt="' + safeName + '">' +
      "<h3>" + safeName + "</h3>" +
      '<p class="desc">' + safeDesc + "</p>" +
      '<p class="price">' + Number(product.price).toLocaleString() + " GMD</p>" +
      '<button onclick="' + action + '">Add to Cart</button>' +
    "</div>"
  );
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
  var text = (badge.textContent || "").toLowerCase().replace(/●/g, " ").replace(/\s+/g, " ").trim();
  return /out\s*of\s*stock/.test(text);
}

function xjSyncStockFromHtml() {
  document.querySelectorAll("#productGrid .card").forEach(function(card) {
    var productId = card.getAttribute("data-product-id");
    if (!productId || Object.prototype.hasOwnProperty.call(xjInventoryState, productId)) return;
    xjSetProductStock(productId, !xjIsOutOfStockBadge(xjGetStockBadge(card)));
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
  if (xjIsProductHidden(productId)) {
    card.style.display = "none";
    return;
  }

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
    button.setAttribute("data-xj-original-text", "Add to Cart");
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
    button.textContent = "Add to Cart";
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
  var ids = xjGetAllProductIds();
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    if (XJ_PRODUCT_CATALOG[id] && XJ_PRODUCT_CATALOG[id].name === name) {
      return id;
    }
  }
  var cards = document.querySelectorAll("#productGrid .card");
  for (var c = 0; c < cards.length; c++) {
    var title = cards[c].querySelector("h3");
    if (title && title.textContent.trim() === name) {
      return cards[c].getAttribute("data-product-id");
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
  xjAdminFormOpen = false;
  xjRenderAdminInventoryPanel();
  document.getElementById("adminModal").classList.add("active");
}

function closeAdminPanel() {
  document.getElementById("adminModal").classList.remove("active");
}

function xjToggleAdminAddForm() {
  xjAdminFormOpen = !xjAdminFormOpen;
  xjRenderAdminInventoryPanel();
}

function xjRenderAdminInventoryPanel() {
  var container = document.getElementById("adminInventoryList");
  if (!container) return;

  var html =
    '<div class="admin-toolbar">' +
      '<button type="button" class="admin-action-btn" onclick="xjToggleAdminAddForm()">' + (xjAdminFormOpen ? "Close form" : "Add product") + "</button>" +
    "</div>";

  if (xjAdminFormOpen) {
    html +=
      '<form class="admin-add-form" onsubmit="xjAdminAddProduct(event)">' +
        '<label>Product name</label>' +
        '<input id="adminProductName" type="text" maxlength="80" placeholder="e.g. Xbox Series S" required>' +
        '<label>Price (GMD)</label>' +
        '<input id="adminProductPrice" type="number" min="1" max="999999" step="1" placeholder="e.g. 15000" required>' +
        '<label>Description</label>' +
        '<textarea id="adminProductDesc" rows="3" maxlength="280" placeholder="Short product description"></textarea>' +
        '<label>Image file name</label>' +
        '<input id="adminProductImage" type="text" maxlength="120" placeholder="e.g. xbox-series-s.png" required>' +
        '<p class="admin-help">Upload that image file to GitHub in the same folder as the website. Use the exact file name.</p>' +
        '<label>Product type</label>' +
        '<select id="adminProductType">' +
          '<option value="standalone">Accessory / direct add to cart</option>' +
          '<option value="ps4">PlayStation console (customize order)</option>' +
          '<option value="switch">Nintendo Switch (customize order)</option>' +
        "</select>" +
        '<label class="admin-toggle"><input id="adminProductInStock" type="checkbox" checked><span>In stock</span></label>' +
        '<button type="submit" class="checkout-btn" style="width:100%;margin-top:8px;border:none;">Create product</button>' +
      "</form>";
  }

  xjGetAllProductIds().forEach(function(productId) {
    var product = XJ_PRODUCT_CATALOG[productId];
    if (!product) return;
    var inStock = xjGetProductStock(productId);
    html +=
      '<div class="admin-inventory-row">' +
        '<div class="admin-inventory-info">' +
          "<strong>" + xjEscapeHtml(product.name) + "</strong>" +
          '<span class="admin-inventory-status ' + (inStock ? "in-stock-label" : "out-stock-label") + '">' +
            (inStock ? "IN STOCK" : "OUT OF STOCK") +
          "</span>" +
        "</div>" +
        '<div class="admin-row-actions">' +
          '<label class="admin-toggle">' +
            '<input type="checkbox" ' + (inStock ? "checked" : "") + ' onchange="xjAdminToggleStock(\'' + productId + "', this.checked)\">" +
            "<span>Available</span>" +
          "</label>" +
          '<button type="button" class="admin-remove-btn" onclick="xjAdminRemoveProduct(\'' + productId + "')\">Remove product</button>" +
        "</div>" +
      "</div>";
  });

  container.innerHTML = html;
}

async function xjAdminToggleStock(productId, inStock) {
  if (!xjIsAdmin()) return;
  var card = document.querySelector('#productGrid .card[data-product-id="' + productId + '"]');
  var badge = xjGetStockBadge(card);
  if (badge) {
    badge.textContent = inStock ? "● In Stock" : "● Out of Stock";
    badge.classList.toggle("out-of-stock", !inStock);
  }
  xjSetProductStock(productId, inStock);
  if (card) xjApplyStockState(card);
  xjRenderAdminInventoryPanel();

  if (xjDb) {
    try {
      await xjDb.collection("products").doc(productId).set({
        inStock: !!inStock,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.error("Failed to update stock:", error);
      showToast("Error", "Could not save stock to the database.", "error");
      return;
    }
  }
  showToast("Inventory Updated", XJ_PRODUCT_CATALOG[productId].name + " is now " + (inStock ? "IN STOCK" : "OUT OF STOCK") + ".");
}

async function xjAdminAddProduct(event) {
  event.preventDefault();
  if (!xjIsAdmin()) return;

  var name = document.getElementById("adminProductName").value.trim();
  var price = parseInt(document.getElementById("adminProductPrice").value, 10);
  var description = document.getElementById("adminProductDesc").value.trim();
  var image = xjSanitizeImageFileName(document.getElementById("adminProductImage").value);
  var type = document.getElementById("adminProductType").value;
  var inStock = document.getElementById("adminProductInStock").checked;

  if (!name || name.length < 2) {
    showToast("Error", "Please enter a valid product name.", "error");
    return;
  }
  if (!price || price < 1) {
    showToast("Error", "Please enter a valid price.", "error");
    return;
  }
  if (!image) {
    showToast("Error", "Use a valid image file name such as product.png", "error");
    return;
  }

  var productId = "custom-" + xjSlugifyProductName(name);
  if (XJ_PRODUCT_CATALOG[productId] && !xjIsProductHidden(productId)) {
    productId += "-" + Date.now().toString().slice(-4);
  }

  var categories = type === "switch"
    ? ["nintendo", "consoles", "switch"]
    : type === "ps4"
      ? ["playstation", "consoles"]
      : ["accessories"];

  var product = {
    id: productId,
    name: name,
    slug: name.toLowerCase(),
    category: type === "standalone" ? "accessories" : "consoles",
    categories: categories,
    price: price,
    inStock: inStock,
    type: type,
    extraControllerPrice: type === "ps4" ? 1500 : 0,
    hasModal: type !== "standalone",
    image: image,
    description: description,
    aliases: [name.toLowerCase()],
    isCustom: true
  };

  xjRegisterProduct(product);
  xjSetProductStock(productId, inStock);
  xjInsertProductCard(product);

  if (xjDb) {
    try {
      await xjDb.collection("products").doc(productId).set({
        id: productId,
        name: name,
        slug: product.slug,
        category: product.category,
        categories: categories,
        price: price,
        inStock: inStock,
        type: type,
        extraControllerPrice: product.extraControllerPrice,
        image: image,
        description: description,
        aliases: product.aliases,
        isCustom: true,
        hidden: false,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      console.error("Failed to add product:", error);
      showToast("Error", "The product was added on this page, but it could not be saved for other visitors.", "error");
      return;
    }
  }

  xjAdminFormOpen = false;
  xjRenderAdminInventoryPanel();
  showToast("Product added", name + " is now on the website. Upload " + image + " to GitHub if it is not there yet.");
}

async function xjAdminRemoveProduct(productId) {
  if (!xjIsAdmin()) return;
  var product = XJ_PRODUCT_CATALOG[productId];
  var label = product ? product.name : "this product";
  if (!window.confirm("Remove " + label + " from the website? Customers will no longer see or search for it.")) {
    return;
  }

  xjHideProduct(productId);
  var card = document.querySelector('#productGrid .card[data-product-id="' + productId + '"]');
  if (card) card.style.display = "none";

  if (xjDb) {
    try {
      await xjDb.collection("products").doc(productId).set({
        hidden: true,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.error("Failed to remove product:", error);
      showToast("Error", "Could not remove the product for other visitors.", "error");
      return;
    }
  }

  xjRenderAdminInventoryPanel();
  showToast("Product removed", label + " has been removed from the store.");
}

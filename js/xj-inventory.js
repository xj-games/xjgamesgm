/**
 * XJ Games — Stock, Notify Me, and admin catalog management
 */
var xjInventoryUnsubscribe = null;
var xjStockObserver = null;
var xjApplyingStock = false;
var xjAdminFormOpen = false;
var xjCategoryOrderUnsubscribe = null;
var xjFeaturedProductsUnsubscribe = null;
var xjInventoryReady = false;
var XJ_WHATSAPP_NOTIFY_NUMBER = "2202164491";
var XJ_NOTIFY_BUTTON_LABEL = "Notify Me";

function xjInitInventory() {
  xjSyncStockFromHtml();
  xjApplyAllStockStates();
  if (typeof xjShowAllProductCards === "function") xjShowAllProductCards();
  xjWatchStockHtmlChanges();
  if (xjDb && xjIsFirebaseConfigured()) {
    xjSubscribeToInventory();
    xjSubscribeToCategoryOrder();
    xjSubscribeToFeaturedProducts();
  }

  function xjSubscribeToCategoryOrder() {
    if (!xjDb) return;
    if (xjCategoryOrderUnsubscribe) xjCategoryOrderUnsubscribe();
    xjCategoryOrderUnsubscribe = xjDb.collection("config").doc("categoryOrder").onSnapshot(function(snapshot) {
      if (snapshot.exists && Array.isArray(snapshot.data().order)) {
        xjSetCategoryOrder(snapshot.data().order);
        xjShowAllProductCards();
      }
    }, function(error) {
      console.error("Category order listener error:", error);
    });
  }

  function xjSubscribeToFeaturedProducts() {
    if (xjFeaturedProductsUnsubscribe) xjFeaturedProductsUnsubscribe();
    xjFeaturedProductsUnsubscribe = xjDb.collection("config").doc("featuredProducts").onSnapshot(function(snapshot) {
      var ids = snapshot.exists && Array.isArray(snapshot.data().productIds) ? snapshot.data().productIds : [];
      xjFeaturedProductIds = ids.filter(function(id, index) {
        return typeof id === "string" && ids.indexOf(id) === index;
      });
      xjValidateFeaturedProductIds();
      xjShowAllProductCards();
      xjRenderAdminInventoryPanel();
    }, function(error) {
      console.error("Featured products listener error:", error);
      showToast("Homepage selection", "Could not load featured products. Please refresh and try again.", "error");
    });
  }
}

function xjValidateFeaturedProductIds() {
  if (xjInventoryReady) {
    var seen = {};
    xjFeaturedProductIds = xjFeaturedProductIds.filter(function(id) {
      if (typeof id !== "string" || seen[id]) return false;
      var product = XJ_PRODUCT_CATALOG[id];
      var valid = !!product && !xjIsProductHidden(id) && xjIsAllowedHomepageProduct(product);
      if (valid) seen[id] = true;
      return valid;
    }).slice(0, 12);
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
    xjInventoryReady = true;
    xjValidateFeaturedProductIds();
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
    if (data.isCustom || (!XJ_PRODUCT_CATALOG[productId] && xjHasRemoteProductFields(data))) {
      XJ_PRODUCT_CATALOG[productId] = xjProductFromRemote(productId, data);
    }
    xjHideProduct(productId);
    var hiddenCard = document.querySelector('#productGrid .card[data-product-id="' + productId + '"]');
    if (hiddenCard) hiddenCard.style.display = "none";
    xjFeaturedProductIds = xjFeaturedProductIds.filter(function(id) { return id !== productId; });
    if (window.xjRepriceCartFromCatalog) window.xjRepriceCartFromCatalog(productId);
    if (typeof xjShowAllProductCards === "function") xjShowAllProductCards();
    if (window.xjRefreshRecommendations) window.xjRefreshRecommendations();
    return;
  }

  xjUnhideProduct(productId);

  var existingProduct = XJ_PRODUCT_CATALOG[productId];
  if (existingProduct) {
    if (Number.isFinite(Number(data.price)) && Number(data.price) > 0) {
      existingProduct.price = Number(data.price);
    }
    if (typeof data.description === "string") {
      existingProduct.description = data.description;
    }
    if (typeof data.condition === "string") existingProduct.condition = data.condition;
    if (Array.isArray(data.images)) {
      existingProduct.images = data.images.filter(function(url) { return typeof url === "string"; });
      existingProduct.image = existingProduct.images[0] || "";
    }
    if (typeof data.image === "string") existingProduct.image = data.image;
    if (Array.isArray(data.videoUrls)) existingProduct.videoUrls = data.videoUrls.filter(function(url) { return typeof url === "string"; });
    if (data.storageCapacity !== undefined) existingProduct.storageCapacity = data.storageCapacity;
    if (data.includedAccessories !== undefined) existingProduct.includedAccessories = data.includedAccessories;
  }

  if (data.isCustom || (!existingProduct && xjHasRemoteProductFields(data))) {
    var customProduct = xjProductFromRemote(productId, data);
    xjRegisterProduct(customProduct);
    if (!document.querySelector('#productGrid .card[data-product-id="' + productId + '"]')) {
      xjInsertProductCard(customProduct);
    } else {
      xjRefreshProductCard(customProduct);
    }
  } else if (existingProduct) {
    xjRefreshProductCard(existingProduct);
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
  if (window.xjRepriceCartFromCatalog) window.xjRepriceCartFromCatalog(productId);
  if (window.xjRefreshCommerceProducts) window.xjRefreshCommerceProducts();
  if (window.xjRefreshRecommendations) window.xjRefreshRecommendations();
}

function xjHasRemoteProductFields(data) {
  return !!(data && typeof data.name === "string" && data.name.trim() && Number(data.price) > 0);
}

function xjProductFromRemote(productId, data) {
  var name = data.name || "New Product";
  var nameLower = name.toLowerCase();
  var gameProduct = /\b(game|games|disc|cd)\b/i.test(nameLower);
  var controller = /controller|dualshock|dualsense/.test(nameLower);
  var playStationConsole = !gameProduct && !controller && /(playstation\s*[2345]|(^|[^a-z])ps[2345]([^a-z]|$))/i.test(name);
  var switchConsole = !gameProduct && !controller && /nintendo switch/i.test(name);
  var inferredCategory = gameProduct ? "games" : playStationConsole || switchConsole ? "consoles" : controller ? "accessories" : "accessories";
  var category = gameProduct ? "games" : data.category || inferredCategory;
  var inferredType = gameProduct ? "game" : playStationConsole ? "ps4" : switchConsole ? "switch" : controller ? "controller" : "standalone";
  var type = gameProduct ? "game" : data.type || inferredType;
  var categories = gameProduct ? ["games"] : Array.isArray(data.categories) ? data.categories.slice() : [category];
  if (!gameProduct && !Array.isArray(data.categories)) {
    if (playStationConsole) categories = ["playstation", "consoles", "ps" + (name.match(/(?:ps|playstation\s*)([2345])/i) || [])[1]];
    else if (switchConsole) categories = ["nintendo", "switch", "consoles"];
    else if (controller) categories = ["controllers", "accessories"];
    else if (category === "games") categories = ["games"];
  }
  var displayCategory = gameProduct ? "games" : data.displayCategory || (playStationConsole
    ? "playstation-consoles"
    : switchConsole
      ? "nintendo-consoles"
      : controller
        ? "controllers"
        : category === "games" ? "games" : "accessories");
  return {
    id: productId,
    name: name,
    slug: (data.slug || name).toLowerCase(),
    category: category,
    displayCategory: displayCategory,
    categories: categories,
    price: Number(data.price) || 0,
    inStock: data.inStock !== false,
    type: type,
    extraControllerPrice: Number(data.extraControllerPrice) || 1500,
    hasModal: type === "ps4" || type === "switch",
    image: data.image || "",
    images: Array.isArray(data.images) ? data.images : (data.image ? [data.image] : []),
    videoUrls: Array.isArray(data.videoUrls) ? data.videoUrls : [],
    condition: typeof data.condition === "string" ? data.condition : "",
    storageCapacity: data.storageCapacity,
    includedAccessories: data.includedAccessories,
    description: data.description || "",
    aliases: Array.isArray(data.aliases) && data.aliases.length ? data.aliases : [name.toLowerCase()],
    createdAt: data.createdAt && typeof data.createdAt.toMillis === "function" ? data.createdAt.toMillis() : Number(data.createdAt) || 0,
    isCustom: data.isCustom !== false,
    showOnHomepage: data.showOnHomepage !== false
  };
}

function xjInsertProductCard(product) {
  var grid = document.getElementById("productGrid");
  if (!grid || !product) return;
  xjApplyingStock = true;
  grid.insertAdjacentHTML("beforeend", xjBuildProductCardHtml(product));
  if (typeof xjShowAllProductCards === "function") xjShowAllProductCards();
  setTimeout(function() {
    xjApplyingStock = false;
    var card = document.querySelector('#productGrid .card[data-product-id="' + product.id + '"]');
    if (card) {
      var carousel = card.querySelector(".xj-product-carousel");
      if (carousel && !carousel.querySelector(".xj-carousel-track") && typeof xjBuildProductCarousel === "function") {
        xjBuildProductCarousel(carousel);
      }
      xjApplyStockState(card);
    }
    if (window.xjRefreshProductPrices) window.xjRefreshProductPrices();
    if (window.xjRefreshCommerceProducts) window.xjRefreshCommerceProducts();
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
  var conditionBadge = card.querySelector(".product-condition");
  if (product.condition) {
    if (!conditionBadge) {
      conditionBadge = document.createElement("span");
      conditionBadge.className = "product-condition";
      card.insertBefore(conditionBadge, card.querySelector("h3"));
    }
    conditionBadge.textContent = product.condition;
  } else if (conditionBadge) {
    conditionBadge.remove();
  }
}

function xjBuildProductCardHtml(product) {
  var inStock = xjGetProductStock(product.id);
  var safeName = xjEscapeHtml(product.name);
  var safeDesc = xjEscapeHtml(product.description || "");
  var safeImage = xjEscapeHtml(product.image || "xj-games-logo.png");
  var safeCondition = xjEscapeHtml(product.condition || "");
  var safeSlug = xjEscapeHtml(product.slug || product.name.toLowerCase());
  var safeCats = xjEscapeHtml((product.categories || []).join(","));
  var jsName = String(product.name).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  var action = product.hasModal
    ? "openCustomizationModal('" + jsName + "', " + Number(product.price) + ", '" + (product.type === "switch" ? "switch" : "ps4") + "', this)"
    : "directAddToCart('" + jsName + "', " + Number(product.price) + ", this)";
  var eligible = !!product.id;

  return (
    '<div class="card" data-product-id="' + xjEscapeHtml(product.id) + '" data-name="' + safeSlug + '" data-category="' + safeCats + '">' +
      '<span class="stock' + (inStock ? "" : " out-of-stock") + '">● ' + (inStock ? "In Stock" : "Out of Stock") + "</span>" +
      '<img loading="lazy" decoding="async" src="' + safeImage + '" alt="' + safeName + '">' +
      (safeCondition ? '<span class="product-condition">' + safeCondition + "</span>" : "") +
      "<h3>" + safeName + "</h3>" +
      '<p class="desc">' + safeDesc + "</p>" +
      '<p class="price">' + Number(product.price).toLocaleString() + " GMD</p>" +
      '<div class="product-qty" aria-label="Quantity">' +
        '<button type="button" class="qty-btn" onclick="xjChangeCardQty(this,-1)">−</button>' +
        '<input class="product-qty-input" type="number" min="1" max="99" value="1" aria-label="Quantity">' +
        '<button type="button" class="qty-btn" onclick="xjChangeCardQty(this,1)">+</button>' +
      "</div>" +
      '<div class="card-actions"><button type="button" onclick="' + action + '">' + (inStock ? "Add to Cart" : "Notify Me") + '</button>' +
      '<div class="product-menu-wrap"><button type="button" class="product-menu-toggle" aria-label="More options" onclick="xjToggleProductMenu(this,event)">⋮</button>' +
      '<div class="product-menu"><button type="button" onclick="xjOpenDescription(\'' + xjEscapeHtml(product.id) + '\')">View Description</button>' +
      (eligible ? '<button type="button" onclick="xjOpenReducePrice(\'' + xjEscapeHtml(product.id) + '\')">Reduce price</button>' : '') +
      '</div></div></div>' +
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
  var button = card.querySelector(".card-actions > button:first-child") || card.querySelector(":scope > button");
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

  var qty = card.querySelector(".product-qty");
  if (qty) qty.style.display = inStock ? "inline-flex" : "none";

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
      '<button type="button" class="admin-action-btn" onclick="xjSaveCategoryOrder()">Save category order</button>' +
      '<button type="button" class="admin-action-btn" onclick="xjSyncCanonicalProductPrices()">Sync PS4 prices</button>' +
    "</div>";
  var productIds = xjGetAllProductIds();
  var adminProductIds = xjGetAllProductIds(true);
  var homepageProductIds = productIds.filter(function(id) {
    var product = XJ_PRODUCT_CATALOG[id];
    return !!product && !xjIsProductHidden(id) && xjIsAllowedHomepageProduct(product);
  });
  var availableCount = productIds.filter(function(id) { return !!XJ_PRODUCT_CATALOG[id]; }).length;
  var inStockCount = productIds.filter(function(id) { return !!xjGetProductStock(id); }).length;
  html += '<div class="admin-dashboard-summary"><strong>Catalog stock overview:</strong> ' +
    availableCount + ' products · ' + inStockCount + ' in stock · ' + (availableCount - inStockCount) +
    ' out of stock.<p class="admin-help">Order and completed-sale metrics are not displayed here. WhatsApp checkout opens a draft only and is not counted as a sale.</p></div>';
  html += '<div class="admin-category-order"><label>Category priority (top to bottom)</label><div id="adminCategoryOrder">';
  xjCategoryOrder.forEach(function(category, index) {
    html += '<div class="admin-category-row">' +
      '<span style="flex:1">' + xjCategoryLabel(category) + '</span>' +
      '<button type="button" class="admin-action-btn" onclick="xjMoveCategory(' + index + ',-1)">Up</button>' +
      '<button type="button" class="admin-action-btn" onclick="xjMoveCategory(' + index + ',1)">Down</button></div>';
  });
  html += '</div><p class="admin-help">New products are grouped automatically by category. Use the featured-products selector below to choose the items displayed in the homepage featured section. Other catalog items remain available in Shop All Products.</p></div>';
  // Homepage featured-product selector.
  var selectedFeaturedCount = xjFeaturedProductIds.filter(function(id) {
    return homepageProductIds.indexOf(id) !== -1;
  }).length;

  html += '<section class="admin-featured-selection">' +
    '<div class="admin-featured-heading">' +
      '<div><h4>Homepage featured products</h4>' +
      '<p class="admin-help">Choose up to 12 eligible products to feature on the homepage. Your saved selection is stored in Firebase.</p></div>' +
      '<span class="admin-featured-count" id="featuredProductsCount">' + selectedFeaturedCount + ' / 12 selected</span>' +
    '</div>';

  if (homepageProductIds.length) {
    html += '<div class="admin-featured-list" id="adminFeaturedProductList">';
    homepageProductIds.forEach(function(id) {
      var product = XJ_PRODUCT_CATALOG[id];
      if (!product) return;
      var checked = xjFeaturedProductIds.indexOf(id) !== -1;
      var stockLabel = xjGetProductStock(id) ? "In stock" : "Out of stock";
      html += '<label class="admin-featured-option" for="admin-featured-' + xjEscapeHtml(id) + '">' +
        '<input type="checkbox" id="admin-featured-' + xjEscapeHtml(id) + '" class="admin-featured-checkbox" value="' + xjEscapeHtml(id) + '"' + (checked ? ' checked' : '') + ' onchange="xjUpdateFeaturedSelectionControls()">' +
        '<span class="admin-featured-option-copy"><strong>' + xjEscapeHtml(product.name) + '</strong>' +
        '<small>GMD ' + (Number(product.price) || 0).toLocaleString() + ' · ' + stockLabel + '</small></span>' +
        '<span class="admin-featured-checkmark" aria-hidden="true">✓</span>' +
      '</label>';
    });
    html += '</div>';
    html += '<div class="admin-featured-footer"><span class="admin-help">Select 1–12 products. Deselect a product to remove it from the featured selection.</span>' +
      '<button type="button" class="admin-action-btn admin-featured-save" id="saveFeaturedProducts" onclick="xjSaveFeaturedProducts()">Save featured products</button></div>';
  } else {
    html += '<p class="admin-featured-empty">No eligible homepage products are available yet. Add or restore products first.</p>';
  }

  html += '</section>';

  if (xjAdminFormOpen) {
    html +=
      '<form class="admin-add-form" onsubmit="xjAdminAddProduct(event)">' +
        '<label>Product name</label>' +
        '<input id="adminProductName" type="text" maxlength="80" placeholder="e.g. Xbox Series S" required>' +
        '<label>Price (GMD)</label>' +
        '<input id="adminProductPrice" type="number" min="1" max="999999" step="1" placeholder="e.g. 15000" required>' +
        '<label>Description</label>' +
        '<textarea id="adminProductDesc" rows="3" maxlength="280" placeholder="Short product description"></textarea>' +
        '<label>Condition (leave blank if not verified)</label>' +
        '<select id="adminProductCondition"><option value="">Not specified</option>' + xjConditionOptions("") + '</select>' +
        '<label>Image repository path or image URL</label>' +
        '<input id="adminProductImage" type="text" maxlength="200" placeholder="e.g. product-images/xbox-series-s.png" required>' +
        '<p class="admin-help">Add the image file to the website repository and publish it separately, then enter its exact relative path here. Browser uploads to GitHub are not supported.</p>' +
        '<label>Product type</label>' +
        '<select id="adminProductType">' +
          '<option value="controller">Controller</option>' +
          '<option value="accessory">Other accessory</option>' +
          '<option value="game">Game / game disc</option>' +
          '<option value="standalone">Other accessory (direct add to cart)</option>' +
          '<option value="ps4">PlayStation console (customize order)</option>' +
          '<option value="switch">Nintendo Switch (customize order)</option>' +
        "</select>" +
        '<label class="admin-toggle"><input id="adminProductInStock" type="checkbox" checked><span>In stock</span></label>' +
        '<button type="submit" class="checkout-btn" style="width:100%;margin-top:8px;border:none;">Create product</button>' +
      "</form>";
  }

  adminProductIds.forEach(function(productId) {
    var product = XJ_PRODUCT_CATALOG[productId];
    if (!product) return;
    var inStock = xjGetProductStock(productId);
    var hidden = xjIsProductHidden(productId);
    html +=
      '<div class="admin-inventory-row">' +
        '<div class="admin-inventory-info">' +
          "<strong>" + xjEscapeHtml(product.name) + "</strong>" +
          '<div class="admin-price-editor"><label>Price (GMD)<input id="adminPrice-' + xjEscapeHtml(productId) + '" type="number" min="1" max="999999" step="1" value="' + xjEscapeHtml(product.price) + '"></label>' +
          '<button type="button" class="admin-action-btn" onclick="xjAdminSaveProductPrice(\'' + productId + '\')">Save price</button></div>' +
          '<label class="admin-product-description">Description<textarea id="adminDescription-' + xjEscapeHtml(productId) + '" maxlength="2000" rows="3">' + xjEscapeHtml(product.description || "") + '</textarea></label>' +
          '<label class="admin-product-description">Condition<select id="adminCondition-' + xjEscapeHtml(productId) + '"><option value="">Not specified</option>' + xjConditionOptions(product.condition || "") + '</select></label>' +
          '<label class="admin-product-description">Photo repository paths or image URLs (comma-separated)<input id="adminImages-' + xjEscapeHtml(productId) + '" value="' + xjEscapeHtml((product.images || (product.image ? [product.image] : [])).join(", ")) + '" maxlength="2000"></label>' +
          '<label class="admin-product-description">Video repository paths or HTTPS URLs (comma-separated)<input id="adminVideos-' + xjEscapeHtml(productId) + '" value="' + xjEscapeHtml((product.videoUrls || []).join(", ")) + '" maxlength="2000"></label>' +
          '<p class="admin-help">Add media files to the website repository and publish them separately before saving their paths here. Browser uploads to GitHub are not supported. Large videos can significantly increase repository size and bandwidth, so local video hosting is optional.</p>' +
          '<button type="button" class="admin-action-btn" onclick="xjAdminSaveProductDetails(\'' + productId + '\')">Save product details</button>' +
          '<span class="admin-inventory-status ' + (hidden ? "out-stock-label" : inStock ? "in-stock-label" : "out-stock-label") + '">' +
            (hidden ? "HIDDEN FROM STORE" : inStock ? "IN STOCK" : "OUT OF STOCK") +
          "</span>" +
        "</div>" +
        '<div class="admin-row-actions">' +
          '<label class="admin-toggle">' +
            '<input type="checkbox" ' + (inStock ? "checked" : "") + ' onchange="xjAdminToggleStock(\'' + productId + "', this.checked)\">" +
            "<span>Available</span>" +
          "</label>" +
          (hidden
            ? '<button type="button" class="admin-action-btn" onclick="xjAdminRestoreProduct(\'' + productId + "')\">Restore product</button>"
            : '<button type="button" class="admin-remove-btn" onclick="xjAdminRemoveProduct(\'' + productId + "')\">Hide product</button>") +
        "</div>" +
      "</div>";
  });

  container.innerHTML = html;
  xjUpdateFeaturedSelectionControls();
}

function xjUpdateFeaturedSelectionControls() {
  var checkboxes = Array.prototype.slice.call(
    document.querySelectorAll("#adminFeaturedProductList .admin-featured-checkbox")
  );
  var selectedCount = checkboxes.filter(function(checkbox) {
    return checkbox.checked;
  }).length;

  checkboxes.forEach(function(checkbox) {
    checkbox.disabled = !checkbox.checked && selectedCount >= 12;
    var option = checkbox.closest ? checkbox.closest(".admin-featured-option") : null;
    if (option) option.classList.toggle("is-selected", checkbox.checked);
  });

  var countDisplay = document.getElementById("featuredProductsCount");
  if (countDisplay) countDisplay.textContent = selectedCount + " / 12 selected";

  var saveButton = document.getElementById("saveFeaturedProducts");
  if (!saveButton) return;

  saveButton.disabled = selectedCount < 1 || selectedCount > 12;
  saveButton.textContent = selectedCount > 0 && selectedCount <= 12
    ? "Save " + selectedCount + " featured product" + (selectedCount === 1 ? "" : "s")
    : "Select 1–12 products (" + selectedCount + "/12)";
}

window.xjUpdateFeaturedSelectionControls = xjUpdateFeaturedSelectionControls;

function xjConditionOptions(selected) {
  return ["New", "Fairly Used", "Used — Good Condition", "Refurbished", "Tested & Working"].map(function(condition) {
    return '<option value="' + xjEscapeHtml(condition) + '"' + (selected === condition ? " selected" : "") + ">" + xjEscapeHtml(condition) + "</option>";
  }).join("");
}

async function xjAdminSaveProductPrice(productId) {
  if (!xjIsAdmin() || !xjDb) {
    showToast("Price update", "Sign in as an administrator before saving prices.", "error");
    return;
  }
  var product = XJ_PRODUCT_CATALOG[productId];
  var input = document.getElementById("adminPrice-" + productId);
  if (!product || !input) return;
  var price = Number(input.value);
  if (!Number.isSafeInteger(price) || price < 1 || price > 999999) {
    showToast("Invalid price", "Enter a whole-number price between GMD 1 and GMD 999,999.", "error");
    return;
  }

  try {
    await xjDb.collection("products").doc(productId).set({
      price: price,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    product.price = price;
    xjRefreshProductCard(product);
    if (window.xjRefreshProductPrices) window.xjRefreshProductPrices();
    if (window.xjRepriceCartFromCatalog) window.xjRepriceCartFromCatalog(productId);
    if (window.xjRefreshRecommendations) window.xjRefreshRecommendations();
    showToast("Price updated", product.name + " is now GMD " + price.toLocaleString() + ".");
  } catch (error) {
    console.error("Failed to update product price:", error);
    showToast("Price not saved", "Could not save this price to Firebase. Please try again.", "error");
  }
}
window.xjAdminSaveProductPrice = xjAdminSaveProductPrice;

async function xjAdminSaveProductDetails(productId) {
  if (!xjIsAdmin() || !xjDb) return;
  var product = XJ_PRODUCT_CATALOG[productId];
  var input = document.getElementById("adminDescription-" + productId);
  var conditionInput = document.getElementById("adminCondition-" + productId);
  var imagesInput = document.getElementById("adminImages-" + productId);
  var videosInput = document.getElementById("adminVideos-" + productId);
  if (!product || !input || !conditionInput || !imagesInput || !videosInput) return;
  var description = input.value.trim();
  var images = imagesInput.value.split(",").map(function(value) { return value.trim(); }).filter(Boolean);
  var videoUrls = videosInput.value.split(",").map(function(value) { return value.trim(); }).filter(Boolean);
  if (images.some(function(value) { return !xjSanitizeImageReference(value); })) {
    showToast("Product media", "Use image URLs or safe repository-relative image paths such as product-images/console.png.", "error");
    return;
  }
  if (videoUrls.some(function(value) { return !xjSanitizeVideoReference(value); })) {
    showToast("Product media", "Use HTTPS video URLs or safe repository-relative MP4/WebM paths.", "error");
    return;
  }
  if (description.length > 2000) {
    showToast("Description", "Descriptions must be 2,000 characters or fewer.", "error");
    return;
  }
  try {
    await xjDb.collection("products").doc(productId).set({
      description: description,
      condition: conditionInput.value,
      images: images,
      image: images[0] || "",
      videoUrls: videoUrls,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    product.description = description;
    product.condition = conditionInput.value;
    product.images = images;
    product.videoUrls = videoUrls;
    product.image = images[0] || "";
    xjRefreshProductCard(product);
    showToast("Product details saved", product.name + " was updated.");
  } catch (error) {
    console.error("Failed to update product description:", error);
    showToast("Description not saved", "Could not save this description to Firebase.", "error");
  }
}
window.xjAdminSaveProductDetails = xjAdminSaveProductDetails;

async function xjSaveFeaturedProducts() {
  if (!xjIsAdmin() || !xjDb) {
    showToast("Homepage selection", "Sign in as an administrator before saving.", "error");
    return;
  }

  var selected = Array.prototype.slice.call(
    document.querySelectorAll("#adminFeaturedProductList .admin-featured-checkbox:checked")
  ).map(function(input) {
    return input.value;
  });

  if (selected.length < 1 || selected.length > 12) {
    showToast("Select homepage products", "Choose between 1 and 12 products before saving.", "error");
    return;
  }

  var seen = {};
  var invalidSelection = selected.some(function(id) {
    var product = XJ_PRODUCT_CATALOG[id];
    if (seen[id]) return true;
    seen[id] = true;
    return !product || xjIsProductHidden(id) || !xjIsAllowedHomepageProduct(product);
  });

  if (invalidSelection) {
    showToast("Homepage selection", "A selected product is no longer eligible. Refresh the list and try again.", "error");
    return;
  }

  var saveButton = document.getElementById("saveFeaturedProducts");
  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";
  }

  try {
    await xjDb.collection("config").doc("featuredProducts").set({
      productIds: selected,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    xjFeaturedProductIds = selected.slice();
    if (typeof xjShowAllProductCards === "function") xjShowAllProductCards();
    showToast("Homepage updated", selected.length + " products are now selected for the homepage.");
  } catch (error) {
    console.error("Failed to save featured products:", error);
    showToast("Homepage selection", "Could not save the featured products to Firebase. Please try again.", "error");
  } finally {
    xjUpdateFeaturedSelectionControls();
  }
}
window.xjSaveFeaturedProducts = xjSaveFeaturedProducts;

async function xjSyncCanonicalProductPrices() {
  if (!xjIsAdmin() || !firebase.functions) return showToast("Price update", "Admin backend is not available.", "error");
  try {
    var result = await firebase.functions().httpsCallable("syncProductPrices")();
    showToast("Prices updated", result.data.updated.length ? "PS4 Slim and PS4 Fat prices were saved." : "The PS4 price update was already applied.");
  } catch (error) {
    console.error("Failed to sync canonical product prices:", error);
    showToast("Price update failed", "Could not update PS4 prices in Firebase.", "error");
  }
}

window.xjSyncCanonicalProductPrices = xjSyncCanonicalProductPrices;

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
  if (window.xjRefreshRecommendations) window.xjRefreshRecommendations();
}

async function xjAdminAddProduct(event) {
  event.preventDefault();
  if (!xjIsAdmin()) return;

  var name = document.getElementById("adminProductName").value.trim();
  var price = parseInt(document.getElementById("adminProductPrice").value, 10);
  var description = document.getElementById("adminProductDesc").value.trim();
  var condition = document.getElementById("adminProductCondition").value;
  var image = xjSanitizeImageReference(document.getElementById("adminProductImage").value);
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
    showToast("Error", "Use an image URL or a safe repository-relative image path such as product-images/product.png.", "error");
    return;
  }

  var productId = "custom-" + xjSlugifyProductName(name);
  if (XJ_PRODUCT_CATALOG[productId] && !xjIsProductHidden(productId)) {
    productId += "-" + Date.now().toString().slice(-4);
  }

  var displayCategory = type === "switch"
    ? "nintendo-consoles"
    : type === "ps4"
      ? "playstation-consoles"
      : type === "controller"
        ? "controllers"
        : type === "game"
          ? "games"
          : "accessories";
  var categories = type === "switch"
    ? ["nintendo", "consoles", "switch"]
    : type === "ps4"
      ? ["playstation", "consoles"]
      : type === "controller"
        ? ["controllers", "accessories"]
        : type === "game"
          ? ["games"]
          : ["accessories"];

  var product = {
    id: productId,
    name: name,
    slug: name.toLowerCase(),
    category: type === "game" ? "games" : (type === "standalone" || type === "controller" || type === "accessory" ? "accessories" : "consoles"),
    displayCategory: displayCategory,
    categories: categories,
    price: price,
    inStock: inStock,
    type: type,
    extraControllerPrice: type === "ps4" ? 1500 : 0,
    hasModal: type === "ps4" || type === "switch",
    image: image,
    description: description,
    condition: condition,
    aliases: [name.toLowerCase()],
    createdAt: Date.now(),
    isCustom: true,
    showOnHomepage: true
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
        displayCategory: displayCategory,
        categories: categories,
        price: price,
        inStock: inStock,
        type: type,
        extraControllerPrice: product.extraControllerPrice,
        image: image,
        description: description,
        condition: condition,
        images: [image],
        videoUrls: [],
        aliases: product.aliases,
        createdAt: product.createdAt,
        isCustom: true,
        showOnHomepage: true,
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
  if (typeof xjShowAllProductCards === "function") xjShowAllProductCards();
  if (window.xjRefreshRecommendations) window.xjRefreshRecommendations();
  if (window.xjRefreshCommerceProducts) window.xjRefreshCommerceProducts();
  showToast("Product added", name + " is now live on the website. Make sure " + image + " exists in the published website repository.");
}

function xjCategoryLabel(category) {
  return {
    "playstation-consoles": "PlayStation Consoles",
    "nintendo-consoles": "Nintendo Switch Consoles",
    controllers: "Controllers",
    accessories: "Other Accessories",
    games: "Games / Game Discs"
  }[category] || category;
}

function xjMoveCategory(index, direction) {
  var next = index + direction;
  if (next < 0 || next >= xjCategoryOrder.length) return;
  var order = xjCategoryOrder.slice();
  var moved = order.splice(index, 1)[0];
  order.splice(next, 0, moved);
  xjSetCategoryOrder(order);
  xjRenderAdminInventoryPanel();
}

async function xjSaveCategoryOrder() {
  if (!xjIsAdmin() || !xjDb) return;
  try {
    await xjDb.collection("config").doc("categoryOrder").set({
      order: xjCategoryOrder,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    xjShowAllProductCards();
    showToast("Category order saved", "The storefront priority has been updated.");
  } catch (error) {
    console.error("Failed to save category order:", error);
    showToast("Error", "Could not save the category order.", "error");
  }
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
  if (window.xjRefreshRecommendations) window.xjRefreshRecommendations();
  showToast("Product removed", label + " has been removed from the store.");
}

async function xjAdminRestoreProduct(productId) {
  if (!xjIsAdmin() || !xjDb) return;
  var product = XJ_PRODUCT_CATALOG[productId];
  if (!product) return;
  try {
    await xjDb.collection("products").doc(productId).set({
      hidden: false,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    xjUnhideProduct(productId);
    if (!document.querySelector('#productGrid .card[data-product-id="' + productId + '"]')) xjInsertProductCard(product);
    xjShowAllProductCards();
    xjRenderAdminInventoryPanel();
    if (window.xjRefreshRecommendations) window.xjRefreshRecommendations();
    showToast("Product restored", product.name + " is visible in the catalog.");
  } catch (error) {
    console.error("Failed to restore product:", error);
    showToast("Product restore", "Could not restore this product in Firebase.", "error");
  }
}

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
    xjFeaturedProductIds = xjFeaturedProductIds.filter(function(id) {
      var product = XJ_PRODUCT_CATALOG[id];

      return !!product
        && !xjIsProductHidden(id)
        && xjIsAllowedHomepageProduct(product);
    });
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
    if (data.stockQuantity === null) {
      existingProduct.stockQuantity = null;
    } else if (data.stockQuantity !== undefined
        && Number.isSafeInteger(Number(data.stockQuantity))
        && Number(data.stockQuantity) >= 0) {
      existingProduct.stockQuantity = Number(data.stockQuantity);
    }
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
    stockQuantity: data.stockQuantity !== null
      && data.stockQuantity !== undefined
      && Number.isSafeInteger(Number(data.stockQuantity))
      && Number(data.stockQuantity) >= 0
      ? Number(data.stockQuantity)
      : null,
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

  return !!product
    && !xjIsProductHidden(id)
    && xjIsAllowedHomepageProduct(product);
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
  html += '</div><p class="admin-help">New products are placed automatically using this category. PlayStation, Nintendo, and controller products appear on the homepage. Everything else stays in Shop All Products until you add it as a new live product.</p></div>';
 var selectedFeaturedCount = homepageProductIds.filter(function(id) {
  return Array.isArray(xjFeaturedProductIds)
    && xjFeaturedProductIds.indexOf(id) !== -1;
}).length;

html +=
  '<section class="admin-featured-selection">' +
    '<h4>Homepage Featured Products</h4>' +
    '<p class="admin-help">Choose between 1 and 12 products to feature on your homepage. Select the products you want customers to see first.</p>' +
    '<div id="featuredProductsCount" class="admin-help">' +
      selectedFeaturedCount + ' / 12 selected' +
    '</div>' +
    '<div class="admin-featured-list">';

homepageProductIds.forEach(function(id) {
  var product = XJ_PRODUCT_CATALOG[id];
  if (!product) return;

  var selected = Array.isArray(xjFeaturedProductIds)
    && xjFeaturedProductIds.indexOf(id) !== -1;

  html +=
    '<label class="admin-featured-option">' +
      '<input type="checkbox" class="admin-featured-checkbox" value="' +
        xjEscapeHtml(id) + '"' +
        (selected ? ' checked' : '') +
        ' onchange="xjUpdateFeaturedSelectionControls()">' +
      '<span>' + xjEscapeHtml(product.name) + '</span>' +
    '</label>';
});

html +=
    '</div>' +
    '<button type="button" id="saveFeaturedProducts" class="admin-action-btn" onclick="xjSaveFeaturedProducts()">' +
      'Save featured products' +
    '</button>' +
  '</section>';

  if (xjAdminFormOpen) {
    html +=
      '<form class="admin-add-form" onsubmit="xjAdminAddProduct(event)">' +
        '<label>Product name</label>' +
        '<input id="adminProductName" type="text" maxlength="80" placeholder="e.g. Xbox Series S" required>' +
        '<label>Price (GMD)</label>' +
        '<input id="adminProductPrice" type="number" min="1" max="999999" step="1" placeholder="e.g. 15000" required>' +
        '<label>Description</label>' +
        '<textarea id="adminProductDesc" rows="3" maxlength="280" placeholder="Short product description" required></textarea>' +
        '<label>Category</label>' +
        '<select id="adminProductCategory" required>' +
          '<option value="">Select category</option>' +
          '<option value="playstation-consoles">PlayStation Consoles</option>' +
          '<option value="nintendo-consoles">Nintendo Consoles</option>' +
          '<option value="controllers">Controllers</option>' +
          '<option value="games">Games / Game Discs</option>' +
          '<option value="accessories">Other Accessories</option>' +
        '</select>' +
        '<label>Condition</label>' +
        '<select id="adminProductCondition"><option value="">Not specified</option>' + xjConditionOptions("") + '</select>' +
        '<label>Stock quantity</label>' +
        '<input id="adminProductQuantity" type="number" min="0" max="999999" step="1" value="1" required>' +
        '<label>Image filename</label>' +
        '<input id="adminProductImage" type="text" maxlength="200" placeholder="e.g. last.png" required>' +
        '<p class="admin-help">Enter the exact image filename from the website root. Existing images are stored beside index.html; this field does not upload files.</p>' +
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
          '<label class="admin-product-description">Stock quantity (optional)<input id="adminQuantity-' + xjEscapeHtml(productId) + '" type="number" min="0" max="999999" step="1" value="' + xjEscapeHtml(product.stockQuantity == null ? "" : product.stockQuantity) + '"></label>' +
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
    document.querySelectorAll(".admin-featured-checkbox")
  );

  var selectedCount = checkboxes.filter(function(checkbox) {
    return checkbox.checked;
  }).length;

  // Prevent selecting more than 12 products.
  checkboxes.forEach(function(checkbox) {
    checkbox.disabled = !checkbox.checked && selectedCount >= 12;
  });

  var saveButton = document.getElementById("saveFeaturedProducts");
  var countDisplay = document.getElementById("featuredProductsCount");

  if (countDisplay) {
    countDisplay.textContent = selectedCount + " / 12 selected";
  }

  if (!saveButton) return;

  saveButton.disabled = selectedCount < 1 || selectedCount > 12;

  if (selectedCount >= 1 && selectedCount <= 12) {
    saveButton.textContent =
      "Save " + selectedCount + " featured product" +
      (selectedCount === 1 ? "" : "s");
  } else {
    saveButton.textContent =
      "Select 1–12 products (" + selectedCount + "/12)";
  }
}
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
  var quantityInput = document.getElementById("adminQuantity-" + productId);
  var imagesInput = document.getElementById("adminImages-" + productId);
  var videosInput = document.getElementById("adminVideos-" + productId);
  if (!product || !input || !conditionInput || !quantityInput || !imagesInput || !videosInput) return;
  var description = input.value.trim();
  var rawStockQuantity = quantityInput.value.trim();
  var stockQuantity = rawStockQuantity ? Number(rawStockQuantity) : null;
  var rawImages = imagesInput.value.split(",").map(function(value) { return value.trim(); }).filter(Boolean);
  var images = [];
  var videoUrls = videosInput.value.split(",").map(function(value) { return value.trim(); }).filter(Boolean);
  if (rawImages.some(function(value) { return !xjSanitizeImageReference(value); })) {
    showToast("Product media", "Enter image filenames or safe repository-relative image paths.", "error");
    return;
  }
  try {
    images = await Promise.all(rawImages.map(function(value) {
      return xjVerifyProductImage(value);
    }));
  } catch (error) {
    showToast("Image not found", error.message, "error");
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
  if (stockQuantity !== null
      && (!Number.isSafeInteger(stockQuantity) || stockQuantity < 0 || stockQuantity > 999999)) {
    showToast("Stock quantity", "Enter a whole-number stock quantity between 0 and 999,999.", "error");
    return;
  }
  try {
    await xjDb.collection("products").doc(productId).set({
      description: description,
      condition: conditionInput.value,
      stockQuantity: stockQuantity,
      images: images,
      image: images[0] || "",
      videoUrls: videoUrls,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    product.description = description;
    product.condition = conditionInput.value;
    product.stockQuantity = stockQuantity;
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
    showToast(
      "Homepage selection",
      "Sign in as an administrator before saving.",
      "error"
    );
    return;
  }

  var selected = Array.prototype.slice.call(
    document.querySelectorAll(".admin-featured-checkbox:checked")
  ).map(function(input) {
    return input.value;
  });

  if (selected.length < 1 || selected.length > 12) {
    showToast(
      "Select homepage products",
      "Choose between 1 and 12 products before saving.",
      "error"
    );
    return;
  }

  if (selected.some(function(id) {
    return !XJ_PRODUCT_CATALOG[id]
      || xjIsProductHidden(id)
      || !xjIsAllowedHomepageProduct(XJ_PRODUCT_CATALOG[id]);
  })) {
    showToast(
      "Homepage selection",
      "A selected product is no longer available. Refresh the list and try again.",
      "error"
    );
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

    xjFeaturedProductIds = selected;

    if (typeof xjShowAllProductCards === "function") {
      xjShowAllProductCards();
    }

    showToast(
      "Homepage updated",
      selected.length + " products are now featured."
    );
  } catch (error) {
    console.error("Failed to save featured products:", error);

    showToast(
      "Homepage selection",
      "Could not save the featured products. Please try again.",
      "error"
    );
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
  if (!xjIsAdmin() || !xjDb || !window.firebase || !firebase.firestore) {
    showToast("Product not saved", "Sign in as an administrator and wait for Firebase to connect before adding products.", "error");
    return;
  }

  var name = document.getElementById("adminProductName").value.trim();
  var price = Number(document.getElementById("adminProductPrice").value);
  var description = document.getElementById("adminProductDesc").value.trim();
  var selectedCategory = document.getElementById("adminProductCategory").value;
  var condition = document.getElementById("adminProductCondition").value;
  var image = xjSanitizeImageReference(document.getElementById("adminProductImage").value.trim());
  var stockQuantity = Number(document.getElementById("adminProductQuantity").value);
  var type = document.getElementById("adminProductType").value;
  var inStock = document.getElementById("adminProductInStock").checked;

  if (!name || name.length < 2) {
    showToast("Error", "Please enter a valid product name.", "error");
    return;
  }
  if (!description) {
    showToast("Error", "Please enter a product description.", "error");
    return;
  }
  if (!Number.isSafeInteger(price) || price < 1 || price > 999999) {
    showToast("Error", "Please enter a valid price.", "error");
    return;
  }
  if (!selectedCategory) {
    showToast("Error", "Please select a product category.", "error");
    return;
  }
  if (!Number.isSafeInteger(stockQuantity) || stockQuantity < 0 || stockQuantity > 999999) {
    showToast("Error", "Enter a whole-number stock quantity between 0 and 999,999.", "error");
    return;
  }
  if (inStock && stockQuantity === 0) {
    showToast("Error", "Set the stock quantity above zero or mark this product out of stock.", "error");
    return;
  }
  if (!image) {
    showToast("Error", "Enter an image filename or safe relative path ending in .png, .jpg, .webp, .gif, or .svg.", "error");
    return;
  }
  try {
    image = await xjVerifyProductImage(image);
  } catch (error) {
    console.error("Product image validation failed:", error);
    showToast("Image not found", error.message, "error");
    return;
  }

  var baseProductId = "custom-" + xjSlugifyProductName(name);
  var productId = baseProductId;
  var productRef = xjDb.collection("products").doc(productId);
  try {
    var existingProduct = await productRef.get();
    if (XJ_PRODUCT_CATALOG[productId] || existingProduct.exists) {
      productId = baseProductId + "-" + Date.now().toString(36);
      productRef = xjDb.collection("products").doc(productId);
      existingProduct = await productRef.get();
      if (existingProduct.exists || XJ_PRODUCT_CATALOG[productId]) {
        productId += "-" + Math.random().toString(36).slice(2, 6);
        productRef = xjDb.collection("products").doc(productId);
      }
    }
  } catch (error) {
    console.error("Failed to check for duplicate product:", error);
    showToast("Product not saved", "Could not verify the product name is available. Please try again.", "error");
    return;
  }

  var categoryDetails = {
    "playstation-consoles": { category: "consoles", categories: ["playstation", "consoles"] },
    "nintendo-consoles": { category: "consoles", categories: ["nintendo", "consoles", "switch"] },
    controllers: { category: "accessories", categories: ["controllers", "accessories"] },
    games: { category: "games", categories: ["games"] },
    accessories: { category: "accessories", categories: ["accessories"] }
  }[selectedCategory];
  if (!categoryDetails) {
    showToast("Error", "Please select a valid product category.", "error");
    return;
  }
  var displayCategory = selectedCategory;
  var categories = categoryDetails.categories;

  var product = {
    id: productId,
    name: name,
    slug: name.toLowerCase(),
    category: categoryDetails.category,
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
    stockQuantity: stockQuantity,
    aliases: [name.toLowerCase()],
    createdAt: Date.now(),
    isCustom: true,
    showOnHomepage: true
  };

  try {
    await productRef.set({
      id: productId,
      name: name,
      slug: product.slug,
      category: product.category,
      displayCategory: displayCategory,
      categories: categories,
      price: price,
      inStock: inStock,
      stockQuantity: stockQuantity,
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
    showToast("Product not saved", "Could not save this product to Firebase. Check your connection and administrator permissions, then try again.", "error");
    return;
  }

  xjRegisterProduct(product);
  xjSetProductStock(productId, inStock);
  xjInsertProductCard(product);
  xjAdminFormOpen = false;
  xjRenderAdminInventoryPanel();
  if (typeof xjShowAllProductCards === "function") xjShowAllProductCards();
  if (window.xjRefreshRecommendations) window.xjRefreshRecommendations();
  if (window.xjRefreshCommerceProducts) window.xjRefreshCommerceProducts();
  showToast("Product added", name + " is now live on the website.");
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

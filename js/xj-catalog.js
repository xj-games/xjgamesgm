/**
 * XJ Games — Single source of truth for product metadata, inventory defaults, and search aliases.
 * Add new products or aliases here; the UI reads from this catalog.
 */
const XJ_DEFAULT_CATEGORY_ORDER = [
  "playstation-consoles",
  "nintendo-consoles",
  "controllers",
  "accessories",
  "games"
];
var xjCategoryOrder = XJ_DEFAULT_CATEGORY_ORDER.slice();

const XJ_PRODUCT_CATALOG = {
  "ps4-slim": {
    id: "ps4-slim",
    name: "PlayStation 4 Slim",
    slug: "playstation 4 slim",
    category: "consoles",
    displayCategory: "playstation-consoles",
    categories: ["ps4", "consoles", "playstation"],
    price: 9500,
    inStock: false,
    type: "ps4",
    extraControllerPrice: 1500,
    hasModal: true,
    images: ["ps4-slim-1.PNG", "ps4-slim-2.png", "ps4-slim-3.png"],
    carouselAlt: "PS4 Slim",
    description: "Experience sleek, compact gaming power with HDR visuals and an expansive library of incredible blockbuster titles.",
    aliases: [
      "ps4", "ps 4", "playstation 4", "playstation 4 slim", "play station 4",
      "sony ps4", "ps", "ps4 slim", "playstation", "sony playstation 4"
    ]
  },
  "ps4-fat": {
    id: "ps4-fat",
    name: "PlayStation 4 Fat",
    slug: "playstation 4 fat",
    category: "consoles",
    displayCategory: "playstation-consoles",
    categories: ["ps4", "consoles", "playstation"],
    price: 9000,
    inStock: true,
    type: "ps4",
    extraControllerPrice: 1500,
    hasModal: true,
    images: ["ps4-fat-1.png", "ps4-fat-2.png", "ps4-fat-3.png", "ps4-fat-4.png"],
    carouselAlt: "PS4 Fat",
    description: "The original powerhouse that started a generation. Robust, extremely reliable, and ready for all your favorite games.",
    aliases: [
      "ps4", "ps 4", "playstation 4", "playstation 4 fat", "play station 4",
      "sony ps4", "ps", "ps4 fat", "playstation", "sony playstation 4"
    ]
  },
  "ps5": {
    id: "ps5",
    name: "PlayStation 5",
    slug: "playstation 5",
    category: "consoles",
    displayCategory: "playstation-consoles",
    categories: ["ps5", "consoles", "playstation"],
    price: 35000,
    inStock: true,
    type: "ps4",
    extraControllerPrice: 4000,
    hasModal: true,
    image: "ps5.png",
    description: "Next-generation 4K gaming with ultra-fast loading, stunning graphics, and DualSense immersive gameplay.",
    aliases: [
      "ps5", "ps 5", "playstation 5", "play station 5", "sony ps5",
      "ps5 console", "playstation", "sony playstation 5"
    ]
  },
  "ps3": {
    id: "ps3",
    name: "PlayStation 3",
    slug: "playstation 3",
    category: "consoles",
    displayCategory: "playstation-consoles",
    categories: ["ps3", "consoles", "playstation"],
    price: 6000,
    inStock: false,
    type: "ps4",
    extraControllerPrice: 1500,
    hasModal: true,
    image: "ps3.png",
    aliases: [
      "ps3", "ps 3", "playstation 3", "play station 3", "sony ps3",
      "ps3 console", "playstation", "sony playstation 3"
    ]
  },
  "ps2": {
    id: "ps2",
    name: "PlayStation 2",
    slug: "playstation 2",
    category: "consoles",
    displayCategory: "playstation-consoles",
    categories: ["ps2", "consoles", "playstation"],
    price: 3000,
    inStock: true,
    type: "ps4",
    extraControllerPrice: 1000,
    hasModal: true,
    image: "ps2.png",
    description: "The legendary PlayStation 2 — the best-selling console of all time, ready for retro classics and family favorites.",
    aliases: [
      "ps2", "ps 2", "playstation 2", "play station 2", "sony ps2",
      "ps2 console", "playstation", "sony playstation 2"
    ]
  },
  "nintendo-switch": {
    id: "nintendo-switch",
    name: "Nintendo Switch",
    slug: "nintendo switch",
    category: "consoles",
    displayCategory: "nintendo-consoles",
    categories: ["nintendo", "consoles", "switch"],
    price: 8000,
    inStock: false,
    type: "switch",
    hasModal: true,
    image: "nintendo-switch.png",
    description: "Play at home on the TV or on the go. The ultimate hybrid console designed for versatile, family-friendly fun anywhere.",
    aliases: [
      "nintendo switch", "nintendo", "switch", "switch console", "nintendo console"
    ]
  },
  "nintendo-switch-lite": {
    id: "nintendo-switch-lite",
    name: "Nintendo Switch Lite",
    slug: "nintendo switch lite",
    category: "consoles",
    displayCategory: "nintendo-consoles",
    categories: ["nintendo", "consoles", "switch", "switch-lite"],
    price: 7000,
    inStock: false,
    type: "standalone",
    hasModal: false,
    image: "nintendo-switch-lite.png",
    description: "Dedicated specifically to handheld play. Lightweight, compact, and perfect for gaming comfortably wherever you are.",
    aliases: [
      "nintendo switch lite", "switch lite", "nintendo lite", "switch lite console"
    ]
  },
  "ps4-controller": {
    id: "ps4-controller",
    name: "PS4 Controller",
    slug: "ps4 controller",
    category: "accessories",
    displayCategory: "controllers",
    categories: ["controllers", "ps4", "accessories"],
    price: 1500,
    inStock: true,
    type: "standalone",
    hasModal: false,
    image: "Ps4-controller.png",
    description: "Original DualShock 4 wireless controller featuring enhanced ergonomic grips, precision analog sticks, and integrated light bar.",
    aliases: [
      "controller", "controllers", "ps controller", "playstation controller",
      "ps4 controller", "gamepad", "dualshock", "ps4 gamepad"
    ]
  },
  "ps5-controller": {
    id: "ps5-controller",
    name: "PS5 Controller",
    slug: "ps5 controller",
    category: "accessories",
    displayCategory: "controllers",
    categories: ["controllers", "ps5", "accessories"],
    price: 4000,
    inStock: true,
    type: "standalone",
    hasModal: false,
    image: "ps5-controller.png",
    description: "Next-gen DualSense wireless controller with adaptive triggers, haptic feedback, and a built-in microphone for immersive PlayStation 5 gaming.",
    aliases: [
      "controller", "controllers", "ps controller", "playstation controller",
      "ps5 controller", "gamepad", "dualsense", "ps5 gamepad"
    ]
  }
};

/** Live inventory overrides from Firestore (productId → boolean) */
const xjInventoryState = {};
const xjHiddenProducts = {};

function xjEscapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function xjGetProductStock(productId) {
  if (Object.prototype.hasOwnProperty.call(xjInventoryState, productId)) {
    return xjInventoryState[productId];
  }
  const product = XJ_PRODUCT_CATALOG[productId];
  return product ? product.inStock : false;
}

function xjSetProductStock(productId, inStock) {
  xjInventoryState[productId] = inStock;
  if (XJ_PRODUCT_CATALOG[productId]) {
    XJ_PRODUCT_CATALOG[productId].inStock = !!inStock;
  }
}

function xjSetProductPrice(productId, price) {
  var normalizedPrice = Number(price);
  if (!Number.isFinite(normalizedPrice) || normalizedPrice < 0) return;
  if (XJ_PRODUCT_CATALOG[productId]) {
    XJ_PRODUCT_CATALOG[productId].price = normalizedPrice;
  }
}

function xjGetProductById(productId) {
  return XJ_PRODUCT_CATALOG[productId] || null;
}

function xjIsProductHidden(productId) {
  return !!xjHiddenProducts[productId];
}

function xjHideProduct(productId) {
  xjHiddenProducts[productId] = true;
}

function xjUnhideProduct(productId) {
  delete xjHiddenProducts[productId];
}

function xjRegisterProduct(product) {
  if (!product || !product.id) return;
  XJ_PRODUCT_CATALOG[product.id] = product;
  xjUnhideProduct(product.id);
}

function xjSetCategoryOrder(order) {
  if (!Array.isArray(order)) return;
  var normalized = order.filter(function(category, index) {
    return typeof category === "string" && order.indexOf(category) === index;
  });
  XJ_DEFAULT_CATEGORY_ORDER.forEach(function(category) {
    if (normalized.indexOf(category) === -1) normalized.push(category);
  });
  xjCategoryOrder = normalized;
}

function xjGetProductDisplayCategory(product) {
  if (!product) return "accessories";
  if (product.displayCategory && xjCategoryOrder.indexOf(product.displayCategory) !== -1) {
    return product.displayCategory;
  }
  var categories = product.categories || [];
  if (categories.indexOf("controllers") !== -1) return "controllers";
  if (categories.indexOf("playstation") !== -1 && categories.indexOf("consoles") !== -1) {
    return "playstation-consoles";
  }
  if ((categories.indexOf("nintendo") !== -1 || categories.indexOf("switch") !== -1) && categories.indexOf("consoles") !== -1) {
    return "nintendo-consoles";
  }
  if (product.category === "games" || categories.indexOf("games") !== -1) return "games";
  return "accessories";
}

function xjGetProductPriority(product) {
  var category = xjGetProductDisplayCategory(product);
  var index = xjCategoryOrder.indexOf(category);
  return index === -1 ? xjCategoryOrder.length : index;
}

function xjGetPrioritySortedProductIds(ids) {
  return (ids || []).map(function(id, index) {
    return { id: id, index: index, product: XJ_PRODUCT_CATALOG[id] };
  }).sort(function(a, b) {
    var priority = xjGetProductPriority(a.product) - xjGetProductPriority(b.product);
    if (priority !== 0) return priority;
    var aCreated = Number(a.product && a.product.createdAt) || 0;
    var bCreated = Number(b.product && b.product.createdAt) || 0;
    if (aCreated !== bCreated) return bCreated - aCreated;
    return a.index - b.index;
  }).map(function(entry) {
    return entry.id;
  });
}

function xjGetAllProductIds() {
  return Object.keys(XJ_PRODUCT_CATALOG).filter(function(id) {
    return !xjIsProductHidden(id);
  });
}

function xjSlugifyProductName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "product";
}

function xjSanitizeImageFileName(name) {
  var base = String(name || "").trim().replace(/\\/g, "/").split("/").pop();
  if (!base || !/^[A-Za-z0-9._-]+\.(png|jpe?g|webp|gif|svg)$/i.test(base)) {
    return "";
  }
  return base;
}

/**
 * XJ Games — Single source of truth for product metadata, inventory defaults, and search aliases.
 * Add new products or aliases here; the UI reads from this catalog.
 */
const XJ_PRODUCT_CATALOG = {
  "ps4-slim": {
    id: "ps4-slim",
    name: "PlayStation 4 Slim",
    slug: "playstation 4 slim",
    category: "consoles",
    categories: ["ps4", "consoles", "playstation"],
    price: 9000,
    inStock: false,
    type: "ps4",
    extraControllerPrice: 1500,
    hasModal: true,
    images: ["ps4-slim-1.png", "ps4-slim-2.png", "ps4-slim-3.png"],
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
    categories: ["ps4", "consoles", "playstation"],
    price: 8500,
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

function xjGetProductStock(productId) {
  if (Object.prototype.hasOwnProperty.call(xjInventoryState, productId)) {
    return xjInventoryState[productId];
  }
  const product = XJ_PRODUCT_CATALOG[productId];
  return product ? product.inStock : false;
}

function xjSetProductStock(productId, inStock) {
  xjInventoryState[productId] = inStock;
}

function xjGetProductById(productId) {
  return XJ_PRODUCT_CATALOG[productId] || null;
}

function xjGetAllProductIds() {
  return Object.keys(XJ_PRODUCT_CATALOG);
}

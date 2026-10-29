var xjWishlistIds = {};

function xjInjectProductTools() {
  document.querySelectorAll("#productGrid .card[data-product-id]").forEach(function(card) {
    var productId = card.getAttribute("data-product-id");
    var menu = card.querySelector(".product-menu");
    if (!menu || menu.querySelector(".xj-product-tools")) return;
    var tools = document.createElement("div");
    tools.className = "xj-product-tools";
    tools.innerHTML =
      '<button type="button" onclick="xjToggleWishlist(\'' + xjEscapeHtml(productId) + '\')">Save to wishlist</button>';
    menu.appendChild(tools);
  });
}

function xjInitCustomerTools() {
  xjInjectProductTools();
  var grid = document.getElementById("productGrid");
  if (grid) {
    new MutationObserver(xjInjectProductTools).observe(grid, { childList: true, subtree: true });
  }
  if (window.firebase && firebase.auth) {
    firebase.auth().onAuthStateChanged(function(user) {
      xjWishlistIds = {};
      if (!user || !xjDb) return;
      xjDb.collection("users").doc(user.uid).collection("wishlist").get().then(function(snapshot) {
        snapshot.forEach(function(doc) { xjWishlistIds[doc.id] = true; });
        xjUpdateWishlistButtons();
      }).catch(function(error) {
        console.error("Could not load wishlist:", error);
        showToast("Wishlist", "Could not load your saved products.", "error");
      });
    });
  }
}

function xjAddWishlistProductToCart(productId) {
  var product = xjGetProductById(productId);
  if (!product) return;
  if (product.hasModal) openCustomizationModal(product.name, product.price, product.type);
  else directAddToCart(product.name, product.price);
}

function xjUpdateWishlistButtons() {
  document.querySelectorAll("#productGrid .card[data-product-id]").forEach(function(card) {
    var button = card.querySelector(".xj-product-tools button");
    if (button) button.textContent = xjWishlistIds[card.getAttribute("data-product-id")] ? "Remove from wishlist" : "Save to wishlist";
  });
}

async function xjToggleWishlist(productId) {
  var user = firebase.auth().currentUser;
  if (!user) {
    xjRequireAuth("Sign in to save products to your wishlist.");
    return;
  }
  var product = xjGetProductById(productId);
  if (!product) return;
  var reference = xjDb.collection("users").doc(user.uid).collection("wishlist").doc(productId);
  try {
    if (xjWishlistIds[productId]) {
      await reference.delete();
      delete xjWishlistIds[productId];
    } else {
      await reference.set({
        productId: productId,
        savedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      xjWishlistIds[productId] = true;
    }
    xjUpdateWishlistButtons();
    if (document.getElementById("wishlistModal").classList.contains("active")) xjRenderWishlist();
  } catch (error) {
    console.error("Could not update wishlist:", error);
    showToast("Wishlist", "Could not save this change. Please try again.", "error");
  }
}

function xjRenderWishlist() {
  var target = document.getElementById("wishlistContent");
  if (!target) return;
  var ids = Object.keys(xjWishlistIds);
  if (!ids.length) {
    target.innerHTML = "<p>No saved products yet.</p>";
    return;
  }
  target.innerHTML = ids.map(function(id) {
    var product = xjGetProductById(id);
    if (!product) return '<div><span>A saved product is no longer in the catalog.</span><button onclick="xjToggleWishlist(\'' + xjEscapeHtml(id) + '\')">Remove</button></div>';
    var unavailable = xjIsProductHidden(id);
    return '<div class="wishlist-row"><span>' + xjEscapeHtml(product.name) + " — GMD " + Number(product.price).toLocaleString() +
      " — " + (unavailable ? "No longer available" : xjGetProductStock(id) ? "In stock" : "Out of stock") + '</span><button type="button" onclick="xjToggleWishlist(\'' + xjEscapeHtml(id) + '\')">Remove</button>' +
      (unavailable ? "" : '<button type="button" onclick="xjAddWishlistProductToCart(\'' + xjEscapeHtml(id) + '\')">Add to Cart</button>') + '</div>';
  }).join("");
}

function xjOpenWishlist() {
  if (!firebase.auth().currentUser) {
    xjRequireAuth("Sign in to view your wishlist.");
    return;
  }
  xjRenderWishlist();
  document.getElementById("wishlistModal").classList.add("active");
}

window.xjOpenWishlist = xjOpenWishlist;
window.xjToggleWishlist = xjToggleWishlist;
window.xjAddWishlistProductToCart = xjAddWishlistProductToCart;

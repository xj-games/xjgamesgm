/* XJ Games commerce features: filters, wishlist, orders, recommendations and admin tools. */
(function () {
  var wishlist = JSON.parse(localStorage.getItem("xj_wishlist") || "[]");
  var orders = JSON.parse(localStorage.getItem("xj_orders") || "[]");
  var promos = JSON.parse(localStorage.getItem("xj_promos") || "[]");
  var flashSales = JSON.parse(localStorage.getItem("xj_flash_sales") || "[]");
  var redeemedPromo = null;

  function save() {
    localStorage.setItem("xj_wishlist", JSON.stringify(wishlist));
    localStorage.setItem("xj_orders", JSON.stringify(orders));
    localStorage.setItem("xj_promos", JSON.stringify(promos));
    localStorage.setItem("xj_flash_sales", JSON.stringify(flashSales));
  }
  function user() { return window.xjAuth && xjAuth.currentUser; }
  function log(action, data) {
    var u = user();
    if (window.xjDb && u) xjDb.collection("users").doc(u.uid).collection("activity").add({
      action: action, data: data || {}, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(function () {});
  }
  function product(id) { return window.xjGetProductById ? xjGetProductById(id) : null; }
  function price(id) {
    var p = product(id), sale = flashSales.filter(function (s) {
      return s.productId === id && new Date(s.endsAt).getTime() > Date.now();
    })[0];
    return sale ? Math.round(p.price * (1 - sale.percent / 100)) : (p ? p.price : 0);
  }
  function firestoreSaleFor(id) {
    return flashSales.filter(function (s) {
      var start = s.startsAt && s.startsAt.toMillis ? s.startsAt.toMillis() : new Date(s.startsAt || 0).getTime();
      var end = s.endsAt && s.endsAt.toMillis ? s.endsAt.toMillis() : new Date(s.endsAt || 0).getTime();
      return s.productId === id && s.active !== false && start <= Date.now() && end > Date.now();
    })[0];
  }
  function renderFlashPrices() {
    document.querySelectorAll("#productGrid .card[data-product-id]").forEach(function (card) {
      var id = card.getAttribute("data-product-id"), p = product(id), sale = firestoreSaleFor(id);
      if (!p) return;
      var el = card.querySelector(".price");
      if (!el) return;
      if (sale) {
        var salePrice = Math.round(p.price * (1 - Number(sale.percent) / 100));
        el.innerHTML = "<s style='color:#888;font-size:12px;'>" + Number(p.price).toLocaleString() + " GMD</s> <strong>" + salePrice.toLocaleString() + " GMD</strong>";
      } else {
        el.textContent = Number(p.price).toLocaleString() + " GMD";
      }
      window.xjApplyWebsiteSettings = function (settings) {
        if (!settings) return;
        var existing = document.getElementById("xjMaintenanceBanner");
        if (settings.maintenanceMode && !(window.xjIsAdmin && xjIsAdmin())) {
          if (!existing) {
            existing = document.createElement("div");
            existing.id = "xjMaintenanceBanner";
            existing.style.cssText = "position:fixed;inset:0;z-index:100000;background:#070b16;color:#fff;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;font-family:Arial,sans-serif;";
            document.body.appendChild(existing);
          }
          existing.innerHTML = "<div><h1 style='color:#00bfff;'>XJ Games is under maintenance</h1><p>" + xjEscapeHtml(settings.maintenanceMessage || "We will be back shortly.") + "</p></div>";
        } else if (existing) {
          existing.remove();
        }
      }
    });
    if (window.xjRefreshProductPrices) window.xjRefreshProductPrices();
  }
  window.xjToggleWishlist = function (id) {
    if (wishlist.indexOf(id) < 0) wishlist.push(id); else wishlist.splice(wishlist.indexOf(id), 1);
    save(); log("wishlist_updated", { productId: id, saved: wishlist.indexOf(id) >= 0 }); renderWishlist(); renderRecommendations();
  };
  window.xjIsWishlisted = function (id) { return wishlist.indexOf(id) >= 0; };
  function renderWishlist() {
    document.querySelectorAll("#productGrid .card[data-product-id]").forEach(function (card) {
      var id = card.getAttribute("data-product-id"), b = card.querySelector(".xj-wishlist");
      if (!b) { b = document.createElement("button"); b.className = "xj-wishlist"; b.type = "button"; card.insertBefore(b, card.firstChild); }
      b.textContent = xjIsWishlisted(id) ? "♥ Saved" : "♡ Wishlist";
      b.onclick = function (e) { e.stopPropagation(); xjToggleWishlist(id); };
    });
    var box = document.getElementById("wishlistItems"); if (!box) return;
    box.innerHTML = wishlist.length ? wishlist.map(function (id) {
      var p = product(id); return p ? "<div class='xj-list-row'><b>" + xjEscapeHtml(p.name) + "</b><span>" + price(id).toLocaleString() + " GMD</span><button onclick=\"xjToggleWishlist('" + id + "')\">Remove</button></div>" : "";
    }).join("") : "<p>No saved products yet.</p>";
  }
  window.xjFilterCategory = function () {
    var category = document.getElementById("categoryFilter").value, stock = document.getElementById("stockFilter").value;
    document.querySelectorAll("#productGrid .card[data-product-id]").forEach(function (card) {
      var p = product(card.getAttribute("data-product-id")), ok = !category || (p && (p.displayCategory === category || (p.categories || []).indexOf(category) >= 0));
      if (stock === "in" && p) ok = ok && xjGetProductStock(p.id); if (stock === "out" && p) ok = ok && !xjGetProductStock(p.id); card.style.display = ok ? "" : "none";
    });
  };
  function renderRecommendations() {
    var box = document.getElementById("recommendationItems"); if (!box) return;
    var ids = xjGetAllProductIds().filter(function (id) { return wishlist.indexOf(id) < 0; }).slice(0, 4);
    box.innerHTML = ids.map(function (id) { var p = product(id); return "<button class='xj-recommend' onclick=\"document.querySelector('[data-product-id=" + JSON.stringify(id) + "]').scrollIntoView({behavior:'smooth'})\">" + xjEscapeHtml(p.name) + " · " + price(id).toLocaleString() + " GMD</button>"; }).join("");
  }
  function populateFlashProducts() {
    var select = document.getElementById("flashProduct"); if (!select || !window.xjGetAllProductIds) return;
    select.innerHTML = xjGetAllProductIds().map(function (id) { var p = product(id); return "<option value='" + id + "'>" + xjEscapeHtml(p.name) + "</option>"; }).join("");
  }
  window.xjOpenCommercePanel = function (id) { var el = document.getElementById(id); if (el) el.classList.add("active"); };
  window.xjCloseCommercePanel = function (id) { var el = document.getElementById(id); if (el) el.classList.remove("active"); };
  window.xjSaveOrder = function () {
    if (!window.cart || !cart.length) return;
    var total = cart.reduce(function (n, i) { return n + (Number(i.finalPrice) || 0) * (Number(i.quantity) || 1); }, 0);
    var order = { id: "XJ-" + Date.now(), items: cart.map(function (i) { return { name: i.name, quantity: i.quantity, price: i.finalPrice }; }), total: total, status: "Placed", createdAt: new Date().toISOString() };
    orders.unshift(order); orders = orders.slice(0, 50); save(); log("order_placed", order);
    if (window.xjDb && user()) xjDb.collection("users").doc(user().uid).collection("orders").doc(order.id).set(order).catch(function () {});
  };
  function renderOrders() {
    var box = document.getElementById("orderHistoryItems"); if (!box) return;
    box.innerHTML = orders.length ? orders.map(function (o) { return "<div class='xj-list-row'><b>" + o.id + "</b><span>" + o.total.toLocaleString() + " GMD · " + o.status + "</span><small>" + new Date(o.createdAt).toLocaleDateString() + "</small></div>"; }).join("") : "<p>No orders recorded on this device.</p>";
  }
  window.xjAdminAddPromo = async function () {
    if (!xjIsAdmin() || !window.xjDb || !firebase.functions) return showToast("Promo code", "Admin backend is not available.", "error");
    var code = (document.getElementById("promoCode").value || "").trim().toUpperCase(), percent = Number(document.getElementById("promoPercent").value);
    if (!code) {
      code = Array.from({ length: 7 }, function () {
        return "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".charAt(Math.floor(Math.random() * 36));
      }).join("");
      document.getElementById("promoCode").value = code;
    }
    if (!/^[A-Z0-9]{7,}$/.test(code) || percent < 1 || percent > 90) return showToast("Promo code", "Enter at least 7 letters/numbers and a 1–90% discount.", "error");
    try {
      var usageLimit = document.getElementById("promoUsageLimit");
      await firebase.functions().httpsCallable("createPromoCode")({
        code: code,
        percent: percent,
        expiresAt: (document.getElementById("promoExpiresAt") || {}).value || null,
        usageLimit: usageLimit && usageLimit.value ? Number(usageLimit.value) : null
      });
      window.xjAdminLoadPromos();
      showToast("Promo saved", code + " is active.");
    } catch (error) {
      console.error("Promo creation failed:", error);
      showToast("Promo code", "The promo code could not be saved.", "error");
    }
  };
  window.xjAdminLoadPromos = async function () {
    var list = document.getElementById("adminPromoList");
    if (!list || !xjIsAdmin() || !firebase.functions) return;
    try {
      var result = await firebase.functions().httpsCallable("listPromoCodes")({});
      var promos = result.data && Array.isArray(result.data.promos) ? result.data.promos : [];
      list.innerHTML = promos.length ? promos.map(function (promo) {
        var expiry = promo.expiresAt ? " · expires " + new Date(promo.expiresAt).toLocaleDateString() : "";
        var limit = promo.usageLimit === null ? "unlimited" : promo.usageCount + "/" + promo.usageLimit;
        return "<div style='padding:5px 0;border-bottom:1px solid rgba(255,255,255,.08);'>" +
          "<strong>" + xjEscapeHtml(promo.code) + "</strong> · " + promo.percent + "% · " +
          (promo.active ? "active" : "inactive") + " · uses " + limit + expiry + "</div>";
      }).join("") : "No promo codes saved.";
    } catch (error) {
      console.error("Promo list failed:", error);
      list.textContent = "Promo codes could not be loaded.";
    }
  };
  window.xjAdminAddFlashSale = async function () {
    if (!xjIsAdmin() || !window.xjDb || !firebase.functions) return showToast("Flash sale", "Admin backend is not available.", "error");
    var id = document.getElementById("flashProduct").value, percent = Number(document.getElementById("flashPercent").value), hours = Number(document.getElementById("flashHours").value);
    if (!product(id) || percent < 1 || percent > 80 || hours < 1) return showToast("Flash sale", "Choose a product and valid values.", "error");
    try {
      await firebase.functions().httpsCallable("createFlashSale")({
        productId: id, percent: percent, startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + hours * 3600000).toISOString()
      });
      showToast("Flash sale saved", product(id).name + " is discounted.");
    } catch (error) {
      console.error("Flash sale failed:", error);
      showToast("Flash sale", error.message || "The flash sale could not be saved.", "error");
    }
  };
  window.xjAdminSetAccountStatus = async function () {
    if (!xjIsAdmin() || !window.xjDb || !firebase.functions) return showToast("Accounts", "Admin backend is not available.", "error");
    var uid = (document.getElementById("adminUserUid").value || "").trim();
    var status = document.getElementById("adminUserStatus").value;
    if (!uid) return showToast("Accounts", "Enter a Firebase user UID.", "error");
    try {
      await firebase.functions().httpsCallable("setAccountStatus")({ uid: uid, status: status });
      showToast("Account updated", "The account status is now " + status + ".");
    } catch (error) {
      console.error("Account status update failed:", error);
      showToast("Accounts", error.message || "Could not update account status.", "error");
    }
  };
  window.xjAdminUpdateSettings = async function () {
    if (!xjIsAdmin() || !window.xjDb || !firebase.functions) return showToast("Website controls", "Admin backend is not available.", "error");
    try {
      await firebase.functions().httpsCallable("updateWebsiteSettings")({ settings: {
        maintenanceMode: document.getElementById("maintenanceMode").checked,
        orderingEnabled: document.getElementById("orderingEnabled").checked,
        promotionsEnabled: document.getElementById("promotionsEnabled").checked,
        maintenanceMessage: document.getElementById("maintenanceMessage").value.trim()
      }});
      showToast("Website controls", "Settings saved.");
    } catch (error) {
      console.error("Website settings update failed:", error);
      showToast("Website controls", error.message || "Could not save website settings.", "error");
    }
  };
  window.xjAdminRestoreBackup = async function () {
    if (!xjIsAdmin() || !window.xjDb || !firebase.functions) return showToast("Backup", "Admin backend is not available.", "error");
    var backupId = (document.getElementById("backupId").value || "").trim();
    if (!backupId) return showToast("Backup", "Enter a server backup ID.", "error");
    if (!window.confirm("Restore this server backup into live data?")) return;
    try {
      await firebase.functions().httpsCallable("restoreBackup")({ backupId: backupId });
      showToast("Backup restored", "The selected server backup was restored.");
    } catch (error) {
      console.error("Backup restore failed:", error);
      showToast("Backup", error.message || "Could not restore the backup.", "error");
    }
  };
  window.xjRedeemPromo = async function () {
    var input = document.getElementById("cartPromoCode"), message = document.getElementById("cartPromoMessage");
    if (!input || !window.xjAuth || !xjAuth.currentUser || !firebase.functions) {
      return showToast("Promo code", "Please sign in before redeeming a promo code.", "error");
    }
    try {
      var result = await firebase.functions().httpsCallable("redeemPromoCode")({ code: input.value });
      redeemedPromo = { code: input.value.trim().toUpperCase(), percent: Number(result.data.percent) };
      if (message) message.textContent = redeemedPromo.percent + "% discount applied after order validation.";
      showToast("Promo applied", "Your promo code is reserved for this redemption.", "success");
    } catch (error) {
      console.error("Promo redemption failed:", error);
      if (message) message.textContent = "";
      showToast("Promo code", "Invalid code, please try again", "error");
    }
  };
  window.xjRedeemTopPromo = function () {
    var topInput = document.getElementById("topPromoCode");
    var cartInput = document.getElementById("cartPromoCode");
    if (!topInput || !cartInput) return showToast("Promo code", "Promo redemption is unavailable.", "error");
    cartInput.value = topInput.value.trim().toUpperCase();
    window.xjRedeemPromo();
  };
  window.xjBackupStore = function () {
    var data = { wishlist: wishlist, orders: orders, promos: promos, flashSales: flashSales, exportedAt: new Date().toISOString() }, a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })); a.download = "xj-games-backup.json"; a.click(); URL.revokeObjectURL(a.href);
  };
  window.xjRestoreStore = function (input) { var f = input.files && input.files[0]; if (!f) return; var r = new FileReader(); r.onload = function () { try { var d = JSON.parse(r.result); wishlist = Array.isArray(d.wishlist) ? d.wishlist : []; orders = Array.isArray(d.orders) ? d.orders : []; promos = Array.isArray(d.promos) ? d.promos : []; flashSales = Array.isArray(d.flashSales) ? d.flashSales : []; save(); renderWishlist(); renderOrders(); showToast("Backup restored", "Your local store data was restored."); } catch (e) { showToast("Restore failed", "The backup file is invalid.", "error"); } }; r.readAsText(f); };
  document.addEventListener("DOMContentLoaded", function () {
    renderWishlist(); renderOrders(); renderRecommendations(); populateFlashProducts(); renderFlashPrices();
    if (window.xjDb) {
      xjDb.collection("flashSales").onSnapshot(function (snapshot) {
        flashSales = snapshot.docs.map(function (doc) { return Object.assign({ id: doc.id }, doc.data()); });
        renderFlashPrices();
      }, function (error) { console.error("Flash sale listener error:", error); });
      xjDb.collection("websiteSettings").doc("main").onSnapshot(function (snapshot) {
        window.xjCurrentWebsiteSettings = snapshot.exists ? snapshot.data() : {};
        window.xjApplyWebsiteSettings(window.xjCurrentWebsiteSettings);
      }, function (error) { console.error("Website settings listener error:", error); });
    }
    var f = document.getElementById("categoryFilter"); if (f) f.onchange = xjFilterCategory;
    var s = document.getElementById("stockFilter"); if (s) s.onchange = xjFilterCategory;
  });
})();

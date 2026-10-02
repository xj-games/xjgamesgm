/* XJ Games commerce features: orders, recommendations and admin tools. */
(function () {
  var orders = JSON.parse(localStorage.getItem("xj_orders") || "[]");
  var promos = JSON.parse(localStorage.getItem("xj_promos") || "[]");
  var flashSales = JSON.parse(localStorage.getItem("xj_flash_sales") || "[]");
  var redeemedPromo = null;
  var adminPromoUnsubscribe = null;
  var adminPointsCodeUnsubscribe = null;

  function save() {
    localStorage.setItem("xj_orders", JSON.stringify(orders));
    localStorage.setItem("xj_promos", JSON.stringify(promos));
    localStorage.setItem("xj_flash_sales", JSON.stringify(flashSales));
  }
  function user() { return window.xjAuth && xjAuth.currentUser; }
  function promoStorageKey() { var currentUser = user(); return currentUser ? "xj_redeemed_promo_" + currentUser.uid : ""; }
  window.xjGetRedeemedPromo = function () {
    var key = promoStorageKey();
    if (!key) return null;
    try { redeemedPromo = JSON.parse(localStorage.getItem(key) || "null"); } catch (error) { redeemedPromo = null; }
    return redeemedPromo && redeemedPromo.uid === user().uid ? redeemedPromo : null;
  };
  window.xjRemovePromo = function () {
    var key = promoStorageKey();
    if (key) localStorage.removeItem(key);
    redeemedPromo = null;
    var message = document.getElementById("cartPromoMessage");
    if (message) message.textContent = "";
    if (window.updateCartUI) updateCartUI();
  };
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
  window.xjFilterCategory = function () {
    var category = document.getElementById("categoryFilter").value, stock = document.getElementById("stockFilter").value;
    document.querySelectorAll("#productGrid .card[data-product-id]").forEach(function (card) {
      var p = product(card.getAttribute("data-product-id")), ok = !category || (p && (p.displayCategory === category || (p.categories || []).indexOf(category) >= 0));
      if (stock === "in" && p) ok = ok && xjGetProductStock(p.id); if (stock === "out" && p) ok = ok && !xjGetProductStock(p.id); card.style.display = ok ? "" : "none";
    });
  };
  function renderRecommendations() {
    var box = document.getElementById("recommendationItems"); if (!box) return;
    var ids = xjGetAllProductIds().filter(function (id) {
      return xjGetProductStock(id) && !(window.xjIsProductHidden && xjIsProductHidden(id));
    }).slice(0, 4);
    box.classList.add("product-grid");
    var cards = ids.map(function (id) {
      var source = document.querySelector('#productGrid .card[data-product-id="' + id + '"]');
      if (!source || (window.xjIsProductHidden && xjIsProductHidden(id))) return null;
      var card = source.cloneNode(true);
      card.removeAttribute("id");
      card.style.display = "";
      card.classList.remove("xj-search-highlight");
      return card;
    }).filter(Boolean);
    box.replaceChildren.apply(box, cards);
    cards.forEach(function (card) {
      if (window.xjApplyStockState) xjApplyStockState(card);
      card.querySelectorAll(".xj-product-carousel").forEach(function (carousel) {
        var slides = Array.prototype.slice.call(carousel.querySelectorAll(".xj-carousel-slide"));
        var dots = Array.prototype.slice.call(carousel.querySelectorAll(".xj-carousel-dot"));
        dots.forEach(function (dot, index) {
          dot.addEventListener("click", function () {
            slides.forEach(function (slide, slideIndex) { slide.classList.toggle("xj-carousel-active", slideIndex === index); });
            dots.forEach(function (item, dotIndex) { item.classList.toggle("xj-carousel-dot-active", dotIndex === index); });
          });
        });
      });
    });
  }
  function populateFlashProducts() {
    var select = document.getElementById("flashProduct"); if (!select || !window.xjGetAllProductIds) return;
    select.innerHTML = xjGetAllProductIds().map(function (id) { var p = product(id); return "<option value='" + id + "'>" + xjEscapeHtml(p.name) + "</option>"; }).join("");
  }
  window.xjSetPromoDiscountType = function () {
    var fixed = document.getElementById("promoDiscountType").value === "fixed";
    document.querySelectorAll(".promo-percent-field").forEach(function (el) { el.style.display = fixed ? "none" : ""; });
    document.querySelectorAll(".promo-amount-field").forEach(function (el) { el.style.display = fixed ? "" : "none"; });
  };
  function callable(name, data) {
    if (!window.firebase || !firebase.functions) throw new Error("Admin backend is not available.");
    return firebase.functions().httpsCallable(name)(data || {});
  }
  window.xjAdminCreatePointsCode = async function () {
    if (!xjIsAdmin()) return showToast("Points code", "Admin permission required.", "error");
    var valueGmd = Number(document.getElementById("pointsCodeValue").value);
    var usageLimit = Number(document.getElementById("pointsCodeUses").value) || 1;
    try {
      var result = await callable("createPointsCode", { valueGmd: valueGmd, usageLimit: usageLimit });
      document.getElementById("pointsCodeValue").value = "";
      showToast("Points code created", result.data.code + " · " + Number(result.data.valueGmd).toLocaleString() + " GMD");
      await xjCopyCode(result.data.code, false);
    } catch (error) {
      console.error("Points code creation failed:", error);
      showToast("Points code", error.message || "Could not create the points code.", "error");
    }
  };
  window.xjAdminAddPromo = async function () {
    if (!xjIsAdmin() || !window.xjDb || !firebase.functions) return showToast("Discount code", "Admin backend is not available.", "error");
    var code = (document.getElementById("promoCode").value || "").trim().toUpperCase();
    var discountType = document.getElementById("promoDiscountType").value;
    var percent = discountType === "percent" ? Number(document.getElementById("promoPercent").value) : 0;
    var discountAmount = discountType === "fixed" ? Number(document.getElementById("promoAmount").value) : 0;
    var usageLimit = Number(document.getElementById("promoUsageLimit").value) || 1;
    var expiresValue = document.getElementById("promoExpiresAt").value;
    if (!/^[A-Z0-9]{3,64}$/.test(code) || (discountType === "percent" && (percent < 1 || percent > 90)) || (discountType === "fixed" && discountAmount < 1)) {
      return showToast("Discount code", "Enter a valid code and discount amount.", "error");
    }
    try {
      await callable("createPromoCode", {
        code: code,
        discountType: discountType,
        percent: percent,
        discountAmount: discountAmount,
        usageLimit: usageLimit,
        expiresAt: expiresValue ? new Date(expiresValue).toISOString() : null
      });
      document.getElementById("promoCode").value = "";
      showToast("Discount code created", code + " is active.");
    } catch (error) {
      console.error("Discount code creation failed:", error);
      showToast("Discount code", error.message || "The code could not be saved.", "error");
    }
  };
  window.xjLoadAdminCodeLists = function () {
    if (!xjIsAdmin() || !window.xjDb) return;
    if (adminPromoUnsubscribe) adminPromoUnsubscribe();
    if (adminPointsCodeUnsubscribe) adminPointsCodeUnsubscribe();
    adminPromoUnsubscribe = xjDb.collection("promos").onSnapshot(function (snapshot) {
      window.xjRenderAdminDiscountCodes(snapshot.docs.map(function (doc) { return Object.assign({ code: doc.id }, doc.data()); }));
    }, function (error) { console.error("Discount code list failed:", error); });
    adminPointsCodeUnsubscribe = xjDb.collection("pointsCodes").onSnapshot(function (snapshot) {
      window.xjRenderAdminPointsCodes(snapshot.docs.map(function (doc) { return Object.assign({ code: doc.id }, doc.data()); }));
    }, function (error) { console.error("Points code list failed:", error); });
  };
  function renderAdminCodeRows(containerId, entries, kind) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.replaceChildren();
    if (!entries.length) {
      container.textContent = "No " + (kind === "points" ? "points" : "discount") + " codes yet.";
      return;
    }
    entries.forEach(function (entry) {
      var count = Number(entry.usedCount) || (entry.used ? 1 : 0);
      var limit = Number(entry.usageLimit) || 1;
      var exhausted = count >= limit;
      var row = document.createElement("div");
      row.className = "points-code-row";
      var info = document.createElement("span");
      var value = kind === "points"
        ? Number(entry.valueGmd).toLocaleString() + " GMD"
        : entry.discountType === "fixed" || Number(entry.discountAmount) > 0
          ? Number(entry.discountAmount).toLocaleString() + " GMD off"
          : Number(entry.percent) + "% off";
        var expiryMillis = entry.expiresAt && entry.expiresAt.toMillis ? entry.expiresAt.toMillis() : 0;
        var expired = expiryMillis > 0 && expiryMillis <= Date.now();
        var status = expired ? "Expired" : entry.active !== false && !exhausted ? (count ? "Active · " + count + "/" + limit + " uses" : "Unused · " + limit + " uses") : exhausted ? "Redeemed · " + count + "/" + limit : "Disabled";
        var createdAt = entry.createdAt && entry.createdAt.toDate ? entry.createdAt.toDate().toLocaleString() : "Creation date unavailable";
        info.textContent = entry.code + " · " + value + " · " + status + " · Created " + createdAt;
      var actions = document.createElement("span");
      var copy = document.createElement("button");
      copy.type = "button";
      copy.textContent = "Copy";
      copy.addEventListener("click", function () { xjCopyCode(entry.code, true); });
      actions.appendChild(copy);
      if (!exhausted && !expired) {
        var toggle = document.createElement("button");
        toggle.type = "button";
        toggle.textContent = entry.active === false ? "Enable" : "Disable";
        toggle.addEventListener("click", function () { window.xjAdminSetCodeActive(entry.code, kind, entry.active === false); });
        actions.appendChild(toggle);
      }
      row.appendChild(info);
      row.appendChild(actions);
      container.appendChild(row);
    });
  }
  window.xjRenderAdminDiscountCodes = function (entries) { renderAdminCodeRows("adminPromoList", entries, "discount"); };
  window.xjRenderAdminPointsCodes = function (entries) { renderAdminCodeRows("adminPointsCodeList", entries, "points"); };
  window.xjAdminSetCodeActive = async function (code, codeType, active) {
    if (!xjIsAdmin()) return showToast("Code status", "Admin permission required.", "error");
    try {
      await callable("setCodeActive", { code: code, codeType: codeType, active: active });
      showToast("Code updated", code + (active ? " enabled." : " disabled."));
    } catch (error) {
      console.error("Code status update failed:", error);
      showToast("Code status", error.message || "Could not update the code.", "error");
    }
  };
  window.xjCopyCode = async function (code, notify) {
    try {
      await navigator.clipboard.writeText(code);
      if (notify) showToast("Copied", code + " copied to clipboard.");
    } catch (error) {
      showToast("Copy code", "Clipboard access is unavailable. Select and copy: " + code, "info");
    }
  };
  window.xjRefreshCommerceProducts = function () { renderFlashPrices(); renderRecommendations(); };
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
    var code = input.value.trim().toUpperCase();
    if (!code) {
      if (message) message.textContent = "Invalid promo code. Please try again.";
      return showToast("Promo code", "Invalid promo code. Please try again.", "error");
    }
    try {
      var result = await firebase.functions().httpsCallable("redeemPromoCode")({ code: code });
      redeemedPromo = Object.assign({}, result.data, { uid: user().uid });
      localStorage.setItem(promoStorageKey(), JSON.stringify(redeemedPromo));
      if (message) message.textContent = redeemedPromo.discountAmount
        ? redeemedPromo.discountAmount.toLocaleString() + " GMD discount applied at checkout."
        : redeemedPromo.percent + "% discount applied at checkout.";
      if (window.updateCartUI) updateCartUI();
      showToast("Promo applied", "The discount will be verified again when your order is created.", "success");
    } catch (error) {
      if (!error || !["functions/not-found", "functions/failed-precondition", "functions/invalid-argument"].includes(error.code)) {
        console.error("Promo redemption failed:", error);
      }
      window.xjRemovePromo();
      if (message) message.textContent = "Invalid promo code. Please try again.";
      showToast("Promo code", "Invalid promo code. Please try again.", "error");
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
    var data = { orders: orders, promos: promos, flashSales: flashSales, exportedAt: new Date().toISOString() }, a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })); a.download = "xj-games-backup.json"; a.click(); URL.revokeObjectURL(a.href);
  };
  window.xjRestoreStore = function (input) { var f = input.files && input.files[0]; if (!f) return; var r = new FileReader(); r.onload = function () { try { var d = JSON.parse(r.result); orders = Array.isArray(d.orders) ? d.orders : []; promos = Array.isArray(d.promos) ? d.promos : []; flashSales = Array.isArray(d.flashSales) ? d.flashSales : []; save(); renderOrders(); showToast("Backup restored", "Your local store data was restored."); } catch (e) { showToast("Restore failed", "The backup file is invalid.", "error"); } }; r.readAsText(f); };
  function initializeCommerceUi() {
    renderOrders(); populateFlashProducts(); renderFlashPrices();
    window.setTimeout(renderRecommendations, 0);
    if (window.xjDb) {
      xjDb.collection("flashSales").onSnapshot(function (snapshot) {
        flashSales = snapshot.docs.map(function (doc) { return Object.assign({ id: doc.id }, doc.data()); });
        renderFlashPrices();
      }, function (error) { console.error("Flash sale listener error:", error); });
      xjDb.collection("config").doc("settings").onSnapshot(function (snapshot) {
        window.xjCurrentWebsiteSettings = snapshot.exists ? snapshot.data() : {};
        window.xjApplyWebsiteSettings(window.xjCurrentWebsiteSettings);
      }, function (error) { console.error("Website settings listener error:", error); });
    }
    var f = document.getElementById("categoryFilter"); if (f) f.onchange = xjFilterCategory;
    var s = document.getElementById("stockFilter"); if (s) s.onchange = xjFilterCategory;
  }
  initializeCommerceUi();
})();

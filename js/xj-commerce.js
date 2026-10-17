/* XJ Games commerce features: orders, recommendations and admin tools. */
(function () {
  var orders = JSON.parse(localStorage.getItem("xj_orders") || "[]");
  var flashSales = JSON.parse(localStorage.getItem("xj_flash_sales") || "[]");

  try {
    Object.keys(localStorage).filter(function(key) {
      return key === "xj_promos" || key.indexOf("xj_redeemed_promo_") === 0;
    }).forEach(function(key) {
      localStorage.removeItem(key);
    });
  } catch (error) {
    console.warn("Could not clear saved promo-code data:", error);
  }

  function save() {
    localStorage.setItem("xj_orders", JSON.stringify(orders));
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
  function firestoreSaleFor(id) {
    return flashSales.filter(function (s) {
      var start = s.startsAt && s.startsAt.toMillis ? s.startsAt.toMillis() : new Date(s.startsAt || 0).getTime();
      var end = s.endsAt && s.endsAt.toMillis ? s.endsAt.toMillis() : new Date(s.endsAt || 0).getTime();
      var percent = Number(s.percent);
      return s.productId === id && s.active !== false && percent >= 1 && percent <= 80 && start <= Date.now() && end > Date.now();
    }).sort(function (a, b) { return Number(b.percent) - Number(a.percent); })[0];
  }
  function currentFlashSalePrice(id, basePrice) {
    var sale = firestoreSaleFor(id);
    return sale
      ? Math.round(Number(basePrice) * (1 - Number(sale.percent) / 100))
      : Number(basePrice) || 0;
  }
  window.xjGetFlashSalePrice = currentFlashSalePrice;
  function renderFlashPrices() {
    document.querySelectorAll("#productGrid .card[data-product-id]").forEach(function (card) {
      var id = card.getAttribute("data-product-id"), p = product(id), sale = firestoreSaleFor(id);
      if (!p) return;
      var el = card.querySelector(".price");
      if (!el) return;
      var salePrice = currentFlashSalePrice(id, p.price);
      if (sale) {
        el.innerHTML = "<s style='color:#888;font-size:12px;'>" + Number(p.price).toLocaleString() + " GMD</s> <strong>" + salePrice.toLocaleString() + " GMD</strong>";
      } else {
        el.textContent = Number(p.price).toLocaleString() + " GMD";
      }
    });
    if (window.xjRefreshProductPrices) window.xjRefreshProductPrices();
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
  };
  window.xjFilterCategory = function () {
    if (typeof xjApplyStorefrontVisibility === "function") xjApplyStorefrontVisibility();
  };
  function renderRecommendations() {
    var box = document.getElementById("recommendationItems"); if (!box) return;
    var eligibleCategories = ["playstation-consoles", "nintendo-consoles", "controllers", "games"];
    var ids = xjGetAllProductIds().filter(function (id) {
      var item = product(id);
      return xjGetProductStock(id)
        && !(window.xjIsProductHidden && xjIsProductHidden(id))
        && eligibleCategories.indexOf(xjGetProductDisplayCategory(item)) !== -1;
    }).sort(function (a, b) {
      return Number(product(b).price || 0) - Number(product(a).price || 0);
    }).slice(0, 3);
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
  window.xjRefreshRecommendations = renderRecommendations;
  function populateFlashProducts() {
    var select = document.getElementById("flashProduct"); if (!select || !window.xjGetAllProductIds) return;
    select.innerHTML = xjGetAllProductIds().map(function (id) { var p = product(id); return "<option value='" + id + "'>" + xjEscapeHtml(p.name) + "</option>"; }).join("");
  }
  function callable(name, data) {
    if (!window.firebase || !firebase.functions) throw new Error("Admin backend is not available.");
    return firebase.functions().httpsCallable(name)(data || {});
  }
  function friendlyFunctionError(error, fallback) {
    var message = String(error && error.message || "");
    var code = String(error && error.code || "").toLowerCase();
    if (/internal|unknown error|internal server|internal error/i.test(message) || /functions\/(internal|unknown)/.test(code)) {
      return fallback;
    }
    return message || fallback;
  }
  window.xjLoadAdminOrders = function () {
    if (!xjIsAdmin() || !window.xjDb) return;
    if (pendingOrdersUnsubscribe) pendingOrdersUnsubscribe();
    pendingOrdersUnsubscribe = xjDb.collection("orders")
      .where("status", "==", "Pending WhatsApp confirmation")
      .onSnapshot(function (snapshot) {
        var container = document.getElementById("adminPendingOrders");
        if (!container) return;
        container.replaceChildren();
        if (snapshot.empty) {
          container.textContent = "No orders awaiting confirmation.";
          return;
        }
        snapshot.docs.forEach(function (doc) {
          var order = doc.data();
          var row = document.createElement("div");
          row.className = "points-code-row";
          var summary = document.createElement("span");
          var itemSummary = (order.items || []).map(function (item) {
            return item.name + " x" + (Number(item.quantity) || 1);
          }).join(", ");
          summary.textContent = doc.id + " · " + (order.customerName || "Customer") + " · " + itemSummary + " · " + Number(order.total || 0).toLocaleString() + " GMD" + (order.promoCode ? " · " + order.promoCode + " (-" + Number(order.discount || 0).toLocaleString() + " GMD)" : "");
          var confirm = document.createElement("button");
          confirm.type = "button";
          confirm.textContent = "Confirm received order";
          confirm.addEventListener("click", function () { window.xjAdminConfirmOrder(doc.id); });
          var cancel = document.createElement("button");
          cancel.type = "button";
          cancel.textContent = "Cancel";
          cancel.addEventListener("click", function () { window.xjAdminCancelOrder(doc.id); });
          row.appendChild(summary);
          row.appendChild(confirm);
          row.appendChild(cancel);
          container.appendChild(row);
        });
      }, function (error) {
        console.error("Pending order listener error:", error);
        showToast("Orders", "Could not load pending orders.", "error");
      });
  };
  window.xjAdminConfirmOrder = async function (orderId) {
    if (!xjIsAdmin()) return showToast("Order confirmation", "Admin permission required.", "error");
    if (!window.confirm("Confirm that order " + orderId + " was accepted? This will apply the discount and deduct any XJ Games balance.")) return;
    try {
      await callable("confirmOrder", { orderId: orderId });
      showToast("Order confirmed", orderId + " was confirmed and its discount redemption recorded.");
    } catch (error) {
      console.error("Order confirmation failed:", error);
      showToast("Order confirmation", friendlyFunctionError(error, "Could not confirm this order. Please try again."), "error");
    }
  };
  window.xjAdminCancelOrder = async function (orderId) {
    if (!xjIsAdmin()) return showToast("Order cancellation", "Admin permission required.", "error");
    if (!window.confirm("Cancel pending order " + orderId + "? No discount or balance will be consumed.")) return;
    try {
      await callable("cancelOrder", { orderId: orderId });
      showToast("Order cancelled", orderId + " was cancelled.");
    } catch (error) {
      console.error("Order cancellation failed:", error);
      showToast("Order cancellation", friendlyFunctionError(error, "Could not cancel this order. Please try again."), "error");
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
  window.xjBackupStore = function () {
    var data = { orders: orders, flashSales: flashSales, exportedAt: new Date().toISOString() }, a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })); a.download = "xj-games-backup.json"; a.click(); URL.revokeObjectURL(a.href);
  };
  window.xjRestoreStore = function (input) { var f = input.files && input.files[0]; if (!f) return; var r = new FileReader(); r.onload = function () { try { var d = JSON.parse(r.result); orders = Array.isArray(d.orders) ? d.orders : []; flashSales = Array.isArray(d.flashSales) ? d.flashSales : []; save(); renderOrders(); showToast("Backup restored", "Your local store data was restored."); } catch (e) { showToast("Restore failed", "The backup file is invalid.", "error"); } }; r.readAsText(f); };
  function initializeCommerceUi() {
    renderOrders(); populateFlashProducts(); renderFlashPrices();
    window.setTimeout(renderRecommendations, 0);
    if (window.xjDb) {
      xjDb.collection("flashSales").onSnapshot(function (snapshot) {
        flashSales = snapshot.docs.map(function (doc) { return Object.assign({ id: doc.id }, doc.data()); });
        renderFlashPrices();
        if (window.xjRepriceCartFromCatalog) window.xjRepriceCartFromCatalog();
        renderRecommendations();
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

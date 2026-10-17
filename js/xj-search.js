/**
 * XJ Games â€” Centralized smart search with alias scoring.
 */

function xjNormalizeSearchQuery(query) {
  return (query || "").toLowerCase().trim().replace(/\s+/g, " ");
}

function xjTokenize(text) {
  return xjNormalizeSearchQuery(text).split(" ").filter(Boolean);
}

/**
 * Score how well a product matches a search query.
 * Higher score = more relevant. Returns 0 for no match.
 */
function xjComputeSearchScore(productId, query) {
  const product = XJ_PRODUCT_CATALOG[productId];
  if (!product || !query) return 0;

  const normalized = xjNormalizeSearchQuery(query);
  const queryTokens = xjTokenize(normalized);
  let score = 0;

  const aliases = product.aliases || [];
  const searchableText = [
    product.name,
    product.slug,
    product.description,
    product.category,
    ...(product.categories || [])
  ].join(" ").toLowerCase();

  // Exact alias match (highest priority)
  aliases.forEach(function(alias) {
    const aliasNorm = xjNormalizeSearchQuery(alias);
    if (aliasNorm === normalized) {
      score += 200 + aliasNorm.length;
    } else if (normalized.includes(aliasNorm) && aliasNorm.length >= 3) {
      score += 80 + aliasNorm.length;
    } else if (aliasNorm.includes(normalized) && normalized.length >= 2) {
      score += 60 + normalized.length;
    }
  });

  // Token-level alias matching
  queryTokens.forEach(function(token) {
    aliases.forEach(function(alias) {
      const aliasTokens = xjTokenize(alias);
      aliasTokens.forEach(function(aliasToken) {
        if (aliasToken === token) {
          score += 25;
        } else if (aliasToken.startsWith(token) || token.startsWith(aliasToken)) {
          score += 12;
        }
      });
    });

    if (searchableText.includes(token)) {
      score += 8;
    }
  });

  // Special relevance rules from requirements

  // "PS" alone â†’ PlayStation 4 consoles, not PS5 accessories
  if (normalized === "ps") {
    if (product.categories && product.categories.indexOf("ps4") !== -1 && product.category === "consoles") {
      score += 150;
    } else if (productId === "ps5-controller") {
      score -= 100;
    }
  }

  // "Switch" alone â†’ Nintendo Switch, not Switch Lite
  if (normalized === "switch") {
    if (productId === "nintendo-switch") {
      score += 120;
    } else if (productId === "nintendo-switch-lite") {
      score -= 80;
    }
  }

  // "Nintendo" alone â†’ both Switch products, Switch full console slightly higher
  if (normalized === "nintendo") {
    if (productId === "nintendo-switch") score += 40;
    if (productId === "nintendo-switch-lite") score += 30;
  }

  // Queries containing "lite" â†’ prioritize Switch Lite
  if (normalized.includes("lite")) {
    if (productId === "nintendo-switch-lite") {
      score += 100;
    } else if (productId === "nintendo-switch") {
      score -= 60;
    }
  }

  // Controller searches â†’ both PS4 and PS5 controllers
  if (/controller|controllers|gamepad/.test(normalized)) {
    if (productId === "ps4-controller" || productId === "ps5-controller") {
      score += 50;
    }
    // Don't show consoles for pure controller search unless query also mentions console
    if (product.category === "consoles" && !/console|ps4|ps5|playstation|nintendo|switch/.test(normalized)) {
      score -= 40;
    }
  }

  // PS4-specific controller query
  if (/ps4/.test(normalized) && /controller|gamepad/.test(normalized)) {
    if (productId === "ps4-controller") score += 80;
    if (productId === "ps5-controller") score -= 30;
  }

  // PS5-specific controller query
  if (/ps5/.test(normalized) && /controller|gamepad/.test(normalized)) {
    if (productId === "ps5-controller") score += 80;
    if (productId === "ps4-controller") score -= 30;
  }

  // PS4 console searches should not prioritize controllers
  if (/^(ps4|ps 4|playstation 4|play station 4|sony ps4)/.test(normalized) && !/controller|gamepad/.test(normalized)) {
    if (product.category === "consoles" && product.categories.indexOf("ps4") !== -1) {
      score += 60;
    }
    if (productId === "ps4-controller" || productId === "ps5-controller") {
      score -= 50;
    }
  }

  // PS5 console searches should not prioritize the DualSense accessory
  if (/^(ps5|ps 5|playstation 5|play station 5|sony ps5)/.test(normalized) && !/controller|gamepad/.test(normalized)) {
    if (productId === "ps5") {
      score += 80;
    }
    if (productId === "ps5-controller") {
      score -= 50;
    }
  }

  if (/^(ps3|ps 3|playstation 3|play station 3|sony ps3)/.test(normalized)) {
    if (productId === "ps3") {
      score += 80;
    }
  }

  if (/^(ps2|ps 2|playstation 2|play station 2|sony ps2)/.test(normalized)) {
    if (productId === "ps2") {
      score += 80;
    }
  }

  return Math.max(0, score);
}

/**
 * Returns sorted array of matching product IDs. Empty query shows all products.
 */
function xjSearchProducts(query) {
  const normalized = xjNormalizeSearchQuery(query);
  const allIds = xjGetAllProductIds().filter(function(id) {
    return !xjIsProductHidden(id);
  });

  if (!normalized) {
    return xjGetPrioritySortedProductIds(allIds);
  }

  const MIN_SCORE = 15;
  const results = allIds
    .map(function(id) {
      return { id: id, score: xjComputeSearchScore(id, normalized) };
    })
    .filter(function(entry) {
      return entry.score >= MIN_SCORE;
    })
    .sort(function(a, b) {
      return b.score - a.score;
    });

  return results.map(function(entry) {
    return entry.id;
  });
}

var xjCatalogView = "featured";

function xjIsShowingAllProducts() {
  var input = document.getElementById("searchInput");
  if (input && xjNormalizeSearchQuery(input.value)) return true;
  return xjCatalogView === "all";
}

function xjGetCatalogPrice(product) {
  if (!product) return 0;
  var price = Number(product.price) || 0;
  if (window.xjGetFlashSalePrice) price = window.xjGetFlashSalePrice(product.id, price);
  if (window.xjProductPrice) price = window.xjProductPrice(product.id, price);
  return Number(price) || 0;
}

function xjSyncCatalogViewUi() {
  var title = document.getElementById("productsSectionTitle");
  var button = document.getElementById("catalogViewToggle");
  var showingAll = xjCatalogView === "all";
  if (title) title.textContent = showingAll ? "All Products" : "Featured Products";
  if (button) button.textContent = "View All Products";
}

function xjSetCatalogView(view, options) {
  xjCatalogView = view === "all" ? "all" : "featured";
  xjSyncCatalogViewUi();
  if (!(options && options.skipHash)) {
    var nextHash = xjCatalogView === "all" ? "#all-products" : "#products";
    if (location.hash !== nextHash) {
      if (history.replaceState) history.replaceState(null, "", nextHash);
      else location.hash = nextHash;
    }
  }
  xjApplyStorefrontVisibility();
}

function xjToggleCatalogView() {
  xjSetCatalogView(xjCatalogView === "all" ? "featured" : "all");
  var section = document.getElementById("products");
  if (section && xjCatalogView === "all") {
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function xjApplyStorefrontVisibility() {
  var grid = document.getElementById("productGrid");
  if (!grid) return;

  var cards = Array.prototype.slice.call(grid.querySelectorAll(".card[data-product-id]"));
  xjGetPrioritySortedProductIds(cards.map(function(card) {
    return card.getAttribute("data-product-id");
  })).forEach(function(productId) {
    var ordered = grid.querySelector('.card[data-product-id="' + productId + '"]');
    if (ordered) grid.appendChild(ordered);
  });

  var input = document.getElementById("searchInput");
  var query = input ? input.value : "";
  var searching = !!xjNormalizeSearchQuery(query);
  var matchingIds = searching ? xjSearchProducts(query) : [];
  var matches = {};
  matchingIds.forEach(function(id) { matches[id] = true; });

  var categoryFilter = document.getElementById("categoryFilter");
  var stockFilter = document.getElementById("stockFilter");
  var consoleFilter = document.getElementById("consoleModelFilter");
  var conditionFilter = document.getElementById("conditionFilter");
  var minimumPrice = document.getElementById("minimumPrice");
  var maximumPrice = document.getElementById("maximumPrice");
  var category = categoryFilter ? categoryFilter.value : "";
  var stock = stockFilter ? stockFilter.value : "";
  var consoleModel = consoleFilter ? consoleFilter.value : "";
  var condition = conditionFilter ? conditionFilter.value : "";
  var minPrice = minimumPrice && minimumPrice.value !== "" ? Number(minimumPrice.value) : null;
  var maxPrice = maximumPrice && maximumPrice.value !== "" ? Number(maximumPrice.value) : null;
  var visibleCount = 0;

  cards.forEach(function(card) {
    var productId = card.getAttribute("data-product-id");
    var product = typeof xjGetProductById === "function" ? xjGetProductById(productId) : null;
    var show = !!(productId && !xjIsProductHidden(productId));

    if (show && xjCatalogView !== "all") {
      show = typeof xjIsHomepageProduct === "function" ? xjIsHomepageProduct(product) : true;
    }
    if (show && searching) {
      show = !!matches[productId];
    }

    if (show && category) {
      show = !!(product && (product.displayCategory === category || (product.categories || []).indexOf(category) >= 0));
    }
    if (show && stock === "in" && product && typeof xjGetProductStock === "function") {
      show = !!xjGetProductStock(product.id);
    }
    if (show && stock === "out" && product && typeof xjGetProductStock === "function") {
      show = !xjGetProductStock(product.id);
    }
    if (show && condition) show = !!(product && product.condition === condition);
    if (show && minPrice !== null) show = !!(product && xjGetCatalogPrice(product) >= minPrice);
    if (show && maxPrice !== null) show = !!(product && xjGetCatalogPrice(product) <= maxPrice);
    if (show && consoleModel) {
      var searchableModel = product ? String(product.id + " " + product.name + " " + (product.categories || []).join(" ")).toLowerCase().replace(/[^a-z0-9]+/g, "") : "";
      var modelAliases = {
        ps2: ["ps2", "playstation2"],
        ps3: ["ps3", "playstation3"],
        ps4fat: ["ps4fat", "playstation4fat"],
        ps4slim: ["ps4slim", "playstation4slim"],
        ps4pro: ["ps4pro", "playstation4pro"],
        ps5: ["ps5", "playstation5"],
        nintendoswitchlite: ["nintendoswitchlite", "switchlite"],
        nintendoswitch: ["nintendoswitch", "switch"]
      };
      show = consoleModel === "controllers"
        ? xjGetProductDisplayCategory(product) === "controllers"
        : !!(modelAliases[consoleModel] && modelAliases[consoleModel].some(function(alias) { return searchableModel.indexOf(alias) !== -1; }));
      if (show && consoleModel === "nintendoswitch") {
        show = searchableModel.indexOf("switchlite") === -1;
      }
    }

    card.style.display = show ? "block" : "none";
    if (show) visibleCount += 1;
  });

  var noResults = document.getElementById("searchNoResults");
  var featuredNotice = document.getElementById("featuredSelectionNotice");
  if (featuredNotice) {
    featuredNotice.hidden = xjCatalogView === "all" || xjFeaturedProductIds.length === 6;
  }
  if (noResults) {
    var hasFeaturedSelection = Array.isArray(xjFeaturedProductIds) && xjFeaturedProductIds.length === 6;
    noResults.innerHTML = !searching && xjCatalogView !== "all" && !hasFeaturedSelection
      ? "<strong>Featured products are being set up</strong><span>The XJ Games admin will select six products for the homepage.</span>"
      : searching && xjCatalogView !== "all" && !visibleCount
        ? "<strong>No featured products match</strong><span>Try View All Products to search the full catalog.</span>"
        : "<strong>No products found</strong><span>Try searching for PS4, controllers, Nintendo Switch, or Switch Lite.</span>";
    noResults.style.display = visibleCount ? "none" : "block";
  }
  xjSyncCatalogViewUi();
}

function xjShowAllProductCards() {
  xjApplyStorefrontVisibility();
}

function xjClearSearch() {
  const input = document.getElementById("searchInput");
  if (input) {
    input.value = "";
  }
  xjShowAllProductCards();
  xjHideSearchSuggestions();
  const clearBtn = document.getElementById("searchClearBtn");
  if (clearBtn) {
    clearBtn.style.display = "none";
  }
}

function filterProducts() {
  const input = document.getElementById("searchInput");
  const query = input ? input.value : "";
  xjApplyStorefrontVisibility();
  xjUpdateSearchSuggestions(query);
  const clearBtn = document.getElementById("searchClearBtn");
  if (clearBtn) {
    clearBtn.style.display = xjNormalizeSearchQuery(query) ? "inline-flex" : "none";
  }
}

function xjApplyCatalogFilters() {
  var minimum = document.getElementById("minimumPrice");
  var maximum = document.getElementById("maximumPrice");
  if (minimum && minimum.value !== "" && Number(minimum.value) < 0) {
    minimum.setCustomValidity("Enter a non-negative minimum price.");
    minimum.reportValidity();
    return;
  }
  if (maximum && maximum.value !== "" && Number(maximum.value) < 0) {
    maximum.setCustomValidity("Enter a non-negative maximum price.");
    maximum.reportValidity();
    return;
  }
  minimum && minimum.setCustomValidity("");
  maximum && maximum.setCustomValidity("");
  if (minimum && maximum && minimum.value !== "" && maximum.value !== "" && Number(minimum.value) > Number(maximum.value)) {
    maximum.setCustomValidity("Maximum price must be at least the minimum price.");
    maximum.reportValidity();
    return;
  }
  maximum && maximum.setCustomValidity("");
  xjApplyStorefrontVisibility();
}

function xjResetCatalogFilters() {
  ["categoryFilter", "consoleModelFilter", "stockFilter", "conditionFilter", "minimumPrice", "maximumPrice"].forEach(function(id) {
    var control = document.getElementById(id);
    if (control) control.value = "";
  });
  xjApplyCatalogFilters();
}

function xjUpdateSearchSuggestions(query) {
  const panel = document.getElementById("searchSuggestions");
  if (!panel) return;

  const normalized = xjNormalizeSearchQuery(query);
  if (!normalized) {
    xjHideSearchSuggestions();
    return;
  }

  const matchingIds = xjSearchProducts(query);
  let html = '<div class="search-dropdown-header">Search results</div><div class="search-dropdown-body">';

  if (!matchingIds.length) {
    html += '<div class="search-suggestion-empty">No products found.</div>';
  } else {
    matchingIds.forEach(function(id) {
      const product = xjGetProductById(id);
      if (!product) return;
      const price = xjGetCatalogPrice(product).toLocaleString() + " GMD";
      const thumb = product.image || (product.images && product.images[0]) || "";
      const stockLabel = xjGetProductStock(id) ? "In Stock" : "Out of Stock";
      html +=
        '<button type="button" class="search-suggestion-item" data-product-id="' + id + '">' +
          (thumb ? '<img src="' + thumb + '" alt="">' : '<span class="search-suggestion-fallback">Product</span>') +
          '<span class="search-suggestion-text">' +
            '<strong>' + product.name + '</strong>' +
            '<small>' + price + ' | ' + stockLabel + '</small>' +
          '</span>' +
        '</button>';
    });
  }

  html += '</div>';
  panel.innerHTML = html;
  panel.querySelectorAll(".search-suggestion-item").forEach(function(item) {
    item.addEventListener("mousedown", function(event) {
      event.preventDefault();
      xjSelectSearchSuggestion(item.getAttribute("data-product-id"));
    });
  });

  panel.classList.add("active");
  panel.setAttribute("aria-hidden", "false");
  xjPositionSearchDropdown();
}

function xjHideSearchSuggestions() {
  const panel = document.getElementById("searchSuggestions");
  if (!panel) return;
  panel.classList.remove("active");
  panel.setAttribute("aria-hidden", "true");
}

function xjPositionSearchDropdown() {
  const panel = document.getElementById("searchSuggestions");
  const search = document.querySelector(".search");
  if (!panel || !search || !panel.classList.contains("active")) return;

  const rect = search.getBoundingClientRect();
  const width = Math.max(rect.width, Math.min(380, window.innerWidth - 24));
  let left = rect.left;
  if (left + width > window.innerWidth - 12) {
    left = Math.max(12, window.innerWidth - width - 12);
  }

  panel.style.top = (rect.bottom + 8) + "px";
  panel.style.left = left + "px";
  panel.style.width = width + "px";
}

function xjSelectSearchSuggestion(productId) {
  xjHideSearchSuggestions();
  const input = document.getElementById("searchInput");
  const product = xjGetProductById(productId);
  if (input && product) {
    input.value = product.name;
  }
  if (product && typeof xjIsHomepageProduct === "function" && !xjIsHomepageProduct(product)) {
    if (typeof window.xjOpenDescription === "function") window.xjOpenDescription(productId);
    return;
  }

  xjShowAllProductCards();
  const card = document.querySelector('#productGrid .card[data-product-id="' + productId + '"]');
  if (!card) return;

  card.scrollIntoView({ behavior: "smooth", block: "center" });
  card.classList.add("xj-search-highlight");
  setTimeout(function() {
    card.classList.remove("xj-search-highlight");
  }, 1600);
}

function xjInitSearchSuggestions() {
  const input = document.getElementById("searchInput");
  const panel = document.getElementById("searchSuggestions");
  if (new URLSearchParams(location.search).get("allProductsEmbedded") === "1") {
    document.querySelectorAll('a[href="all-products.html"]').forEach(function(link) { link.remove(); });
    var allProductsLink = document.getElementById("catalogViewToggle");
    if (allProductsLink) allProductsLink.remove();
    var searchContainer = document.querySelector(".search");
    var productsSection = document.getElementById("products");
    if (searchContainer && productsSection) {
      searchContainer.classList.add("xj-embedded-search");
      productsSection.insertBefore(searchContainer, productsSection.firstChild);
    }
  }
  if (location.hash === "#all-products") {
    xjCatalogView = "all";
  }
  xjSyncCatalogViewUi();
  window.addEventListener("hashchange", function() {
    if (location.hash === "#all-products") xjSetCatalogView("all", { skipHash: true });
    else if (location.hash === "#products") xjSetCatalogView("featured", { skipHash: true });
  });
  if (!input || !panel) return;

  if (panel.parentElement !== document.body) {
    document.body.appendChild(panel);
  }

  input.setAttribute("autocomplete", "off");
  input.oninput = filterProducts;

  input.addEventListener("focus", function() {
    if (xjNormalizeSearchQuery(input.value)) {
      xjUpdateSearchSuggestions(input.value);
    }
  });

  input.addEventListener("keydown", function(event) {
    if (event.key === "Enter") {
      event.preventDefault();
    }
    if (event.key === "Escape") {
      xjHideSearchSuggestions();
    }
  });

  document.addEventListener("click", function(event) {
    const search = document.querySelector(".search");
    if (!search || !panel) return;
    if (!search.contains(event.target) && !panel.contains(event.target)) {
      xjHideSearchSuggestions();
    }
  });

  window.addEventListener("resize", xjPositionSearchDropdown);
  window.addEventListener("scroll", xjPositionSearchDropdown, true);
}

function normalizedQueryExists(query) {
  return xjNormalizeSearchQuery(query).length > 0;
}

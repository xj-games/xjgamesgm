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
    return allIds;
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

function xjShowAllProductCards() {
  document.querySelectorAll("#productGrid .card").forEach(function(card) {
    var productId = card.getAttribute("data-product-id");
    card.style.display = productId && xjIsProductHidden(productId) ? "none" : "block";
  });
  const noResults = document.getElementById("searchNoResults");
  if (noResults) {
    noResults.style.display = "none";
  }
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
  xjShowAllProductCards();
  const input = document.getElementById("searchInput");
  const query = input ? input.value : "";
  xjUpdateSearchSuggestions(query);
  const clearBtn = document.getElementById("searchClearBtn");
  if (clearBtn) {
    clearBtn.style.display = xjNormalizeSearchQuery(query) ? "inline-flex" : "none";
  }
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
      const price = Number(product.price).toLocaleString() + " GMD";
      const thumb = product.image || (product.images && product.images[0]) || "";
      const stockLabel = xjGetProductStock(id) ? "In Stock" : "Out of Stock";
      html +=
        '<button type="button" class="search-suggestion-item" data-product-id="' + id + '">' +
          (thumb ? '<img src="' + thumb + '" alt="">' : '<span class="search-suggestion-fallback">ðŸŽ®</span>') +
          '<span class="search-suggestion-text">' +
            '<strong>' + product.name + '</strong>' +
            '<small>' + price + ' Â· ' + stockLabel + '</small>' +
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

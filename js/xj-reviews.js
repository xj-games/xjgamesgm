/**
 * XJ Games — Firestore-backed reviews with auth guard
 */

const XJ_DEFAULT_REVIEWS = [
  {
    name: "Ousman Jallow",
    rating: 5,
    text: "Amazing service! Received my PS4 Slim in Banjul within hours. Fully tested and works perfectly.",
    avatar: "https://www.svgrepo.com/show/498369/profile-circle.svg"
  },
  {
    name: "Fatou Njie",
    rating: 5,
    text: "Very reliable store. Bought a Nintendo Switch Lite for my brother and he loves it.",
    avatar: "https://www.svgrepo.com/show/498369/profile-circle.svg"
  }
];

var xjReviewsUnsubscribe = null;
var xjReviewRows = [];
var xjReviewsExpanded = false;

function xjInitReviews() {
  if (!xjDb || !xjIsFirebaseConfigured()) {
    renderReviewsFromLocal();
    return;
  }

  xjSubscribeToReviews();
}

function xjSubscribeToReviews() {
  if (xjReviewsUnsubscribe) {
    xjReviewsUnsubscribe();
  }

  xjReviewsUnsubscribe = xjDb.collection("reviews")
    .orderBy("createdAt", "desc")
    .onSnapshot(function(snapshot) {
      const reviews = [];
      snapshot.forEach(function(doc) {
        const data = doc.data();
        if (data && !data.isSeed) {
          reviews.push(data);
        }
      });
      xjRenderReviews(reviews.concat(XJ_DEFAULT_REVIEWS));
    }, function(error) {
      console.error("Reviews listener error:", error);
      renderReviewsFromLocal();
    });
}

function renderReviewsFromLocal() {
  const stored = JSON.parse(localStorage.getItem("xj_reviews") || "[]");
  xjRenderReviews(stored.concat(XJ_DEFAULT_REVIEWS));
}

function renderReviews() {
  /* kept for backward compatibility — Firestore listener handles rendering */
}

function xjRenderReviews(reviews) {
  const grid = document.getElementById("reviewGrid");
  if (!grid) return;
  xjReviewRows = Array.isArray(reviews) ? reviews : [];
  const visibleReviews = xjReviewsExpanded ? xjReviewRows : xjReviewRows.slice(0, 3);
  const rows = visibleReviews.map(function(rev) {
    const rating = Math.max(1, Math.min(5, Number(rev.rating) || 5));
    const name = xjEscapeHtml(rev.name || "Customer");
    const text = xjEscapeHtml(rev.text || "");
    const avatar = xjEscapeHtml(rev.avatar || "https://www.svgrepo.com/show/498369/profile-circle.svg");
    const rawDate = rev.createdAt && typeof rev.createdAt.toDate === "function"
      ? rev.createdAt.toDate()
      : rev.createdAt ? new Date(rev.createdAt) : null;
    const date = rawDate && !Number.isNaN(rawDate.getTime()) ? rawDate.toLocaleDateString() : "";
    return "<tr>" +
      '<td class="review-rating" aria-label="' + rating + ' out of 5">' + "★".repeat(rating) + "<span class=\"review-rating-number\"> " + rating + "/5</span></td>" +
      '<td><span class="review-customer"><img src="' + avatar + '" alt=""><span>' + name + '<small>Customer</small></span></span></td>' +
      '<td class="review-text">' + text + "</td>" +
      '<td class="review-date">' + date + "</td>" +
      "</tr>";
  }).join("");
  grid.innerHTML = "<thead><tr><th scope=\"col\">Rating</th><th scope=\"col\">Customer</th><th scope=\"col\">Review</th><th scope=\"col\">Date</th></tr></thead><tbody>" + rows + "</tbody>";

  const toggle = document.getElementById("reviewsToggle");
  if (toggle) {
    toggle.hidden = xjReviewRows.length <= 3;
    toggle.textContent = xjReviewsExpanded ? "Show fewer reviews" : "See all reviews (" + xjReviewRows.length + ")";
    toggle.setAttribute("aria-expanded", xjReviewsExpanded ? "true" : "false");
  }
}

function xjToggleAllReviews() {
  xjReviewsExpanded = !xjReviewsExpanded;
  xjRenderReviews(xjReviewRows);
}

window.xjToggleAllReviews = xjToggleAllReviews;

async function submitReview() {
  if (!xjRequireAuth("Please sign in to leave a review.")) {
    return;
  }

  const rating = parseInt(document.getElementById("reviewRating").value, 10);
  const text = document.getElementById("reviewText").value.trim();

  if (!text) {
    showToast("Error", "Please write your feedback before publishing.", "error");
    return;
  }

  const user = xjGetCurrentUserDisplay();
  const review = {
    userId: user.uid,
    name: user.name,
    rating: rating,
    text: text,
    avatar: user.avatar,
    createdAt: Date.now()
  };

  if (xjDb && xjIsFirebaseConfigured()) {
    try {
      await xjDb.collection("reviews").add({
        userId: user.uid,
        name: user.name,
        rating: rating,
        text: text,
        avatar: user.avatar,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      document.getElementById("reviewText").value = "";
      showToast("Success", "Your review has been published!");
    } catch (error) {
      console.error("Review submit error:", error);
      showToast("Error", "Could not publish review. Please try again.", "error");
    }
    return;
  }

  const stored = JSON.parse(localStorage.getItem("xj_reviews") || "[]");
  stored.unshift(review);
  localStorage.setItem("xj_reviews", JSON.stringify(stored));
  document.getElementById("reviewText").value = "";
  renderReviewsFromLocal();
  showToast("Review saved", "Your review is saved on this device. Connect Firebase so every visitor can see it.");
}

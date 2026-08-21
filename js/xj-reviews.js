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

function xjEscapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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
  let html = "";

  reviews.forEach(function(rev) {
    const stars = "⭐".repeat(rev.rating || 5);
    const name = xjEscapeHtml(rev.name || "Customer");
    const text = xjEscapeHtml(rev.text || "");
    const avatar = xjEscapeHtml(rev.avatar || "https://www.svgrepo.com/show/498369/profile-circle.svg");
    html +=
      '<div class="review">' +
        '<div>' +
          '<div style="color:#ffcc00; font-size:14px; margin-bottom:8px;">' + stars + '</div>' +
          '<p>' + text + '</p>' +
        '</div>' +
        '<div class="review-author-info">' +
          '<img src="' + avatar + '" alt="' + name + '">' +
          '<div>' +
            '<h4>' + name + '</h4>' +
            '<span style="font-size:11px; color:#888;">Verified Customer</span>' +
          '</div>' +
        '</div>' +
      '</div>';
  });

  grid.innerHTML = html;
}

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

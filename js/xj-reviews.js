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

function xjInitReviews() {
  if (!xjDb || !xjIsFirebaseConfigured()) {
    renderReviewsFromLocal();
    return;
  }

  xjSeedDefaultReviewsIfNeeded().catch(function(error) {
    console.warn("Could not seed default reviews:", error);
  });
  xjSubscribeToReviews();
}

async function xjSeedDefaultReviewsIfNeeded() {
  const snap = await xjDb.collection("reviews").limit(1).get();
  if (!snap.empty) return;

  const batch = xjDb.batch();
  XJ_DEFAULT_REVIEWS.forEach(function(review, index) {
    const ref = xjDb.collection("reviews").doc("seed-" + index);
    batch.set(ref, {
      name: review.name,
      rating: review.rating,
      text: review.text,
      avatar: review.avatar,
      isSeed: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  });
  await batch.commit();
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
        reviews.push(doc.data());
      });
      xjRenderReviews(reviews.length ? reviews : XJ_DEFAULT_REVIEWS);
    }, function(error) {
      console.error("Reviews listener error:", error);
      renderReviewsFromLocal();
    });
}

function renderReviewsFromLocal() {
  const reviews = JSON.parse(localStorage.getItem("xj_reviews")) || XJ_DEFAULT_REVIEWS;
  xjRenderReviews(reviews);
}

function renderReviews() {
  /* kept for backward compatibility — Firestore listener handles rendering */
}

function xjRenderReviews(reviews) {
  const grid = document.getElementById("reviewGrid");
  let html = "";

  reviews.forEach(function(rev) {
    const stars = "⭐".repeat(rev.rating || 5);
    html +=
      '<div class="review">' +
        '<div>' +
          '<div style="color:#ffcc00; font-size:14px; margin-bottom:8px;">' + stars + '</div>' +
          '<p>' + rev.text + '</p>' +
        '</div>' +
        '<div class="review-author-info">' +
          '<img src="' + (rev.avatar || "https://www.svgrepo.com/show/498369/profile-circle.svg") + '" alt="' + rev.name + '">' +
          '<div>' +
            '<h4>' + rev.name + '</h4>' +
            '<span style="font-size:11px; color:#888;">Verified Customer</span>' +
          '</div>' +
        '</div>' +
      '</div>';
  });

  grid.innerHTML = html;
}

async function submitReview() {
  if (!xjRequireAuth("Error: Please sign in to leave a comment.")) {
    return;
  }

  const rating = parseInt(document.getElementById("reviewRating").value, 10);
  const text = document.getElementById("reviewText").value.trim();

  if (!text) {
    showToast("Error", "Please write your feedback before publishing.", "error");
    return;
  }

  const user = xjGetCurrentUserDisplay();

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
  } else {
    console.error("Review submit blocked: Firebase is not configured.");
    showToast("Error", "Reviews require Firebase authentication. Please try again after sign-in is configured.", "error");
  }
}

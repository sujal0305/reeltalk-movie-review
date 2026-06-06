
const API_KEY  = "64e3e9a215b5f0db54ef89828253e10d";  // ← PASTE YOUR KEY HERE
const BASE     = "https://api.themoviedb.org/3";
const IMG      = "https://image.tmdb.org/t/p";

// ── State ─────────────────────────────────────────────────
let reviews     = JSON.parse(localStorage.getItem("reeltalk_reviews") || "{}");
let currentPage = 1;
let currentCat  = "popular";
let currentQuery= "";
let currentMovieId = null;
let editingReview  = false;
let selectedRating = 0;
let selectedTags   = [];

// ── DOM Refs ──────────────────────────────────────────────
const movieGrid    = document.getElementById("movieGrid");
const myReviewsGrid= document.getElementById("myReviewsGrid");
const overlay      = document.getElementById("overlay");
const toast        = document.getElementById("toast");
const reviewBadge  = document.getElementById("reviewBadge");
const charCount    = document.getElementById("charCount");

// ── Helpers ───────────────────────────────────────────────
async function api(endpoint, params = {}) {
  const p = new URLSearchParams({ api_key: API_KEY, language: "en-US", ...params });
  const r = await fetch(`${BASE}${endpoint}?${p}`);
  return r.json();
}

function img(path, size = "w342") {
  return path ? `${IMG}/${size}${path}` : "https://via.placeholder.com/342x513/1a1208/d4a017?text=No+Poster";
}

function stars(n) { return "★".repeat(n) + "☆".repeat(5 - n); }

function saveReviews() { localStorage.setItem("reeltalk_reviews", JSON.stringify(reviews)); }

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove("show"), 2600);
}

function updateStats() {
  const all = Object.values(reviews);
  document.getElementById("statReviews").textContent = all.length;
  document.getElementById("statMovies").textContent  = all.length;
  reviewBadge.textContent = all.length;
  if (all.length) {
    const avg = (all.reduce((s, r) => s + r.rating, 0) / all.length).toFixed(1);
    document.getElementById("statAvg").textContent = `${avg}★`;
  } else {
    document.getElementById("statAvg").textContent = "—";
  }
}

// ── Movie Loading ─────────────────────────────────────────
async function loadMovies(cat, page = 1, append = false) {
  if (!append) showSkeletons(12);
  let data;
  try {
    if (cat === "search" && currentQuery) {
      data = await api("/search/movie", { query: currentQuery, page });
    } else {
      data = await api(`/movie/${cat}`, { page });
    }
    renderMovies(data.results || [], append);
    document.getElementById("loadMoreBtn").disabled = page >= (data.total_pages || 1);
  } catch (e) {
    showToast("⚠ Could not load movies. Check your API key.");
  }
}

function renderMovies(movies, append = false) {
  if (!append) movieGrid.innerHTML = "";
  if (!movies.length) {
    movieGrid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--muted)">No results found.</div>`;
    return;
  }
  movies.forEach((m, i) => {
    const card = createMovieCard(m);
    card.style.animationDelay = `${(i % 12) * 0.04}s`;
    movieGrid.appendChild(card);
  });
}

function createMovieCard(m) {
  const hasReview = !!reviews[m.id];
  const userR     = hasReview ? reviews[m.id].rating : 0;
  const card = document.createElement("div");
  card.className = "movie-card";
  card.innerHTML = `
    <div class="card-poster">
      <img src="${img(m.poster_path)}" alt="${m.title}" loading="lazy"/>
      ${hasReview ? `<span class="card-reviewed-badge">✓ Reviewed</span>` : ""}
      <span class="card-rating">⭐ ${m.vote_average?.toFixed(1) || "N/A"}</span>
      <div class="card-overlay">
        <button class="overlay-btn">${hasReview ? "✏ Edit Review" : "✍ Write Review"}</button>
      </div>
    </div>
    <div class="card-body">
      <div class="card-title">${m.title}</div>
      <div class="card-year">${m.release_date?.slice(0,4) || "—"}</div>
      ${userR ? `<div class="card-user-rating">${"★".repeat(userR)}${"☆".repeat(5-userR)} <span style="font-size:0.7rem;color:var(--muted);margin-left:4px">Your rating</span></div>` : ""}
    </div>
  `;
  card.querySelector(".overlay-btn").addEventListener("click", () => openModal(m));
  card.querySelector(".card-body").addEventListener("click", () => openModal(m));
  return card;
}

// ── Modal ─────────────────────────────────────────────────
async function openModal(m) {
  currentMovieId = m.id;
  editingReview  = false;
  selectedRating = 0;
  selectedTags   = [];

  overlay.classList.add("open");
  document.body.style.overflow = "hidden";

  // Populate movie info
  document.getElementById("mPoster").src     = img(m.poster_path);
  document.getElementById("mTitle").textContent = m.title;
  document.getElementById("mOverview").textContent = m.overview || "No description.";
  document.getElementById("mMeta").innerHTML = `
    <span class="gold">⭐ ${m.vote_average?.toFixed(1) || "N/A"}</span>
    <span>📅 ${m.release_date?.slice(0,4) || "—"}</span>
  `;

  // Try to get more details
  try {
    const detail = await api(`/movie/${m.id}`);
    const runtime = detail.runtime ? `${Math.floor(detail.runtime/60)}h ${detail.runtime%60}m` : "";
    document.getElementById("mMeta").innerHTML = `
      <span class="gold">⭐ ${detail.vote_average?.toFixed(1) || "N/A"}</span>
      <span>📅 ${detail.release_date?.slice(0,4) || "—"}</span>
      ${runtime ? `<span>⏱ ${runtime}</span>` : ""}
    `;
  } catch(e) {}

  // Check existing review
  showReviewSection(m.id);
}

function showReviewSection(movieId) {
  const existing = reviews[movieId];
  const existingEl = document.getElementById("reviewExisting");
  const formEl     = document.getElementById("reviewForm");

  if (existing && !editingReview) {
    existingEl.style.display = "block";
    document.getElementById("existingStars").textContent = stars(existing.rating);
    document.getElementById("existingText").textContent  = existing.text || "";
    document.getElementById("existingDate").textContent  = `By ${existing.name} · ${existing.date}`;
    document.getElementById("formTitle").textContent = "Update Your Review";

    // Show form below with pre-filled data
    prefillForm(existing);
    formEl.style.display = "block";

    document.getElementById("editReviewBtn").onclick = () => {
      editingReview = true;
      prefillForm(existing);
      showToast("Edit your review below ✏");
    };
    document.getElementById("deleteReviewBtn").onclick = () => {
      if (confirm("Delete this review?")) {
        delete reviews[movieId];
        saveReviews();
        updateStats();
        showToast("🗑 Review deleted");
        overlay.classList.remove("open");
        document.body.style.overflow = "";
        refreshCurrentView();
      }
    };
  } else {
    existingEl.style.display = "none";
    document.getElementById("formTitle").textContent = "Write Your Review";
    resetForm();
    formEl.style.display = "block";
  }
}

function prefillForm(r) {
  selectedRating = r.rating;
  selectedTags   = [...(r.tags || [])];
  document.getElementById("reviewerName").value = r.name || "";
  document.getElementById("reviewTitle").value  = r.title || "";
  document.getElementById("reviewText").value   = r.text || "";
  charCount.textContent = (r.text || "").length;
  updateStarUI(r.rating);
  document.querySelectorAll(".tag-opt").forEach(btn => {
    btn.classList.toggle("selected", selectedTags.includes(btn.dataset.tag));
  });
  updateRatingLabel(r.rating);
}

function resetForm() {
  selectedRating = 0; selectedTags = [];
  document.getElementById("reviewerName").value = "";
  document.getElementById("reviewTitle").value  = "";
  document.getElementById("reviewText").value   = "";
  charCount.textContent = "0";
  updateStarUI(0);
  updateRatingLabel(0);
  document.querySelectorAll(".tag-opt").forEach(b => b.classList.remove("selected"));
}

// Star input
document.querySelectorAll(".star").forEach(star => {
  star.addEventListener("click", () => {
    selectedRating = parseInt(star.dataset.v);
    updateStarUI(selectedRating);
    updateRatingLabel(selectedRating);
  });
  star.addEventListener("mouseenter", () => updateStarUI(parseInt(star.dataset.v)));
  star.addEventListener("mouseleave", () => updateStarUI(selectedRating));
});

function updateStarUI(val) {
  document.querySelectorAll(".star").forEach(s => {
    s.classList.toggle("active", parseInt(s.dataset.v) <= val);
  });
}

const ratingLabels = ["", "Poor — Not worth it", "Fair — Has some moments", "Good — Worth watching", "Great — Highly recommended", "Masterpiece — Must watch!"];
function updateRatingLabel(val) {
  document.getElementById("ratingLabel").textContent = val ? ratingLabels[val] : "Click a star to rate";
}

// Tag selection
document.querySelectorAll(".tag-opt").forEach(btn => {
  btn.addEventListener("click", () => {
    const tag = btn.dataset.tag;
    if (selectedTags.includes(tag)) {
      selectedTags = selectedTags.filter(t => t !== tag);
      btn.classList.remove("selected");
    } else {
      if (selectedTags.length < 3) { selectedTags.push(tag); btn.classList.add("selected"); }
      else showToast("Max 3 tags");
    }
  });
});

// Char count
document.getElementById("reviewText").addEventListener("input", function() {
  charCount.textContent = this.value.length;
});

// Submit review
document.getElementById("submitReview").addEventListener("click", () => {
  if (!selectedRating) { showToast("⚠ Please select a star rating"); return; }
  const name = document.getElementById("reviewerName").value.trim() || "Anonymous";
  const title= document.getElementById("reviewTitle").value.trim();
  const text = document.getElementById("reviewText").value.trim();
  if (!text) { showToast("⚠ Please write a review"); return; }

  const now = new Date().toLocaleDateString("en-US", { year:"numeric", month:"short", day:"numeric" });
  reviews[currentMovieId] = { rating: selectedRating, name, title, text, tags: selectedTags, date: now, movieId: currentMovieId };
  saveReviews();
  updateStats();
  showToast("✅ Review published!");
  overlay.classList.remove("open");
  document.body.style.overflow = "";
  refreshCurrentView();
});

// ── My Reviews Tab ────────────────────────────────────────
function renderMyReviews() {
  const all = Object.values(reviews);
  const sort = document.getElementById("sortReviews").value;
  const sorted = [...all].sort((a, b) => {
    if (sort === "newest")  return new Date(b.date) - new Date(a.date);
    if (sort === "oldest")  return new Date(a.date) - new Date(b.date);
    if (sort === "highest") return b.rating - a.rating;
    if (sort === "lowest")  return a.rating - b.rating;
    return 0;
  });

  myReviewsGrid.innerHTML = "";
  if (!sorted.length) {
    myReviewsGrid.innerHTML = `
      <div class="no-reviews">
        <h3>No reviews yet</h3>
        <p>Browse movies and write your first review!</p>
      </div>`;
    return;
  }

  sorted.forEach((r, i) => {
    const card = document.createElement("div");
    card.className = "review-card";
    card.style.animationDelay = `${i * 0.05}s`;
    card.innerHTML = `
      <img class="rc-poster" src="${r.posterPath || "https://via.placeholder.com/90x135/1a1208/d4a017?text=🎬"}" alt=""/>
      <div class="rc-body">
        <div class="rc-movie">${r.movieTitle || "Movie"}</div>
        <div class="rc-stars">${stars(r.rating)}</div>
        ${r.title ? `<div class="rc-rtitle">"${r.title}"</div>` : ""}
        <div class="rc-text">${r.text}</div>
        ${r.tags?.length ? `<div class="rc-tags">${r.tags.map(t => `<span class="rc-tag">${t}</span>`).join("")}</div>` : ""}
        <div class="rc-footer">
          <span class="rc-date">By ${r.name} · ${r.date}</span>
          <div class="rc-actions">
            <button class="rc-del" data-id="${r.movieId}">🗑 Delete</button>
          </div>
        </div>
      </div>
    `;
    card.querySelector(".rc-del").addEventListener("click", () => {
      if (confirm("Delete this review?")) {
        delete reviews[r.movieId];
        saveReviews(); updateStats(); renderMyReviews();
        showToast("🗑 Review deleted");
      }
    });
    myReviewsGrid.appendChild(card);
  });
}

// Store movie title + poster when opening modal for reviews
const _openModal = openModal;
openModal = async function(m) {
  // Enrich review data with movie details
  if (reviews[m.id]) {
    reviews[m.id].movieTitle  = m.title;
    reviews[m.id].posterPath  = img(m.poster_path, "w92");
    saveReviews();
  }
  await _openModal(m);
};

function refreshCurrentView() {
  const activeTab = document.querySelector(".tab-btn.active").dataset.tab;
  if (activeTab === "myreviews") renderMyReviews();
  else loadMovies(currentCat, currentPage);
}

// ── Close modal ───────────────────────────────────────────
document.getElementById("closeModal").addEventListener("click", closeModal);
overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
function closeModal() {
  overlay.classList.remove("open");
  document.body.style.overflow = "";
}

// ── Tab switching ─────────────────────────────────────────
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
    const tab = btn.dataset.tab;
    document.getElementById(tab === "browse" ? "browseSection" : "reviewsSection").classList.add("active");
    if (tab === "myreviews") renderMyReviews();
  });
});

// ── Filter buttons ────────────────────────────────────────
document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentCat   = btn.dataset.cat;
    currentPage  = 1;
    currentQuery = "";
    document.getElementById("searchInput").value = "";
    loadMovies(currentCat, 1);
  });
});

// ── Search ────────────────────────────────────────────────
document.getElementById("searchBtn").addEventListener("click", doSearch);
document.getElementById("searchInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") doSearch();
});
function doSearch() {
  const q = document.getElementById("searchInput").value.trim();
  if (!q) return;
  currentQuery = q; currentCat = "search"; currentPage = 1;
  document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
  loadMovies("search", 1);
}

// ── Load more ─────────────────────────────────────────────
document.getElementById("loadMoreBtn").addEventListener("click", () => {
  currentPage++;
  loadMovies(currentCat, currentPage, true);
});

// ── Sort reviews ──────────────────────────────────────────
document.getElementById("sortReviews").addEventListener("change", renderMyReviews);

// ── Skeletons ─────────────────────────────────────────────
function showSkeletons(n) {
  movieGrid.innerHTML = Array(n).fill("")
    .map(() => `<div class="skeleton skeleton-card"></div>`).join("");
}

// ── Init ──────────────────────────────────────────────────
updateStats();
loadMovies("popular", 1);

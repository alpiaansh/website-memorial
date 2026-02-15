const memorialDataEl = document.getElementById("memorialData");
const memorialPhotos = (() => {
  try {
    const parsed = JSON.parse(memorialDataEl?.textContent || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
})();

const photoGrid = document.getElementById("photoGrid");
const timelineList = document.getElementById("timelineList");
const storyModal = document.getElementById("storyModal");
const modalPanel = document.getElementById("modalPanel");
const modalPhoto = document.getElementById("modalPhoto");
const modalTitle = document.getElementById("modalTitle");
const modalMeta = document.getElementById("modalMeta");
const modalStory = document.getElementById("modalStory");
const modalGallery = document.getElementById("modalGallery");
const modalContent = document.querySelector(".modal-content");
const closeModalBtn = document.getElementById("closeModal");
const fullScreenBtn = document.getElementById("fullScreenBtn");
const navLinks = [...document.querySelectorAll(".nav-link")];
const AUTO_SLIDE_MS = 2800;
const HERO_SLIDE_MS = 3500;
const heroSection = document.querySelector(".hero");
const commentList = document.getElementById("commentList");
const commentForm = document.getElementById("commentForm");
const commentInput = document.getElementById("commentInput");
const commentLoginHint = document.getElementById("commentLoginHint");
const loginLink = document.getElementById("loginLink");
const cfg = window.APP_CONFIG || {};
const supabaseUrl = String(cfg.SUPABASE_URL || "").trim();
const supabaseAnonKey = String(cfg.SUPABASE_ANON_KEY || "").trim();
const supabaseClient =
  window.supabase && supabaseUrl && supabaseAnonKey
    ? window.supabase.createClient(supabaseUrl, supabaseAnonKey)
    : null;

const monthOrder = {
  Januari: 0,
  Februari: 1,
  Maret: 2,
  April: 3,
  Mei: 4,
  Juni: 5,
  Juli: 6,
  Agustus: 7,
  September: 8,
  Oktober: 9,
  November: 10,
  Desember: 11
};

let currentGallery = [];
let currentImageIndex = 0;
let autoSlideTimer = null;
let cinemaEligible = false;
let heroSlideTimer = null;
let currentMemorialKey = "";
let currentUser = null;
let pageScrollY = 0;

const escapeHtml = (value) =>
  String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const toMemorialKey = (item) => {
  const base = `${item.title || ""}-${item.year || ""}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "memorial-item";
};

const parseLocalDate = (label) => {
  const [monthName, year] = label.split(" ");
  return new Date(Number(year), monthOrder[monthName] ?? 0, 1).getTime();
};

const setModalImage = (index = 0) => {
  if (currentGallery.length === 0) {
    return;
  }

  currentImageIndex = Math.max(0, Math.min(index, currentGallery.length - 1));
  modalPhoto.style.backgroundImage = `url('${currentGallery[currentImageIndex]}')`;
  modalPanel.style.setProperty("--story-bg", `url('${currentGallery[currentImageIndex]}')`);

  const thumbs = [...modalGallery.querySelectorAll(".modal-thumb")];
  thumbs.forEach((thumb, thumbIndex) => {
    thumb.classList.toggle("active", thumbIndex === currentImageIndex);
  });
};

const startHeroCoverSlide = () => {
  if (!heroSection) {
    return;
  }

  const heroCovers = memorialPhotos
    .map((item) => item.cover)
    .filter((url) => typeof url === "string" && url.trim().length > 0);

  if (heroCovers.length === 0) {
    return;
  }

  let heroIndex = 0;
  heroSection.style.setProperty("--hero-image", `url('${heroCovers[heroIndex]}')`);

  if (heroCovers.length === 1) {
    return;
  }

  if (heroSlideTimer) {
    clearInterval(heroSlideTimer);
  }

  heroSlideTimer = setInterval(() => {
    heroIndex = (heroIndex + 1) % heroCovers.length;
    heroSection.style.setProperty("--hero-image", `url('${heroCovers[heroIndex]}')`);
  }, HERO_SLIDE_MS);
};

const updateCinemaMode = () => {
  if (!cinemaEligible) {
    storyModal.classList.remove("cinema-mode");
    return;
  }

  const shouldEnable = modalContent.scrollTop > 70;
  storyModal.classList.toggle("cinema-mode", shouldEnable);
};

const stopAutoSlide = () => {
  if (autoSlideTimer) {
    clearInterval(autoSlideTimer);
    autoSlideTimer = null;
  }
};

const startAutoSlide = () => {
  stopAutoSlide();
  if (currentGallery.length <= 1) {
    return;
  }

  autoSlideTimer = setInterval(() => {
    const nextIndex = (currentImageIndex + 1) % currentGallery.length;
    setModalImage(nextIndex);
  }, AUTO_SLIDE_MS);
};

const lockPageScroll = () => {
  pageScrollY = window.scrollY || window.pageYOffset || 0;
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
  document.body.style.touchAction = "none";
};

const unlockPageScroll = () => {
  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";
  document.body.style.touchAction = "";
  requestAnimationFrame(() => {
    const currentY = window.scrollY || window.pageYOffset || 0;
    if (Math.abs(currentY - pageScrollY) > 2) {
      window.scrollTo(0, pageScrollY);
    }
  });
};

const renderModalGallery = () => {
  modalGallery.innerHTML = "";
  currentGallery.forEach((imageUrl, index) => {
    const thumb = document.createElement("button");
    thumb.type = "button";
    thumb.className = "modal-thumb";
    thumb.setAttribute("aria-label", `Pilih foto ${index + 1}`);
    thumb.innerHTML = `<img src="${imageUrl}" alt="Pilihan foto ${index + 1}">`;
    thumb.addEventListener("click", () => {
      setModalImage(index);
      startAutoSlide();
    });
    modalGallery.appendChild(thumb);
  });
};

const setCommentUiState = () => {
  const loggedIn = Boolean(currentUser);
  if (commentInput) {
    commentInput.disabled = !loggedIn;
    commentInput.placeholder = loggedIn
      ? "Tulis komentar untuk memorial ini..."
      : "Login dulu untuk kirim komentar.";
  }

  if (commentLoginHint) {
    commentLoginHint.textContent = loggedIn
      ? `Login sebagai ${currentUser.user_metadata?.full_name || currentUser.email || "User"}`
      : "Login untuk komentar";
  }

  if (loginLink) {
    loginLink.textContent = loggedIn ? "Akun" : "Login";
  }
};

const loadCurrentUser = async () => {
  if (!supabaseClient) {
    currentUser = null;
    setCommentUiState();
    return;
  }

  const { data } = await supabaseClient.auth.getUser();
  currentUser = data?.user || null;
  setCommentUiState();
};

const renderComments = (comments) => {
  if (!commentList) {
    return;
  }

  commentList.innerHTML = "";
  if (!comments || comments.length === 0) {
    commentList.innerHTML = '<div class="comment-item"><p class="comment-text">Belum ada komentar.</p></div>';
    return;
  }

  comments.forEach((comment) => {
    const created = new Date(comment.created_at || Date.now()).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
    const userLabel = comment.user_name || "Anonim";
    const item = document.createElement("article");
    item.className = "comment-item";
    item.innerHTML = `
      <p class="comment-meta">${escapeHtml(userLabel)} - ${created}</p>
      <p class="comment-text">${escapeHtml(comment.content)}</p>
    `;
    commentList.appendChild(item);
  });
};

const fetchComments = async (memorialKey) => {
  if (!supabaseClient || !memorialKey) {
    renderComments([]);
    return;
  }

  const { data, error } = await supabaseClient
    .from("memorial_comments")
    .select("content,user_name,created_at")
    .eq("memorial_key", memorialKey)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    renderComments([]);
    return;
  }

  renderComments(data || []);
};

const openStory = (item) => {
  currentGallery = Array.isArray(item.gallery) && item.gallery.length > 0 ? item.gallery : [item.cover];
  currentMemorialKey = toMemorialKey(item);
  modalTitle.textContent = item.title;
  modalMeta.textContent = item.year;
  modalStory.innerHTML = item.story.replace(/\n/g, "<br>");
  renderModalGallery();
  setModalImage(0);
  storyModal.classList.remove("cinema-mode");
  modalContent.scrollTop = 0;
  startAutoSlide();
  storyModal.classList.add("show");
  lockPageScroll();
  requestAnimationFrame(() => {
    const storyIsLong =
      modalStory.textContent.trim().length > 320 ||
      modalStory.scrollHeight > modalContent.clientHeight + 120;
    cinemaEligible = storyIsLong;
    updateCinemaMode();
  });
  fetchComments(currentMemorialKey);
};

const closeStory = () => {
  stopAutoSlide();
  storyModal.classList.remove("show");
  storyModal.classList.remove("cinema-mode");
  cinemaEligible = false;
  modalContent.scrollTop = 0;
  unlockPageScroll();
};

const createCard = (item, index) => {
  const button = document.createElement("button");
  button.className = "photo-card";
  button.type = "button";
  button.setAttribute("aria-label", "Buka cerita " + item.title);
  button.dataset.index = index;

  button.innerHTML = `
    <img src="${item.cover}" alt="${item.title}">
    <div class="card-copy">
      <h3>${item.title}</h3>
      <p>${item.short}</p>
    </div>
  `;

  button.addEventListener("click", () => openStory(item));
  return button;
};

const createTimelineItem = (item) => {
  const row = document.createElement("article");
  row.className = "timeline-item";

  row.innerHTML = `
    <p class="timeline-date">${item.year}</p>
    <div class="timeline-copy">
      <h3 class="timeline-title">${item.title}</h3>
      <p>${item.short}</p>
    </div>
    <button class="timeline-open" type="button">Buka Cerita</button>
  `;

  row.querySelector(".timeline-open").addEventListener("click", () => openStory(item));
  return row;
};

memorialPhotos.forEach((item, index) => {
  photoGrid.appendChild(createCard(item, index));
});

[...memorialPhotos]
  .sort((a, b) => parseLocalDate(a.year) - parseLocalDate(b.year))
  .forEach((item) => {
    timelineList.appendChild(createTimelineItem(item));
  });

closeModalBtn.addEventListener("click", closeStory);

storyModal.addEventListener("click", (event) => {
  if (event.target === storyModal) {
    closeStory();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && storyModal.classList.contains("show")) {
    closeStory();
  }
});

modalContent.addEventListener("scroll", updateCinemaMode, { passive: true });

if (commentForm) {
  commentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const content = String(commentInput?.value || "").trim();
    if (!content || !currentMemorialKey) {
      return;
    }
    if (!currentUser || !supabaseClient) {
      if (commentLoginHint) {
        commentLoginHint.textContent = "Login dulu untuk kirim komentar.";
      }
      return;
    }

    const userName =
      currentUser.user_metadata?.full_name ||
      currentUser.user_metadata?.name ||
      currentUser.email ||
      "User";

    const { error } = await supabaseClient.from("memorial_comments").insert({
      memorial_key: currentMemorialKey,
      content,
      user_id: currentUser.id,
      user_name: userName
    });

    if (!error) {
      commentInput.value = "";
      fetchComments(currentMemorialKey);
    }
  });
}

const setActiveNav = (href) => {
  navLinks.forEach((link) => {
    const isActive = link.getAttribute("href") === href;
    link.classList.toggle("active", isActive);
  });
};

const detectActiveSection = () => {
  const memorySection = document.getElementById("our-memory");
  const timelineSection = document.getElementById("timeline");
  const y = window.scrollY + 140;

  if (timelineSection && y >= timelineSection.offsetTop) {
    setActiveNav("#timeline");
  } else if (memorySection && y >= memorySection.offsetTop) {
    setActiveNav("#our-memory");
  } else {
    setActiveNav("#our-memory");
  }
};

window.addEventListener("scroll", detectActiveSection, { passive: true });
window.addEventListener("hashchange", detectActiveSection);
detectActiveSection();

const syncFullscreenButton = () => {
  const isFs = document.fullscreenElement === modalPhoto;
  fullScreenBtn.textContent = isFs ? "Keluar Full Screen" : "Full Screen";
};

fullScreenBtn.addEventListener("click", async () => {
  try {
    if (document.fullscreenElement === modalPhoto) {
      await document.exitFullscreen();
    } else {
      await modalPhoto.requestFullscreen();
    }
  } catch {
    // Ignore fullscreen rejection in restricted browsers.
  } finally {
    syncFullscreenButton();
  }
});

document.addEventListener("fullscreenchange", syncFullscreenButton);
syncFullscreenButton();
startHeroCoverSlide();
loadCurrentUser();

if (supabaseClient) {
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    setCommentUiState();
    if (currentMemorialKey) {
      fetchComments(currentMemorialKey);
    }
  });
}

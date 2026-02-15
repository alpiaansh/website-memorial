const STORAGE_KEY = "memoflix_secret_messages_v1";
const POLL_INTERVAL_MS = 10000;
const MESSAGE_TTL_MONTHS = 3;

const seedMessages = [
  {
    id: "m1",
    to_name: "Alisa",
    title: "Untuk Kamu di Hari Tenang",
    from_name: "Seseorang",
    music_url: "https://open.spotify.com/track/2plbrEY59IikOBgBGLjaoe",
    message_text:
      "Kalau hari ini berat, pelan-pelan aja. Aku masih ada di sini, dan lagu ini kupilih supaya kamu ingat kalau kamu tidak sendiri.",
    created_at: "2026-02-13T10:00:00.000Z",
    expires_at: "2026-05-13T10:00:00.000Z"
  },
  {
    id: "m2",
    to_name: "Raka",
    title: "Satu Lagu Untuk Pulang",
    from_name: "Teman Lama",
    music_url: "https://open.spotify.com/track/3xkHsmpQCBMytMJNiDf3Ii",
    message_text:
      "Dengerin ini kalau kamu kangen rumah. Semoga kamu selalu ketemu alasan untuk senyum, sejauh apa pun kamu pergi.",
    created_at: "2026-02-13T11:20:00.000Z",
    expires_at: "2026-05-13T11:20:00.000Z"
  }
];

const composerForm = document.getElementById("composerForm");
const composerNote = document.getElementById("composerNote");
const searchInput = document.getElementById("searchInput");
const messageList = document.getElementById("messageList");
const resultMeta = document.getElementById("resultMeta");
const syncStatus = document.getElementById("syncStatus");
const songQuery = document.getElementById("songQuery");
const spotifySuggestions = document.getElementById("spotifySuggestions");
const selectedSong = document.getElementById("selectedSong");
const musicUrlInput = document.getElementById("musicUrl");
const openSpotifySearch = document.getElementById("openSpotifySearch");
const nowPlaying = document.getElementById("nowPlaying");
const nowPlayingTitle = document.getElementById("nowPlayingTitle");
const nowPlayingFrame = document.getElementById("nowPlayingFrame");
const closePlayer = document.getElementById("closePlayer");
const peekModal = document.getElementById("peekModal");
const peekTo = document.getElementById("peekTo");
const peekTitle = document.getElementById("peekTitle");
const peekMeta = document.getElementById("peekMeta");
const peekText = document.getElementById("peekText");
const closePeek = document.getElementById("closePeek");
const peekPlayerWrap = document.getElementById("peekPlayerWrap");
const peekSongFrame = document.getElementById("peekSongFrame");
const navLinks = [...document.querySelectorAll(".nav-link")];

const cfg = window.APP_CONFIG || {};
const supabaseUrl = String(cfg.SUPABASE_URL || "").trim().replace(/\/$/, "");
const supabaseAnonKey = String(cfg.SUPABASE_ANON_KEY || "").trim();
const cloudEnabled = Boolean(supabaseUrl && supabaseAnonKey);

let messages = [];
let selectedTrack = null;
let currentTrackMatches = [];

const spotifyTrendingTracks = [
  { title: "Die With A Smile", artist: "Lady Gaga, Bruno Mars", url: "https://open.spotify.com/track/2plbrEY59IikOBgBGLjaoe" },
  { title: "APT.", artist: "ROSE, Bruno Mars", url: "https://open.spotify.com/track/5vNRhkKd0yEAg8suGBpjeY" },
  { title: "Espresso", artist: "Sabrina Carpenter", url: "https://open.spotify.com/track/2qSkIjg1o9h3YT9RAgYN75" },
  { title: "Birds of a Feather", artist: "Billie Eilish", url: "https://open.spotify.com/track/6dOtVTDdiauQNBQEDOtlAB" },
  { title: "Beautiful Things", artist: "Benson Boone", url: "https://open.spotify.com/track/6tNQ70jh4OwmPGpYy6R2o9" },
  { title: "Too Sweet", artist: "Hozier", url: "https://open.spotify.com/track/3xkHsmpQCBMytMJNiDf3Ii" },
  { title: "Please Please Please", artist: "Sabrina Carpenter", url: "https://open.spotify.com/track/5N3hjp1WNayUPZrA8kJmJP" },
  { title: "Greedy", artist: "Tate McRae", url: "https://open.spotify.com/track/3rUGC1vUpkDG9CZFHMur1t" }
];

const setActiveNav = () => {
  navLinks.forEach((link) => {
    const href = link.getAttribute("href") || "";
    link.classList.toggle("active", href === "secret-message.html");
  });
};

const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const normalizeText = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const scoreTrackMatch = (track, query) => {
  const q = normalizeText(query);
  if (!q) {
    return 1;
  }

  const title = normalizeText(track.title);
  const artist = normalizeText(track.artist);
  const combined = `${title} ${artist}`;

  if (combined === q) return 100;
  if (title === q || artist === q) return 95;
  if (title.startsWith(q) || artist.startsWith(q)) return 85;
  if (title.includes(q)) return 75;
  if (artist.includes(q)) return 70;

  const tokens = q.split(" ").filter(Boolean);
  if (tokens.length > 0 && tokens.every((t) => combined.includes(t))) {
    return 60;
  }

  return 0;
};

const addMonths = (dateString, months) => {
  const date = new Date(dateString);
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
};

const ensureExpiry = (item) => {
  if (item.expires_at) {
    return item;
  }

  return {
    ...item,
    expires_at: addMonths(item.created_at, MESSAGE_TTL_MONTHS).toISOString()
  };
};

const isExpired = (item) => new Date(item.expires_at).getTime() <= Date.now();

const remainingDays = (item) => {
  const diffMs = new Date(item.expires_at).getTime() - Date.now();
  if (diffMs <= 0) {
    return 0;
  }

  return Math.ceil(diffMs / 86400000);
};

const setSyncStatus = (text, isError = false) => {
  syncStatus.textContent = text;
  syncStatus.classList.toggle("error", isError);
};

const parseSpotify = (url) => {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("spotify.com")) {
      return null;
    }

    const parts = parsed.pathname.split("/").filter(Boolean);
    const type = parts[0];
    const id = parts[1];
    if (!type || !id || !["track", "album", "playlist"].includes(type)) {
      return null;
    }

    return {
      type,
      id,
      embedUrl: `https://open.spotify.com/embed/${type}/${id}`
    };
  } catch {
    return null;
  }
};

const localLoad = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seedMessages));
      return [...seedMessages];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(ensureExpiry) : [...seedMessages];
  } catch {
    return [...seedMessages];
  }
};

const localSave = (list) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
};

const supabaseHeaders = () => ({
  apikey: supabaseAnonKey,
  Authorization: `Bearer ${supabaseAnonKey}`,
  "Content-Type": "application/json"
});

const readErrorBody = async (res) => {
  try {
    const data = await res.json();
    return data?.message || data?.error_description || data?.error || JSON.stringify(data);
  } catch {
    return await res.text();
  }
};

const fetchCloudMessages = async () => {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/secret_messages?select=*&order=created_at.desc`,
    { headers: supabaseHeaders() }
  );

  if (!res.ok) {
    throw new Error(`Cloud fetch failed (${res.status}): ${await readErrorBody(res)}`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data.map(ensureExpiry) : [];
};

const insertCloudMessage = async (payload) => {
  const res = await fetch(`${supabaseUrl}/rest/v1/secret_messages`, {
    method: "POST",
    headers: {
      ...supabaseHeaders(),
      Prefer: "return=representation"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error(`Cloud insert failed (${res.status}): ${await readErrorBody(res)}`);
  }

  const data = await res.json();
  return Array.isArray(data) && data.length > 0 ? ensureExpiry(data[0]) : ensureExpiry(payload);
};

const purgeExpiredCloudMessages = async () => {
  const nowIso = new Date().toISOString();
  const res = await fetch(
    `${supabaseUrl}/rest/v1/secret_messages?expires_at=lt.${encodeURIComponent(nowIso)}`,
    {
      method: "DELETE",
      headers: supabaseHeaders()
    }
  );

  if (!res.ok) {
    throw new Error(`Cloud purge failed (${res.status}): ${await readErrorBody(res)}`);
  }
};

const sortByDateDesc = (list) =>
  [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

const openOverlayPlayer = (musicUrl, label) => {
  const parsed = parseSpotify(musicUrl);
  if (!parsed) {
    return;
  }

  nowPlayingFrame.src = parsed.embedUrl;
  nowPlayingTitle.textContent = `Now Playing - ${label}`;
  nowPlaying.classList.remove("hidden");
};

const closePeekModal = () => {
  peekModal.classList.add("hidden");
  document.body.style.overflow = "";
  peekSongFrame.src = "";
  peekPlayerWrap.classList.add("hidden");
};

const openPeekModal = (item, daysLeft, created) => {
  peekTo.textContent = `For ${item.to_name}`;
  peekTitle.textContent = item.title;
  peekMeta.textContent = `Dari ${item.from_name || "Anonim"} - ${created} - Hilang dalam ${daysLeft} hari (3 bulan)`;
  peekText.textContent = item.message_text;
  peekModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  if (item.music_url) {
    const parsed = parseSpotify(item.music_url);
    if (parsed) {
      peekSongFrame.src = parsed.embedUrl;
      peekPlayerWrap.classList.remove("hidden");
    } else {
      peekSongFrame.src = "";
      peekPlayerWrap.classList.add("hidden");
    }
  } else {
    peekSongFrame.src = "";
    peekPlayerWrap.classList.add("hidden");
  }
};

const createMessageCard = (item) => {
  const card = document.createElement("article");
  card.className = "message-card";

  const created = new Date(item.created_at).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
  const daysLeft = remainingDays(item);

  card.innerHTML = `
    <div class="message-head">
      <h3 class="message-title">${escapeHtml(item.title)}</h3>
      <p class="message-to">For ${escapeHtml(item.to_name)}</p>
    </div>
    <p class="message-meta">Dari ${escapeHtml(item.from_name || "Anonim")} - ${created} - Hilang dalam ${daysLeft} hari (3 bulan)</p>
    <button class="reveal-btn" type="button" data-role="toggle">Buka Message</button>
    ${item.music_url ? '<button class="play-overlay-btn" type="button" data-role="play">Play Song Overlay</button>' : ""}
  `;

  const toggle = card.querySelector('[data-role="toggle"]');
  const play = card.querySelector('[data-role="play"]');

  toggle.addEventListener("click", () => {
    openPeekModal(item, daysLeft, created);
  });

  if (play) {
    play.addEventListener("click", () => {
      openOverlayPlayer(item.music_url, item.title);
    });
  }

  return card;
};

const renderMessages = (query = "") => {
  const keyword = query.trim().toLowerCase();
  const filtered = sortByDateDesc(messages)
    .filter((item) => !isExpired(item))
    .filter((item) => {
      const target = `${item.to_name} ${item.title}`.toLowerCase();
      return !keyword || target.includes(keyword);
    });

  resultMeta.textContent = `Menampilkan ${filtered.length} message aktif`;
  messageList.innerHTML = "";

  if (filtered.length === 0) {
    messageList.innerHTML = `
      <div class="empty-state">
        Tidak ada message aktif ditemukan. Coba kata kunci lain (nama penerima atau judul).
      </div>
    `;
    return;
  }

  filtered.forEach((item) => {
    messageList.appendChild(createMessageCard(item));
  });
};

const refreshMessages = async () => {
  if (!cloudEnabled) {
    messages = localLoad().filter((item) => !isExpired(item));
    localSave(messages);
    renderMessages(searchInput.value);
    return;
  }

  try {
    try {
      await purgeExpiredCloudMessages();
    } catch {
      // Ignore purge failures (usually because delete policy isn't enabled yet).
    }

    messages = (await fetchCloudMessages()).filter((item) => !isExpired(item));
    renderMessages(searchInput.value);
    setSyncStatus("Mode: Multi-user cloud (Supabase)");
  } catch {
    setSyncStatus("Mode: Cloud error, fallback local storage", true);
    messages = localLoad().filter((item) => !isExpired(item));
    localSave(messages);
    renderMessages(searchInput.value);
  }
};

composerForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(composerForm);
  const to_name = String(formData.get("toName") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const from_name = String(formData.get("fromName") || "").trim();
  const manualMusicUrl = String(formData.get("musicUrl") || "").trim();
  const music_url = selectedTrack?.url || manualMusicUrl;
  const message_text = String(formData.get("messageText") || "").trim();

  if (!to_name || !title || !message_text) {
    composerNote.textContent = "Lengkapi field wajib: Untuk, Judul, dan Isi Message.";
    return;
  }

  if (music_url && !parseSpotify(music_url)) {
    composerNote.textContent = "Link lagu harus dari Spotify (track/album/playlist).";
    return;
  }

  const createdAt = new Date().toISOString();
  const payload = {
    to_name,
    title,
    from_name,
    music_url,
    message_text,
    created_at: createdAt,
    expires_at: addMonths(createdAt, MESSAGE_TTL_MONTHS).toISOString()
  };

  try {
    if (cloudEnabled) {
      const inserted = await insertCloudMessage(payload);
      messages = [inserted, ...messages];
      setSyncStatus("Mode: Multi-user cloud (Supabase)");
    } else {
      const localMessage = { id: `m_${Date.now()}`, ...payload };
      messages = [localMessage, ...messages];
      localSave(messages);
      setSyncStatus("Mode: Local browser storage");
    }

    composerForm.reset();
    selectedTrack = null;
    selectedSong.textContent = "Belum ada lagu dipilih.";
    renderTrackSuggestions(songQuery.value);
    composerNote.textContent = "Message berhasil disimpan. Pesan ini akan hilang otomatis dalam 3 bulan.";
    renderMessages(searchInput.value);
  } catch (error) {
    composerNote.textContent = "Gagal simpan message. Buka Console browser untuk detail error Supabase.";
    console.error("Insert message failed:", error);
  }
});

searchInput.addEventListener("input", () => {
  renderMessages(searchInput.value);
});

closePlayer.addEventListener("click", () => {
  nowPlayingFrame.src = "";
  nowPlaying.classList.add("hidden");
});

closePeek.addEventListener("click", closePeekModal);

peekModal.addEventListener("click", (event) => {
  if (event.target === peekModal) {
    closePeekModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !peekModal.classList.contains("hidden")) {
    closePeekModal();
  }
});

const setSelectedTrack = (track) => {
  selectedTrack = track;
  musicUrlInput.value = track.url;
  selectedSong.textContent = `Terpilih: ${track.title} - ${track.artist}`;
  openOverlayPlayer(track.url, `${track.title} - ${track.artist}`);
};

const renderTrackSuggestions = (query = "") => {
  const scored = spotifyTrendingTracks
    .map((track) => ({ track, score: scoreTrackMatch(track, query) }))
    .filter((item) => item.score > 0 || !query.trim())
    .sort((a, b) => b.score - a.score);

  const tracks = scored.map((item) => item.track);
  currentTrackMatches = tracks;

  spotifySuggestions.innerHTML = "";
  if (tracks.length === 0) {
    spotifySuggestions.innerHTML = '<button class="song-option" type="button">Tidak ada lagu cocok. Coba kata lain.</button>';
    return;
  }

  tracks.forEach((track) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "song-option";
    btn.innerHTML = `
      <span class="song-title">${escapeHtml(track.title)}</span>
      <span class="song-artist">${escapeHtml(track.artist)}</span>
    `;
    btn.addEventListener("click", () => setSelectedTrack(track));
    spotifySuggestions.appendChild(btn);
  });
};

songQuery.addEventListener("input", () => {
  renderTrackSuggestions(songQuery.value);
});

openSpotifySearch.addEventListener("click", () => {
  const query = songQuery.value.trim();
  if (query && currentTrackMatches.length > 0) {
    setSelectedTrack(currentTrackMatches[0]);
    return;
  }

  const encoded = encodeURIComponent(query || "spotify top songs");
  window.open(`https://open.spotify.com/search/${encoded}`, "_blank", "noopener,noreferrer");
});

songQuery.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") {
    return;
  }

  event.preventDefault();
  const query = songQuery.value.trim();

  if (query && currentTrackMatches.length > 0) {
    setSelectedTrack(currentTrackMatches[0]);
    return;
  }

  const encoded = encodeURIComponent(query || "spotify top songs");
  window.open(`https://open.spotify.com/search/${encoded}`, "_blank", "noopener,noreferrer");
});

musicUrlInput.addEventListener("change", () => {
  const manualUrl = musicUrlInput.value.trim();
  const parsed = parseSpotify(manualUrl);
  if (!parsed) {
    return;
  }

  selectedTrack = {
    title: "Spotify Link Manual",
    artist: "Custom",
    url: manualUrl
  };
  selectedSong.textContent = "Terpilih: Spotify Link Manual";
  openOverlayPlayer(manualUrl, "Manual Selection");
});

renderTrackSuggestions();
setActiveNav();

if (cloudEnabled) {
  setSyncStatus("Mode: Connecting cloud...");
  refreshMessages();
  setInterval(refreshMessages, POLL_INTERVAL_MS);
} else {
  setSyncStatus("Mode: Local browser storage (isi supabase-config.js untuk multi-user)");
  refreshMessages();
}

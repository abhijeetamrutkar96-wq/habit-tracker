(() => {
  "use strict";

  /* ---------------------------------------------------------
     Storage
  --------------------------------------------------------- */
  const STORAGE_KEY = "momentum_habits_v1";
  const THEME_KEY = "momentum_theme_v1";
  const CELEBRATED_KEY = "momentum_celebrated_v1";
  const MAX_STREAK_KEY = "momentum_max_streak_v1";
  const DELETED_KEY = "momentum_deleted_v1";
  const TOKEN_KEY = "momentum_gh_token_v1";
  const LAST_SYNC_KEY = "momentum_last_sync_v1";

  // Shared private Gist used as the sync backend. Any device with the
  // matching personal access token can read/write this same file.
  const GIST_ID = "d611c0d5184b7b95ddd13c60847d2c52";
  const GIST_FILENAME = "momentum-data.json";

  const load = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };
  const save = (key, val) => localStorage.setItem(key, JSON.stringify(val));

  let habits = load(STORAGE_KEY, []);
  let deletedIds = load(DELETED_KEY, {});

  /* ---------------------------------------------------------
     Date helpers
  --------------------------------------------------------- */
  const pad = (n) => String(n).padStart(2, "0");
  const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayKey = () => toKey(new Date());
  const dayOfWeek = (d) => (d.getDay() + 6) % 7; // 0=Mon ... 6=Sun
  const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
  const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  function daysAgo(n) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return d;
  }

  /* ---------------------------------------------------------
     Constants
  --------------------------------------------------------- */
  const EMOJIS = ["💧","🏃","📚","🧘","🍎","🛌","💪","🚭","✍️","🎯","🧹","💰","🎨","🎵","🚴","🧠","❤️","☀️","🌙","✅","🧑‍💻","🥗","🚶","🦷"];
  const COLORS = ["#7c5cff","#ff7ab6","#35d0a3","#ffb84c","#4cc9ff","#ff6b6b","#a78bfa","#2bb98d"];

  const QUOTES = [
    "Small steps, repeated daily, build an unstoppable momentum.",
    "You don't have to be extreme, just consistent.",
    "Discipline is choosing between what you want now and what you want most.",
    "Every habit you keep is a vote for the person you want to become.",
    "Progress, not perfection.",
    "The chain of habits is too light to feel until it's too heavy to break — make it a good one.",
    "Motivation gets you started. Habit keeps you going.",
    "One day or day one. You decide.",
    "Success is the sum of small efforts, repeated day in and day out.",
    "Show up, even when it's inconvenient. Especially then.",
    "You are what you repeatedly do.",
    "A little progress each day adds up to big results.",
    "Don't break the chain.",
    "Consistency beats intensity.",
    "Your future self is watching you right now through memories.",
    "The secret of getting ahead is getting started.",
    "Habits are the compound interest of self-improvement.",
    "It's never too late to start again.",
    "Keep going. Everything you need will come to you.",
    "Focus on being consistent, not perfect."
  ];

  const BADGES = [
    { id: "b3", days: 3, icon: "🌱", name: "3-Day Spark" },
    { id: "b7", days: 7, icon: "🔥", name: "1 Week Streak" },
    { id: "b14", days: 14, icon: "⚡", name: "2 Weeks Strong" },
    { id: "b30", days: 30, icon: "🏆", name: "30 Day Champion" },
    { id: "b60", days: 60, icon: "💎", name: "60 Day Diamond" },
    { id: "b100", days: 100, icon: "👑", name: "Century Club" },
  ];

  /* ---------------------------------------------------------
     Habit logic
  --------------------------------------------------------- */
  function isScheduled(habit, date) {
    return habit.days.includes(dayOfWeek(date));
  }

  function isDone(habit, key) {
    return !!habit.log[key];
  }

  // current streak counting back from today, only counting scheduled days
  function currentStreak(habit) {
    let streak = 0;
    let cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    // if today is scheduled but not done yet, start checking from yesterday
    for (let i = 0; i < 3650; i++) {
      const key = toKey(cursor);
      if (isScheduled(habit, cursor)) {
        if (isDone(habit, key)) {
          streak++;
        } else if (key === todayKey()) {
          // today not done yet, doesn't break the streak, just don't count it
        } else {
          break;
        }
      }
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  function totalCheckins() {
    return habits.reduce((sum, h) => sum + Object.values(h.log).filter(Boolean).length, 0);
  }

  function scheduledToday() {
    const now = new Date();
    return habits.filter((h) => isScheduled(h, now));
  }

  function doneTodayCount() {
    const key = todayKey();
    return scheduledToday().filter((h) => isDone(h, key)).length;
  }

  function bestStreak() {
    return habits.reduce((max, h) => Math.max(max, currentStreak(h)), 0);
  }

  function perfectDaysCount() {
    let count = 0;
    for (let i = 0; i < 90; i++) {
      const d = daysAgo(i);
      const key = toKey(d);
      const scheduled = habits.filter((h) => isScheduled(h, d) && h.createdAt <= key);
      if (scheduled.length === 0) continue;
      if (scheduled.every((h) => isDone(h, key))) count++;
    }
    return count;
  }

  /* ---------------------------------------------------------
     Rendering
  --------------------------------------------------------- */
  const $ = (sel) => document.querySelector(sel);
  const habitListEl = $("#habitList");
  const emptyStateEl = $("#emptyState");
  const weekGridEl = $("#weekGrid");
  const badgeGridEl = $("#badgeGrid");

  function greetingText() {
    const h = new Date().getHours();
    if (h < 5) return "Still up? 🌙";
    if (h < 12) return "Good morning ☀️";
    if (h < 17) return "Good afternoon 🌤️";
    if (h < 21) return "Good evening 🌆";
    return "Good night 🌙";
  }

  function renderHero() {
    $("#todayDate").textContent = new Date().toLocaleDateString(undefined, {
      weekday: "long", month: "long", day: "numeric",
    });
    $("#greeting").textContent = greetingText();

    const dayIndex = Math.floor(Date.now() / 86400000) % QUOTES.length;
    $("#quote").textContent = `"${QUOTES[dayIndex]}"`;

    const scheduled = scheduledToday();
    const done = doneTodayCount();
    const pct = scheduled.length ? Math.round((done / scheduled.length) * 100) : 0;

    const circumference = 326.7;
    const offset = circumference - (pct / 100) * circumference;
    $("#ringFg").style.strokeDashoffset = offset;
    $("#ringPercent").textContent = `${pct}%`;

    const ringFg = $("#ringFg");
    if (pct >= 100 && scheduled.length > 0) {
      ringFg.style.stroke = "#35d0a3";
    } else {
      ringFg.style.stroke = "#7c5cff";
    }

    maybeCelebrate(pct, scheduled.length);
  }

  function renderStats() {
    $("#statStreak").textContent = bestStreak();
    $("#statDone").textContent = `${doneTodayCount()}/${scheduledToday().length}`;
    $("#statTotal").textContent = totalCheckins();
    $("#statPerfect").textContent = perfectDaysCount();
  }

  function renderHabitList() {
    habitListEl.innerHTML = "";
    if (habits.length === 0) {
      emptyStateEl.hidden = false;
      return;
    }
    emptyStateEl.hidden = true;

    const now = new Date();
    const key = todayKey();

    habits.forEach((h) => {
      const scheduled = isScheduled(h, now);
      const done = isDone(h, key);
      const streak = currentStreak(h);

      const card = document.createElement("div");
      card.className = "habit-card card";
      card.style.opacity = scheduled ? "1" : "0.55";

      const dotsHtml = Array.from({ length: 7 }).map((_, i) => {
        const d = daysAgo(6 - i);
        const dKey = toKey(d);
        const filled = isScheduled(h, d) && isDone(h, dKey);
        const isToday = dKey === key;
        return `<span class="habit-dot ${filled ? "filled" : ""} ${isToday ? "today-outline" : ""}"></span>`;
      }).join("");

      card.innerHTML = `
        <div class="habit-emoji" style="background:${h.color}22;color:${h.color}">${h.emoji}</div>
        <div class="habit-info">
          <p class="habit-name">${escapeHtml(h.name)}</p>
          <div class="habit-meta">
            ${streak > 0 ? `<span>🔥 ${streak} day${streak === 1 ? "" : "s"}</span>` : `<span>${scheduled ? "Let's start today" : "Not scheduled today"}</span>`}
          </div>
          <div class="habit-dots">${dotsHtml}</div>
        </div>
        <button class="habit-edit-btn" data-edit="${h.id}" aria-label="Edit habit">✎</button>
        <button class="check-btn ${done ? "done" : ""}" data-toggle="${h.id}" ${scheduled ? "" : "disabled"} aria-label="Mark done">
          ${done ? "✓" : ""}
        </button>
      `;
      habitListEl.appendChild(card);
    });

    habitListEl.querySelectorAll("[data-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => toggleHabit(btn.dataset.toggle));
    });
    habitListEl.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => openModal(btn.dataset.edit));
    });
  }

  function renderWeek() {
    weekGridEl.innerHTML = "";
    const now = new Date();
    const key = todayKey();
    const monday = new Date(now);
    monday.setDate(now.getDate() - dayOfWeek(now));

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dKey = toKey(d);
      const isToday = dKey === key;
      const isFuture = d > new Date();

      const scheduled = habits.filter((h) => isScheduled(h, d) && h.createdAt <= dKey);
      const doneCount = scheduled.filter((h) => isDone(h, dKey)).length;
      const pct = scheduled.length ? doneCount / scheduled.length : 0;

      const col = document.createElement("div");
      col.className = "week-col";
      let bg = "var(--border)";
      if (!isFuture && scheduled.length) {
        if (pct >= 1) bg = "#35d0a3";
        else if (pct >= 0.5) bg = "#9be8cf";
        else if (pct > 0) bg = "#d8f3e8";
      }
      col.innerHTML = `
        <span class="week-day-label">${DAY_LABELS[i]}</span>
        <div class="week-cell ${isToday ? "today" : ""}" style="background:${bg}" title="${DAY_NAMES[i]}: ${doneCount}/${scheduled.length}"></div>
      `;
      weekGridEl.appendChild(col);
    }
  }

  function renderBadges() {
    const maxEver = load(MAX_STREAK_KEY, 0);
    const currentBest = bestStreak();
    const effectiveMax = Math.max(maxEver, currentBest);
    if (effectiveMax > maxEver) save(MAX_STREAK_KEY, effectiveMax);

    badgeGridEl.innerHTML = "";
    BADGES.forEach((b) => {
      const unlocked = effectiveMax >= b.days;
      const el = document.createElement("div");
      el.className = `badge ${unlocked ? "unlocked" : ""}`;
      el.innerHTML = `<span class="badge-icon">${b.icon}</span><span class="badge-name">${b.name}</span>`;
      badgeGridEl.appendChild(el);
    });
  }

  function renderAll() {
    renderHero();
    renderStats();
    renderHabitList();
    renderWeek();
    renderBadges();
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /* ---------------------------------------------------------
     Actions
  --------------------------------------------------------- */
  function toggleHabit(id) {
    const h = habits.find((x) => x.id === id);
    if (!h) return;
    const key = todayKey();
    if (h.log[key]) {
      delete h.log[key];
    } else {
      h.log[key] = true;
    }
    save(STORAGE_KEY, habits);
    renderAll();
    scheduleSync();
  }

  function showToast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  function maybeCelebrate(pct, scheduledCount) {
    if (pct < 100 || scheduledCount === 0) return;
    const celebrated = load(CELEBRATED_KEY, {});
    const key = todayKey();
    if (celebrated[key]) return;
    celebrated[key] = true;
    save(CELEBRATED_KEY, celebrated);
    fireConfetti();
    showToast("🎉 All habits done for today. Amazing work!");
  }

  /* ---------------------------------------------------------
     Modal
  --------------------------------------------------------- */
  const overlay = $("#modalOverlay");
  const form = $("#habitForm");
  let editingId = null;
  let selectedEmoji = EMOJIS[0];
  let selectedColor = COLORS[0];
  let selectedDays = [0, 1, 2, 3, 4, 5, 6];

  function buildEmojiPicker() {
    const el = $("#emojiPicker");
    el.innerHTML = EMOJIS.map((e) => `<button type="button" class="emoji-opt" data-emoji="${e}">${e}</button>`).join("");
    el.querySelectorAll(".emoji-opt").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedEmoji = btn.dataset.emoji;
        syncEmojiPicker();
      });
    });
  }
  function syncEmojiPicker() {
    $("#emojiPicker").querySelectorAll(".emoji-opt").forEach((b) => {
      b.classList.toggle("selected", b.dataset.emoji === selectedEmoji);
    });
  }

  function buildColorPicker() {
    const el = $("#colorPicker");
    el.innerHTML = COLORS.map((c) => `<button type="button" class="color-opt" data-color="${c}" style="background:${c};border-color:${c}"></button>`).join("");
    el.querySelectorAll(".color-opt").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedColor = btn.dataset.color;
        syncColorPicker();
      });
    });
  }
  function syncColorPicker() {
    $("#colorPicker").querySelectorAll(".color-opt").forEach((b) => {
      b.classList.toggle("selected", b.dataset.color === selectedColor);
    });
  }

  function buildDayPicker() {
    const el = $("#dayPicker");
    el.innerHTML = DAY_LABELS.map((l, i) => `<button type="button" class="day-opt" data-day="${i}">${l}</button>`).join("");
    el.querySelectorAll(".day-opt").forEach((btn) => {
      btn.addEventListener("click", () => {
        const day = Number(btn.dataset.day);
        if (selectedDays.includes(day)) {
          selectedDays = selectedDays.filter((d) => d !== day);
        } else {
          selectedDays.push(day);
        }
        syncDayPicker();
      });
    });
  }
  function syncDayPicker() {
    $("#dayPicker").querySelectorAll(".day-opt").forEach((b) => {
      b.classList.toggle("selected", selectedDays.includes(Number(b.dataset.day)));
    });
  }

  function openModal(id) {
    editingId = id || null;
    const h = id ? habits.find((x) => x.id === id) : null;

    $("#modalTitle").textContent = h ? "Edit habit" : "New habit";
    $("#habitName").value = h ? h.name : "";
    selectedEmoji = h ? h.emoji : EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    selectedColor = h ? h.color : COLORS[habits.length % COLORS.length];
    selectedDays = h ? [...h.days] : [0, 1, 2, 3, 4, 5, 6];
    $("#deleteHabitBtn").hidden = !h;

    syncEmojiPicker();
    syncColorPicker();
    syncDayPicker();

    overlay.hidden = false;
    setTimeout(() => $("#habitName").focus(), 50);
  }

  function closeModal() {
    overlay.hidden = true;
    editingId = null;
    form.reset();
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("#habitName").value.trim();
    if (!name) return;
    if (selectedDays.length === 0) {
      showToast("Pick at least one day");
      return;
    }

    if (editingId) {
      const h = habits.find((x) => x.id === editingId);
      h.name = name;
      h.emoji = selectedEmoji;
      h.color = selectedColor;
      h.days = [...selectedDays];
      h.updatedAt = Date.now();
    } else {
      habits.push({
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        name,
        emoji: selectedEmoji,
        color: selectedColor,
        days: [...selectedDays],
        createdAt: todayKey(),
        updatedAt: Date.now(),
        log: {},
      });
    }
    save(STORAGE_KEY, habits);
    closeModal();
    renderAll();
    scheduleSync();
  });

  $("#deleteHabitBtn").addEventListener("click", () => {
    if (!editingId) return;
    if (!confirm("Delete this habit? This can't be undone.")) return;
    habits = habits.filter((x) => x.id !== editingId);
    deletedIds[editingId] = Date.now();
    save(STORAGE_KEY, habits);
    save(DELETED_KEY, deletedIds);
    closeModal();
    renderAll();
    scheduleSync();
  });

  $("#cancelModalBtn").addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
  $("#addHabitBtn").addEventListener("click", () => openModal(null));

  /* ---------------------------------------------------------
     Theme
  --------------------------------------------------------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    $("#themeToggle").textContent = theme === "dark" ? "☀️" : "🌙";
    save(THEME_KEY, theme);
  }
  $("#themeToggle").addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    applyTheme(current === "dark" ? "light" : "dark");
  });

  /* ---------------------------------------------------------
     Export / Import / Reset
  --------------------------------------------------------- */
  $("#exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ habits, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `momentum-backup-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  $("#importInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (Array.isArray(data.habits)) {
          habits = data.habits;
          save(STORAGE_KEY, habits);
          renderAll();
          showToast("Import successful");
          scheduleSync();
        } else {
          showToast("Invalid file");
        }
      } catch {
        showToast("Couldn't read file");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  $("#resetBtn").addEventListener("click", () => {
    if (!confirm("This will permanently delete all habits and history. Continue?")) return;
    const now = Date.now();
    habits.forEach((h) => { deletedIds[h.id] = now; });
    habits = [];
    save(STORAGE_KEY, habits);
    save(DELETED_KEY, deletedIds);
    localStorage.removeItem(CELEBRATED_KEY);
    localStorage.removeItem(MAX_STREAK_KEY);
    renderAll();
    scheduleSync();
  });

  /* ---------------------------------------------------------
     Confetti (lightweight, no dependencies)
  --------------------------------------------------------- */
  function fireConfetti() {
    const canvas = $("#confettiCanvas");
    canvas.style.display = "block";
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext("2d");
    const colors = ["#7c5cff", "#ff7ab6", "#35d0a3", "#ffb84c", "#4cc9ff"];
    const pieces = Array.from({ length: 140 }).map(() => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.5,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 10,
      color: colors[Math.floor(Math.random() * colors.length)],
      speedY: 2 + Math.random() * 3,
      speedX: -2 + Math.random() * 4,
      rot: Math.random() * 360,
      rotSpeed: -8 + Math.random() * 16,
    }));

    let frame = 0;
    const maxFrames = 160;
    function tick() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach((p) => {
        p.x += p.speedX;
        p.y += p.speedY;
        p.rot += p.rotSpeed;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      frame++;
      if (frame < maxFrames) {
        requestAnimationFrame(tick);
      } else {
        canvas.style.display = "none";
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    tick();
  }

  /* ---------------------------------------------------------
     Cross-device sync (private GitHub Gist)
  --------------------------------------------------------- */
  const syncOverlay = $("#syncOverlay");
  const syncStatusEl = $("#syncStatus");
  let syncInFlight = false;
  let syncQueued = false;
  let syncDebounceTimer = null;

  function getToken() {
    return load(TOKEN_KEY, "");
  }

  async function fetchRemote(token) {
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (!res.ok) throw new Error(res.status === 401 ? "Invalid token" : `GitHub error ${res.status}`);
    const gist = await res.json();
    const raw = gist.files && gist.files[GIST_FILENAME] && gist.files[GIST_FILENAME].content;
    if (!raw) return { habits: [], deletedIds: {}, updatedAt: 0 };
    try {
      const parsed = JSON.parse(raw);
      return {
        habits: Array.isArray(parsed.habits) ? parsed.habits : [],
        deletedIds: parsed.deletedIds || {},
        updatedAt: parsed.updatedAt || 0,
      };
    } catch {
      return { habits: [], deletedIds: {}, updatedAt: 0 };
    }
  }

  async function pushRemote(token, data) {
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: "PATCH",
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ files: { [GIST_FILENAME]: { content: JSON.stringify(data) } } }),
    });
    if (!res.ok) throw new Error(res.status === 401 ? "Invalid token" : `GitHub error ${res.status}`);
  }

  // Merges two data sets without ever losing a completed check-in:
  // habit logs are unioned, metadata conflicts resolved by most-recent edit,
  // and deletions propagate via timestamped tombstones.
  function mergeData(local, remote) {
    const mergedDeleted = { ...remote.deletedIds };
    for (const [id, ts] of Object.entries(local.deletedIds)) {
      mergedDeleted[id] = Math.max(mergedDeleted[id] || 0, ts);
    }

    const byId = new Map();
    for (const h of remote.habits) byId.set(h.id, h);
    for (const h of local.habits) {
      const existing = byId.get(h.id);
      if (!existing) {
        byId.set(h.id, h);
        continue;
      }
      const newer = (h.updatedAt || 0) >= (existing.updatedAt || 0) ? h : existing;
      byId.set(h.id, {
        ...newer,
        log: { ...existing.log, ...h.log },
      });
    }

    const merged = [...byId.values()].filter((h) => {
      const deletedAt = mergedDeleted[h.id];
      return !deletedAt || deletedAt < (h.updatedAt || 0);
    });
    merged.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

    return { habits: merged, deletedIds: mergedDeleted, updatedAt: Date.now() };
  }

  function setSyncStatus(text, kind) {
    syncStatusEl.textContent = text;
    syncStatusEl.className = `sync-status ${kind || ""}`;
  }

  function refreshSyncStatusDisplay() {
    const token = getToken();
    $("#syncDisconnectBtn").hidden = !token;
    $("#syncToken").value = token || "";
    $("#syncToggle").textContent = token ? "☁️" : "☁️";
    $("#syncToggle").style.opacity = token ? "1" : "0.6";
    if (!token) {
      setSyncStatus("Not connected — data stays on this device only.");
      return;
    }
    const last = load(LAST_SYNC_KEY, null);
    setSyncStatus(last ? `Connected — last synced ${new Date(last).toLocaleTimeString()}` : "Connected — syncing…", "connected");
  }

  function scheduleSync() {
    if (!getToken()) return;
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(doSync, 700);
  }

  async function doSync() {
    const token = getToken();
    if (!token) return;
    if (syncInFlight) { syncQueued = true; return; }
    syncInFlight = true;
    try {
      const remote = await fetchRemote(token);
      const local = { habits, deletedIds };
      const merged = mergeData(local, remote);

      habits = merged.habits;
      deletedIds = merged.deletedIds;
      save(STORAGE_KEY, habits);
      save(DELETED_KEY, deletedIds);

      await pushRemote(token, merged);

      save(LAST_SYNC_KEY, Date.now());
      renderAll();
      refreshSyncStatusDisplay();
    } catch (err) {
      setSyncStatus(err.message || "Sync failed", "error");
    } finally {
      syncInFlight = false;
      if (syncQueued) {
        syncQueued = false;
        doSync();
      }
    }
  }

  $("#syncToggle").addEventListener("click", () => {
    refreshSyncStatusDisplay();
    syncOverlay.hidden = false;
  });
  $("#syncCancelBtn").addEventListener("click", () => { syncOverlay.hidden = true; });
  syncOverlay.addEventListener("click", (e) => { if (e.target === syncOverlay) syncOverlay.hidden = true; });

  $("#syncForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const token = $("#syncToken").value.trim();
    if (!token) return;
    save(TOKEN_KEY, token);
    setSyncStatus("Connecting…");
    await doSync();
  });

  $("#syncDisconnectBtn").addEventListener("click", () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(LAST_SYNC_KEY);
    refreshSyncStatusDisplay();
    showToast("Disconnected from sync");
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") scheduleSync();
  });
  window.addEventListener("focus", () => scheduleSync());

  /* ---------------------------------------------------------
     Init
  --------------------------------------------------------- */
  function init() {
    buildEmojiPicker();
    buildColorPicker();
    buildDayPicker();

    const savedTheme = load(THEME_KEY, null) || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    applyTheme(savedTheme);

    renderAll();
    refreshSyncStatusDisplay();
    if (getToken()) doSync();

    // refresh at midnight rollover / periodically while app stays open
    setInterval(renderAll, 60 * 1000);
    setInterval(() => scheduleSync(), 30 * 1000);
  }

  init();
})();

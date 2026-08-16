if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

let currentUser = null;
let currentProfile = null;
let currentSubject = null;   // subject currently open in the detail subpage
let currentSubTab = "lectures"; // "lectures" | "materials" — قسم الملازم tab

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2400);
}

// ---------- bottom nav / page switching ----------
// navStack keeps track of subpages opened on top of a main tab so the
// back button (and the device/browser back gesture) can return to
// exactly where the user came from instead of just closing everything.
let navStack = ["page-lectures"];

document.querySelectorAll(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => switchPage(btn.dataset.page));
});

// switchPage = jumping to one of the 4 main bottom-nav tabs.
// This resets the stack, since tabs are top-level destinations.
function switchPage(pageId) {
  navStack = [pageId];
  renderActivePage(pageId, { pushHistory: true, reset: true });
  document.querySelectorAll(".nav-item").forEach(n =>
    n.classList.toggle("active", n.dataset.page === pageId));
  if (currentUser) Api.logActivity(currentUser.id, "view_" + pageId);
}

// openSubpage = drilling into something from within a tab (a subject's
// lecture list, the archive, downloads, subscriptions, QR code...).
// Pushes onto the stack so goBack() can return to the previous screen.
function openSubpage(pageId) {
  navStack.push(pageId);
  renderActivePage(pageId, { pushHistory: true });
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
}

// goBack = the actual "رجوع" action, used by every back-arrow button
// and by the mobile/browser back gesture (popstate).
function goBack() {
  if (navStack.length > 1) {
    navStack.pop();
    const prev = navStack[navStack.length - 1];
    renderActivePage(prev, { pushHistory: false });
    document.querySelectorAll(".nav-item").forEach(n =>
      n.classList.toggle("active", n.dataset.page === prev));
  } else {
    // already at a top-level tab: default back to the lectures home
    switchPage("page-lectures");
  }
}

function renderActivePage(pageId, { pushHistory = false } = {}) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(pageId).classList.add("active");
  if (pushHistory) {
    history.pushState({ tibbiyaPage: pageId }, "", "#" + pageId);
  }
}

// every back-arrow button in any subpage header
document.querySelectorAll("[data-back]").forEach(btn => {
  btn.addEventListener("click", goBack);
});

// let the phone's/browser's physical back gesture close subpages too,
// instead of leaving the app or showing a blank screen.
window.addEventListener("popstate", () => {
  if (navStack.length > 1) {
    navStack.pop();
    const prev = navStack[navStack.length - 1];
    renderActivePage(prev, { pushHistory: false });
    document.querySelectorAll(".nav-item").forEach(n =>
      n.classList.toggle("active", n.dataset.page === prev));
  }
});

// ---------- side drawer ----------
const drawer = document.getElementById("drawer");
const drawerOverlay = document.getElementById("drawerOverlay");
function openDrawer() { drawer.classList.add("open"); drawerOverlay.classList.add("open"); }
function closeDrawer() { drawer.classList.remove("open"); drawerOverlay.classList.remove("open"); }
document.getElementById("openDrawerBtn").addEventListener("click", openDrawer);
document.getElementById("closeDrawerBtn").addEventListener("click", closeDrawer);
drawerOverlay.addEventListener("click", closeDrawer);

document.querySelectorAll(".drawer-list [data-action]").forEach(link => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const action = link.dataset.action;
    closeDrawer();
    if (action === "settings") return switchPage("page-settings");
    if (action === "support") return switchPage("page-contact");
    if (action === "archive") return openArchivePage();
    if (action === "downloads") return openDownloadsPage();
    if (action === "subs") return openSubscriptionsPage();
    if (action === "qr") return openQrPage();
  });
});

// ---------- settings toggles ----------
document.querySelectorAll(".switch").forEach(sw => {
  sw.addEventListener("click", () => sw.classList.toggle("on"));
});
document.getElementById("logoutBtn").addEventListener("click", async () => {
  await Auth.signOut();
  window.location.href = "index.html";
});

// ---------- QR banner ----------
document.getElementById("qrBanner").addEventListener("click", () => {
  openQrPage();
  if (currentUser) Api.logActivity(currentUser.id, "qr_open");
});

// ---------- profile edit modal (real avatar upload + password change) ----------
const profileModal = document.getElementById("profileModal");
const avatarEditPreview = document.getElementById("avatarEditPreview");
const avatarFileInput = document.getElementById("avatarFileInput");
const avatarProgressTrack = document.getElementById("avatarProgressTrack");
const avatarProgressFill = document.getElementById("avatarProgressFill");
let pendingAvatarFile = null;

function paintAvatarEverywhere(url, initial) {
  const img = document.getElementById("avatarImg");
  const fallback = document.getElementById("avatarFallback");
  const drawerAvatar = document.getElementById("drawerAvatar");
  if (url) {
    img.src = url; img.style.display = "block";
    fallback.style.display = "none";
    avatarEditPreview.innerHTML = `<img src="${url}" alt="">`;
  } else {
    img.style.display = "none"; fallback.style.display = "flex";
    fallback.textContent = initial;
    avatarEditPreview.textContent = initial;
  }
  drawerAvatar.textContent = initial;
}

function openProfileModal() {
  if (!currentProfile) return;
  document.getElementById("editNameInput").value = currentProfile.full_name || "";
  document.getElementById("currentPassInput").value = "";
  document.getElementById("newPassInput").value = "";
  document.getElementById("confirmPassInput").value = "";
  document.getElementById("passError").classList.remove("show");
  avatarProgressTrack.classList.remove("show");
  avatarProgressFill.style.width = "0%";
  pendingAvatarFile = null;
  const initial = (currentProfile.full_name || "ط").trim().charAt(0);
  if (currentProfile.avatar_url) {
    avatarEditPreview.innerHTML = `<img src="${currentProfile.avatar_url}" alt="">`;
  } else {
    avatarEditPreview.textContent = initial;
  }
  profileModal.classList.add("open");
}
function closeProfileModal() { profileModal.classList.remove("open"); }

document.getElementById("editProfileBtn").addEventListener("click", openProfileModal);
document.getElementById("profileModalClose").addEventListener("click", closeProfileModal);
document.getElementById("profileModalCancel").addEventListener("click", closeProfileModal);
profileModal.addEventListener("click", (e) => { if (e.target === profileModal) closeProfileModal(); });

document.getElementById("chooseAvatarBtn").addEventListener("click", () => avatarFileInput.click());
avatarFileInput.addEventListener("change", () => {
  const file = avatarFileInput.files[0];
  if (!file) return;
  pendingAvatarFile = file;
  const reader = new FileReader();
  reader.onload = (e) => { avatarEditPreview.innerHTML = `<img src="${e.target.result}" alt="">`; };
  reader.readAsDataURL(file);
});

document.getElementById("saveNameBtn").addEventListener("click", async () => {
  if (!currentUser) return;
  const newName = document.getElementById("editNameInput").value.trim();
  const btn = document.getElementById("saveNameBtn");
  btn.disabled = true;
  try {
    if (pendingAvatarFile) {
      avatarProgressTrack.classList.add("show");
      const url = await Api.uploadAvatar(currentUser.id, pendingAvatarFile, (pct) => {
        avatarProgressFill.style.width = pct + "%";
      });
      currentProfile.avatar_url = url;
      pendingAvatarFile = null;
    }
    if (newName && newName !== currentProfile.full_name) {
      await Api.updateProfile(currentUser.id, { full_name: newName });
      currentProfile.full_name = newName;
      document.getElementById("profileName").textContent = newName;
      document.getElementById("drawerName").textContent = newName;
    }
    const initial = (currentProfile.full_name || "ط").trim().charAt(0);
    paintAvatarEverywhere(currentProfile.avatar_url, initial);
    showToast("تم حفظ التغييرات");
    closeProfileModal();
  } catch (err) {
    showToast("تعذّر الحفظ، حاول مجددًا");
  } finally {
    btn.disabled = false;
  }
});

document.getElementById("changePassBtn").addEventListener("click", async () => {
  const errEl = document.getElementById("passError");
  errEl.classList.remove("show");
  const current = document.getElementById("currentPassInput").value;
  const next = document.getElementById("newPassInput").value;
  const confirm = document.getElementById("confirmPassInput").value;

  if (!current || !next) { errEl.textContent = "عبّي كل الحقول أولاً"; errEl.classList.add("show"); return; }
  if (next.length < 6) { errEl.textContent = "كلمة السر الجديدة لازم تكون 6 أحرف أو أكثر"; errEl.classList.add("show"); return; }
  if (next !== confirm) { errEl.textContent = "كلمة السر الجديدة غير متطابقة مع التأكيد"; errEl.classList.add("show"); return; }

  const btn = document.getElementById("changePassBtn");
  btn.disabled = true;
  const { error } = await Auth.changePassword(current, next);
  btn.disabled = false;
  if (error) {
    errEl.textContent = error.code === "auth/invalid-credential" || error.code === "auth/wrong-password"
      ? "كلمة السر الحالية غير صحيحة"
      : "تعذّر تحديث كلمة السر، حاول مجددًا";
    errEl.classList.add("show");
    return;
  }
  document.getElementById("currentPassInput").value = "";
  document.getElementById("newPassInput").value = "";
  document.getElementById("confirmPassInput").value = "";
  showToast("تم تحديث كلمة السر بنجاح");
});

// ---------- one-time welcome overlay ----------
const welcomeOverlay = document.getElementById("welcomeOverlay");
document.getElementById("welcomeCloseBtn").addEventListener("click", async () => {
  welcomeOverlay.classList.remove("open");
  if (currentUser) await Api.markWelcomed(currentUser.id);
});

document.getElementById("openArchiveBtn").addEventListener("click", openArchivePage);

// ---------- subpage: archive (saved items) ----------
async function openArchivePage() {
  const el = document.getElementById("archiveContent");
  el.innerHTML = `<div class="empty-state"><div class="e-icon">⏳</div><p class="e-sub">جاري التحميل...</p></div>`;
  openSubpage("page-archive");
  if (!currentUser) return;
  const items = await Api.getSavedItems(currentUser.id);
  if (!items.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="e-icon">🗂️</div>
      <p class="e-title">لا توجد عناصر محفوظة بعد</p>
      <p class="e-sub">احفظ فيديو أو سؤالًا وسيظهر هنا لترجع له بسهولة.</p>
    </div>`;
    return;
  }
  el.innerHTML = `<div class="lecture-list">` + items.map(it => `
    <div class="saved-item">
      <span class="s-title">${it.title || "عنصر محفوظ"}</span>
      <button class="s-remove" data-remove="${it.id}" aria-label="حذف">✕</button>
    </div>`).join("") + `</div>`;
  el.querySelectorAll("[data-remove]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await Api.removeSavedItem(btn.dataset.remove);
      openArchivePage();
    });
  });
}

// ---------- subpage: downloaded videos ----------
function openDownloadsPage() {
  document.getElementById("downloadsContent").innerHTML = `<div class="empty-state">
    <div class="e-icon">⬇️</div>
    <p class="e-title">لا توجد فيديوهات محمّلة بعد</p>
    <p class="e-sub">الفيديوهات التي تحمّلها للمشاهدة بدون إنترنت راح تنعرض هنا.</p>
  </div>`;
  openSubpage("page-downloads");
}

// ---------- subpage: subscriptions ----------
function openSubscriptionsPage() {
  document.getElementById("subscriptionsContent").innerHTML = `
    <div class="plan-card">
      <p class="p-name">الباقة المجانية</p>
      <p class="p-desc">وصول كامل لمحاضراتك وملازمك الحالية، تتبع التفاعل، وحضور الـ QR.</p>
    </div>
    <div class="empty-state">
      <div class="e-icon">💳</div>
      <p class="e-title">لا توجد باقات مدفوعة بعد</p>
      <p class="e-sub">راح نضيف باقات إضافية قريبًا وتقدر تشترك بيها من هنا.</p>
    </div>`;
  openSubpage("page-subscriptions");
}

// ---------- subpage: QR attendance code ----------
function openQrPage() {
  document.getElementById("qrContent").innerHTML = `
    <div class="qr-big-card">
      <div class="qr-square">▦</div>
      <p>اطلب من المحاضر مسح هذا الرمز لتسجيل حضورك للمحاضرة أو الامتحان الحضوري.</p>
    </div>`;
  openSubpage("page-qr");
}

// ---------- render subject grid ----------
const TILE_COLORS = ["#14304A", "#3FA796", "#F4A340", "#C1440E"];
function renderSubjects(subjects) {
  const grid = document.getElementById("subjectGrid");
  grid.innerHTML = "";
  subjects.forEach((s, i) => {
    const card = document.createElement("button");
    card.className = "subject-card";
    card.style.textAlign = "right";
    card.style.border = "1px solid var(--line)";
    card.innerHTML = `
      <div class="tile-icon" style="background:${s.color || TILE_COLORS[i % 4]}22; color:${s.color || TILE_COLORS[i % 4]}">
        ${s.icon || "📘"}
      </div>
      <div class="tile-title">${s.title}</div>
      <div class="tile-meta">${s.lectureCount ?? 0} محاضرة</div>
    `;
    card.addEventListener("click", () => openSubjectDetail(s));
    grid.appendChild(card);
  });
}

// ---------- subpage: subject detail (المحاضرات / قسم الملازم tabs) ----------
async function openSubjectDetail(subject) {
  currentSubject = subject;
  currentSubTab = "lectures";
  document.getElementById("subjectDetailTitle").textContent = subject.title;
  document.getElementById("tabLectures").classList.add("active");
  document.getElementById("tabMaterials").classList.remove("active");
  openSubpage("page-subject-detail");
  if (currentUser) Api.logActivity(currentUser.id, "lecture_view", subject.id);
  await renderSubjectTab();
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function renderSubjectTab() {
  const el = document.getElementById("subjectDetailContent");
  if (!currentSubject) return;
  el.innerHTML = `<div class="empty-state"><div class="e-icon">⏳</div><p class="e-sub">جاري التحميل...</p></div>`;

  if (currentSubTab === "lectures") {
    const lectures = await Api.getLecturesForSubject(currentSubject.id);
    if (!lectures.length) {
      el.innerHTML = `<div class="empty-state">
        <div class="e-icon">📘</div>
        <p class="e-title">لا توجد محاضرات مضافة بعد</p>
        <p class="e-sub">راح تظهر محاضرات "${escapeHtml(currentSubject.title)}" هنا أول ما يرفعها الاستاذ.</p>
      </div>`;
      return;
    }
    el.innerHTML = `<div class="lecture-list">` + lectures.map(l => `
      <a class="lecture-item" href="${l.url ? escapeHtml(l.url) : "#"}" target="_blank" rel="noopener" data-log-id="${l.id}">
        <div class="l-icon">🎬</div>
        <div>
          <p class="l-title">${escapeHtml(l.title) || "محاضرة"}</p>
          <p class="l-meta">محاضرة ${l.lecture_number ?? ""}</p>
        </div>
      </a>`).join("") + `</div>`;
    el.querySelectorAll("[data-log-id]").forEach(a => {
      a.addEventListener("click", () => { if (currentUser) Api.logActivity(currentUser.id, "lecture_open", a.dataset.logId); });
    });
  } else {
    // قسم الملازم — PDF/handout materials for this subject
    const materials = await Api.getMaterialsForSubject(currentSubject.id);
    if (!materials.length) {
      el.innerHTML = `<div class="empty-state">
        <div class="e-icon">📑</div>
        <p class="e-title">لا توجد ملازم مضافة بعد</p>
        <p class="e-sub">ملازم "${escapeHtml(currentSubject.title)}" راح تظهر هنا أول ما يرفعها الاستاذ.</p>
      </div>`;
      return;
    }
    el.innerHTML = `<div class="lecture-list">` + materials.map(m => `
      <a class="material-item" href="${m.url ? escapeHtml(m.url) : "#"}" target="_blank" rel="noopener" data-log-id="${m.id}">
        <div class="l-icon">📑</div>
        <div>
          <p class="l-title">${escapeHtml(m.title) || "ملزمة"}</p>
          <p class="l-meta">ملزمة ${m.lecture_number ?? ""}</p>
        </div>
        <span class="dl-arrow">⬇</span>
      </a>`).join("") + `</div>`;
    el.querySelectorAll("[data-log-id]").forEach(a => {
      a.addEventListener("click", () => { if (currentUser) Api.logActivity(currentUser.id, "material_open", a.dataset.logId); });
    });
  }
}

document.getElementById("tabLectures").addEventListener("click", () => {
  currentSubTab = "lectures";
  document.getElementById("tabLectures").classList.add("active");
  document.getElementById("tabMaterials").classList.remove("active");
  renderSubjectTab();
});
document.getElementById("tabMaterials").addEventListener("click", () => {
  currentSubTab = "materials";
  document.getElementById("tabMaterials").classList.add("active");
  document.getElementById("tabLectures").classList.remove("active");
  renderSubjectTab();
});

// ---------- streak ring ----------
function paintStreakRing(current) {
  const ring = document.getElementById("streakRing");
  const circumference = 364;
  const capped = Math.min(current, 30); // visually cap at a 30-day full ring
  const offset = circumference - (capped / 30) * circumference;
  ring.style.strokeDashoffset = offset;
}

// ---------- load real data ----------
async function bootstrap() {
  currentUser = await Auth.getUser();
  if (!currentUser) {
    window.location.href = "index.html";
    return;
  }

  await Api.logActivity(currentUser.id, "login");

  const profile = await Api.getProfile(currentUser.id);
  currentProfile = profile;
  if (profile) {
    document.getElementById("profileName").textContent = profile.full_name;
    document.getElementById("profileUsername").textContent = "@" + profile.username;
    document.getElementById("drawerName").textContent = profile.full_name;
    const initial = (profile.full_name || "ط").trim().charAt(0);
    paintAvatarEverywhere(profile.avatar_url, initial);

    // Teacher accounts (role set manually from the Firebase console)
    // get an extra drawer entry linking to teacher.html.
    if (profile.role === "teacher") {
      document.getElementById("teacherDrawerLink").style.display = "block";
    }

    // One-time welcome screen — shown once per account, right after
    // the very first successful sign-in.
    if (profile.welcomed === false) {
      document.getElementById("welcomeName").textContent = `أهلاً بك، ${profile.full_name || "بيك"}!`;
      welcomeOverlay.classList.add("open");
    }
  }

  const streak = await Api.getStreak(currentUser.id);
  document.getElementById("currentStreak").textContent = streak.current_streak ?? 0;
  document.getElementById("longestStreak").textContent = streak.longest_streak ?? 0;
  paintStreakRing(streak.current_streak ?? 0);

  const subjects = await Api.getSubjectsWithLectureCounts();
  renderSubjects(subjects);
}

bootstrap();

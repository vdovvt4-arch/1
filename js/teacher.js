// ============================================================
// طبيّة — teacher.js  v2.0
// Teacher panel: publish lectures & materials for their subjects
// Guarded by role check on load
// ============================================================

let currentTeacher = null;
let subjectsCache  = [];

function showToast(msg, type = "info") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast show " + type;
  setTimeout(() => t.classList.remove("show"), 3000);
}

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, c =>
    ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])
  );
}

// ── Auth Guard ─────────────────────────────────────────────
async function guardTeacher() {
  await new Promise(r => setTimeout(r, 300));
  if (!window.Auth) { window.location.href = "index.html"; return; }

  const user = await new Promise(resolve =>
    window.Auth.onAuthStateChanged(u => resolve(u))
  );
  if (!user) { window.location.href = "index.html"; return; }

  const profile = await window.Api.getProfile(user.uid);
  if (!profile) { window.location.href = "index.html"; return; }

  if (profile.role === "admin")   { window.location.href = "admin.html"; return; }
  if (profile.role !== "teacher") { window.location.href = "app.html";   return; }

  currentTeacher = { ...profile, uid: user.uid };
  document.getElementById("teacherName").textContent   = profile.full_name || "أستاذ";
  document.getElementById("teacherAvatar").textContent = (profile.full_name || "أ")[0];

  document.getElementById("authGuard").style.display   = "none";
  document.getElementById("teacherShell").style.display = "flex";

  await loadAllSubjects();
}

guardTeacher();

// ── Panel Navigation ────────────────────────────────────────
document.querySelectorAll(".admin-nav-item[data-tpanel]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".admin-panel").forEach(p => p.classList.remove("active"));
    document.querySelectorAll(".admin-nav-item").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tpanel).classList.add("active");
  });
});

// Sub-tabs
document.querySelectorAll(".admin-tab[data-tsubtab]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".admin-tab[data-tsubtab]").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".admin-subtab").forEach(t => t.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tsubtab).classList.add("active");
  });
});

// ── Load Subjects ────────────────────────────────────────────
async function loadAllSubjects() {
  subjectsCache = await window.Api.getSubjects();
  const opts = '<option value="">اختر مادة...</option>' +
    subjectsCache.map(s => `<option value="${s.id}">${esc(s.icon || "📘")} ${esc(s.title)}</option>`).join("");
  ["lecSubjectSelect", "matSubjectSelect", "myContentSubjectSelect"].forEach(id => {
    document.getElementById(id).innerHTML = opts;
  });
}

// ── File Drop Wiring ─────────────────────────────────────────
function wireDrop(dropId, inputId, label) {
  const drop  = document.getElementById(dropId);
  const input = document.getElementById(inputId);
  drop.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    if (input.files[0]) {
      drop.classList.add("has-file");
      drop.childNodes[0].textContent = "📎 " + input.files[0].name;
    } else {
      drop.classList.remove("has-file");
      drop.childNodes[0].textContent = label;
    }
  });
}
wireDrop("lecDrop", "lecFile", "📎 اختياري: اختر ملف فيديو من جهازك");
wireDrop("matDrop", "matFile", "📎 اختر ملف PDF");

// ── Publish Lecture ──────────────────────────────────────────
document.getElementById("publishLecBtn").addEventListener("click", async () => {
  const subjectId = document.getElementById("lecSubjectSelect").value;
  const title     = document.getElementById("lecTitle").value.trim();
  const url       = document.getElementById("lecUrl").value.trim();
  const file      = document.getElementById("lecFile").files[0];

  if (!subjectId) { showToast("اختر المادة أولاً", "error"); return; }
  if (!title)     { showToast("يرجى إدخال عنوان المحاضرة", "error"); return; }
  if (!url && !file) { showToast("يرجى إضافة رابط أو ملف للمحاضرة", "error"); return; }

  const btn = document.getElementById("publishLecBtn");
  btn.disabled = true; btn.textContent = "جاري النشر...";

  try {
    let file_url = null;
    if (file) {
      const prog = document.getElementById("lecProgress");
      const fill = document.getElementById("lecProgressFill");
      const text = document.getElementById("lecProgressText");
      prog.style.display = "block";
      file_url = await window.Api.uploadFile(
        `lectures/${subjectId}/${Date.now()}_${file.name}`, file,
        p => { fill.style.width = p + "%"; text.textContent = p + "%"; }
      );
      prog.style.display = "none";
    }
    await window.Api.addLecture(subjectId, {
      title,
      youtube_url:  url || null,
      file_url:     file_url || null,
      published_by: currentTeacher.uid
    });
    showToast("✅ تم نشر المحاضرة بنجاح");
    document.getElementById("lecTitle").value = "";
    document.getElementById("lecUrl").value   = "";
    document.getElementById("lecFile").value  = "";
    document.getElementById("lecDrop").classList.remove("has-file");
    document.getElementById("lecDrop").childNodes[0].textContent = "📎 اختياري: اختر ملف فيديو من جهازك";
  } catch (e) { showToast("خطأ: " + e.message, "error"); }
  finally { btn.disabled = false; btn.textContent = "🚀 نشر المحاضرة"; }
});

// ── Publish Material ─────────────────────────────────────────
document.getElementById("publishMatBtn").addEventListener("click", async () => {
  const subjectId = document.getElementById("matSubjectSelect").value;
  const title     = document.getElementById("matTitle").value.trim();
  const file      = document.getElementById("matFile").files[0];

  if (!subjectId) { showToast("اختر المادة أولاً", "error"); return; }
  if (!title)     { showToast("يرجى إدخال اسم الملف", "error"); return; }
  if (!file)      { showToast("يرجى اختيار ملف PDF", "error"); return; }

  const btn = document.getElementById("publishMatBtn");
  btn.disabled = true; btn.textContent = "جاري الرفع...";

  try {
    const prog = document.getElementById("matProgress");
    const fill = document.getElementById("matProgressFill");
    const text = document.getElementById("matProgressText");
    prog.style.display = "block";
    const file_url = await window.Api.uploadFile(
      `materials/${subjectId}/${Date.now()}_${file.name}`, file,
      p => { fill.style.width = p + "%"; text.textContent = p + "%"; }
    );
    prog.style.display = "none";
    await window.Api.addMaterial(subjectId, {
      title, file_url, published_by: currentTeacher.uid
    });
    showToast("✅ تم نشر الملف بنجاح");
    document.getElementById("matTitle").value = "";
    document.getElementById("matFile").value  = "";
    document.getElementById("matDrop").classList.remove("has-file");
    document.getElementById("matDrop").childNodes[0].textContent = "📎 اختر ملف PDF";
  } catch (e) { showToast("خطأ: " + e.message, "error"); }
  finally { btn.disabled = false; btn.textContent = "🚀 نشر الملف"; }
});

// ── My Content ───────────────────────────────────────────────
document.getElementById("myContentSubjectSelect").addEventListener("change", async (e) => {
  const id = e.target.value;
  if (!id) return;
  loadMyLectures(id);
  loadMyMaterials(id);
});

async function loadMyLectures(subjectId) {
  const el = document.getElementById("myLecList");
  el.innerHTML = '<div class="admin-loading">جاري التحميل...</div>';
  try {
    const all = await window.Api.getLectures(subjectId);
    const mine = all.filter(l => l.published_by === currentTeacher.uid);
    if (!mine.length) { el.innerHTML = '<div class="admin-empty">لم تنشر محاضرات في هذه المادة بعد</div>'; return; }
    el.innerHTML = mine.map(l => `
      <div class="admin-card">
        <div class="admin-card-header">
          <div>
            <strong>${esc(l.title)}</strong>
            ${l.youtube_url ? `<a href="${esc(l.youtube_url)}" target="_blank" class="card-link">▶️</a>` : ""}
            ${l.file_url    ? `<a href="${esc(l.file_url)}"    target="_blank" class="card-link">⬇️</a>` : ""}
          </div>
          <button class="admin-btn-danger" onclick="deleteMyLec('${subjectId}','${l.id}')">🗑️ حذف</button>
        </div>
      </div>
    `).join("");
  } catch (e) { el.innerHTML = `<div class="admin-error">${esc(e.message)}</div>`; }
}

window.deleteMyLec = async (subjectId, id) => {
  if (!confirm("هل تريد حذف هذه المحاضرة؟")) return;
  try {
    await window.Api.deleteLecture(subjectId, id);
    showToast("تم الحذف");
    loadMyLectures(subjectId);
  } catch (e) { showToast("خطأ: " + e.message, "error"); }
};

async function loadMyMaterials(subjectId) {
  const el = document.getElementById("myMatList");
  el.innerHTML = '<div class="admin-loading">جاري التحميل...</div>';
  try {
    const all = await window.Api.getMaterials(subjectId);
    const mine = all.filter(m => m.published_by === currentTeacher.uid);
    if (!mine.length) { el.innerHTML = '<div class="admin-empty">لم تنشر ملازم في هذه المادة بعد</div>'; return; }
    el.innerHTML = mine.map(m => `
      <div class="admin-card">
        <div class="admin-card-header">
          <div>
            <strong>${esc(m.title)}</strong>
            ${m.file_url ? `<a href="${esc(m.file_url)}" target="_blank" class="card-link">⬇️ تحميل</a>` : ""}
          </div>
          <button class="admin-btn-danger" onclick="deleteMyMat('${subjectId}','${m.id}')">🗑️ حذف</button>
        </div>
      </div>
    `).join("");
  } catch (e) { el.innerHTML = `<div class="admin-error">${esc(e.message)}</div>`; }
}

window.deleteMyMat = async (subjectId, id) => {
  if (!confirm("هل تريد حذف هذا الملف؟")) return;
  try {
    await window.Api.deleteMaterial(subjectId, id);
    showToast("تم الحذف");
    loadMyMaterials(subjectId);
  } catch (e) { showToast("خطأ: " + e.message, "error"); }
};

// ── Logout ────────────────────────────────────────────────────
document.getElementById("teacherLogoutBtn").addEventListener("click", async () => {
  await window.Auth.signOut();
  window.location.href = "index.html";
});

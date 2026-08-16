// ============================================================
// طبيّة — admin.js  v2.0
// Full admin panel: overview, teacher requests, subjects,
// lectures, materials, user management
// ============================================================

let currentAdmin = null;
let allSubjectsCache = [];
let currentRequestFilter = "pending";
let currentUserFilter    = "all";
let editingSubjectId     = null;

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
async function guardAdmin() {
  await new Promise(r => setTimeout(r, 300));
  if (!window.Auth) { window.location.href = "index.html"; return; }

  const user = await new Promise(resolve =>
    window.Auth.onAuthStateChanged(u => resolve(u))
  );
  if (!user) { window.location.href = "index.html"; return; }

  const profile = await window.Api.getProfile(user.uid);
  if (!profile || profile.role !== "admin") {
    if (profile?.role === "teacher") window.location.href = "teacher.html";
    else window.location.href = "app.html";
    return;
  }

  currentAdmin = { ...profile, uid: user.uid };
  document.getElementById("adminName").textContent =
    profile.full_name || "مسؤول";
  document.getElementById("adminAvatar").textContent =
    (profile.full_name || "أ")[0];

  document.getElementById("authGuard").style.display  = "none";
  document.getElementById("adminShell").style.display = "flex";

  initPanel();
}

guardAdmin();

// ── Panel Navigation ────────────────────────────────────────
function switchPanel(panelId) {
  document.querySelectorAll(".admin-panel").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".admin-nav-item").forEach(b => {
    b.classList.toggle("active", b.dataset.panel === panelId);
  });
  document.getElementById(panelId).classList.add("active");
  loadPanelData(panelId);
}

window.switchPanel = switchPanel;

document.querySelectorAll(".admin-nav-item").forEach(btn => {
  btn.addEventListener("click", () => switchPanel(btn.dataset.panel));
});

function initPanel() {
  loadOverview();
  loadSubjects();
  loadRequests();
  loadUsers();
}

async function loadPanelData(panelId) {
  if (panelId === "panel-overview")  loadOverview();
  if (panelId === "panel-requests")  loadRequests();
  if (panelId === "panel-subjects")  loadSubjects();
  if (panelId === "panel-lectures")  populateSubjectSelect();
  if (panelId === "panel-users")     loadUsers();
}

// ── Overview ────────────────────────────────────────────────
async function loadOverview() {
  try {
    const [users, subjects, requests] = await Promise.all([
      window.Api.getAllUsers(),
      window.Api.getSubjects(),
      window.Api.getTeacherRequests()
    ]);
    const students  = users.filter(u => u.role === "student").length;
    const teachers  = users.filter(u => u.role === "teacher").length;
    const pending   = requests.filter(r => r.status === "pending").length;

    document.getElementById("stat-students").textContent = students;
    document.getElementById("stat-teachers").textContent = teachers;
    document.getElementById("stat-subjects").textContent = subjects.length;
    document.getElementById("stat-requests").textContent = pending;

    if (pending > 0) {
      const badge = document.getElementById("requestsBadge");
      badge.textContent = pending;
      badge.style.display = "inline-flex";
    }
  } catch (e) {
    console.error("loadOverview:", e);
  }
}

// ── Teacher Requests ─────────────────────────────────────────
async function loadRequests() {
  const list = document.getElementById("requestsList");
  list.innerHTML = '<div class="admin-loading">جاري التحميل...</div>';
  try {
    let requests = await window.Api.getTeacherRequests();
    if (currentRequestFilter !== "all")
      requests = requests.filter(r => r.status === currentRequestFilter);

    if (!requests.length) {
      list.innerHTML = '<div class="admin-empty">لا توجد طلبات</div>';
      return;
    }

    list.innerHTML = requests.map(r => `
      <div class="admin-card request-card" data-uid="${esc(r.id)}">
        <div class="admin-card-header">
          <div>
            <strong>${esc(r.full_name)}</strong>
            <span class="tag tag-${r.status}">${statusLabel(r.status)}</span>
          </div>
          <span class="card-date">${formatDate(r.created_at)}</span>
        </div>
        <div class="admin-card-body">
          <p>📧 ${esc(r.email)}</p>
          <p>🎓 ${esc(r.specialty)}</p>
          ${r.bio ? `<p>📝 ${esc(r.bio)}</p>` : ""}
        </div>
        ${r.status === "pending" ? `
          <div class="admin-card-actions">
            <button class="admin-btn-success" onclick="approveRequest('${esc(r.id)}')">✅ قبول</button>
            <button class="admin-btn-danger"  onclick="rejectRequest('${esc(r.id)}')">❌ رفض</button>
          </div>` : ""}
      </div>
    `).join("");
  } catch (e) {
    list.innerHTML = `<div class="admin-error">خطأ: ${esc(e.message)}</div>`;
  }
}

window.approveRequest = async (uid) => {
  if (!await confirm2("هل تريد قبول طلب الانضمام كأستاذ؟")) return;
  try {
    await window.Api.approveTeacherRequest(uid);
    showToast("✅ تم قبول الطلب وترقية الحساب كأستاذ");
    loadRequests(); loadOverview();
  } catch (e) { showToast("خطأ: " + e.message, "error"); }
};
window.rejectRequest = async (uid) => {
  if (!await confirm2("هل تريد رفض هذا الطلب؟")) return;
  try {
    await window.Api.rejectTeacherRequest(uid);
    showToast("تم رفض الطلب");
    loadRequests();
  } catch (e) { showToast("خطأ: " + e.message, "error"); }
};

document.querySelectorAll(".filter-btn[data-filter]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn[data-filter]").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentRequestFilter = btn.dataset.filter;
    loadRequests();
  });
});

// ── Subjects ────────────────────────────────────────────────
async function loadSubjects() {
  const list = document.getElementById("subjectsList");
  list.innerHTML = '<div class="admin-loading">جاري التحميل...</div>';
  try {
    allSubjectsCache = await window.Api.getSubjectsWithLectureCounts();
    if (!allSubjectsCache.length) {
      list.innerHTML = '<div class="admin-empty">لا توجد مواد — أضف الأولى أعلاه</div>';
      return;
    }
    list.innerHTML = allSubjectsCache.map(s => `
      <div class="admin-card">
        <div class="admin-card-header">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:1.6rem;">${esc(s.icon || "📘")}</span>
            <div>
              <strong>${esc(s.title)}</strong>
              <div style="font-size:.8rem;color:#888;">${s.lectureCount} محاضرة · ${s.materialCount} ملزمة</div>
            </div>
          </div>
          <div class="admin-card-actions">
            <button class="admin-btn-ghost" onclick="editSubject('${s.id}')">✏️</button>
            <button class="admin-btn-danger" onclick="deleteSubject('${s.id}', '${esc(s.title)}')">🗑️</button>
          </div>
        </div>
      </div>
    `).join("");
  } catch (e) {
    list.innerHTML = `<div class="admin-error">خطأ: ${esc(e.message)}</div>`;
  }
}

document.getElementById("addSubjectBtn").addEventListener("click", () => {
  editingSubjectId = null;
  document.getElementById("subjectFormTitle").textContent = "إضافة مادة جديدة";
  document.getElementById("subjectTitle").value = "";
  document.getElementById("subjectIcon").value  = "";
  document.getElementById("subjectColor").value = "#14304A";
  document.getElementById("subjectOrder").value = "99";
  document.getElementById("subjectDesc").value  = "";
  document.getElementById("subjectFormCard").style.display = "block";
});
document.getElementById("cancelSubjectBtn").addEventListener("click", () => {
  document.getElementById("subjectFormCard").style.display = "none";
  editingSubjectId = null;
});

document.getElementById("saveSubjectBtn").addEventListener("click", async () => {
  const data = {
    title: document.getElementById("subjectTitle").value.trim(),
    icon:  document.getElementById("subjectIcon").value.trim() || "📘",
    color: document.getElementById("subjectColor").value,
    order: parseInt(document.getElementById("subjectOrder").value) || 99,
    description: document.getElementById("subjectDesc").value.trim()
  };
  if (!data.title) { showToast("يرجى إدخال اسم المادة", "error"); return; }
  try {
    if (editingSubjectId) {
      await window.Api.updateSubject(editingSubjectId, data);
      showToast("✅ تم تحديث المادة");
    } else {
      await window.Api.addSubject(data);
      showToast("✅ تمت إضافة المادة");
    }
    document.getElementById("subjectFormCard").style.display = "none";
    editingSubjectId = null;
    loadSubjects();
  } catch (e) { showToast("خطأ: " + e.message, "error"); }
});

window.editSubject = (id) => {
  const s = allSubjectsCache.find(x => x.id === id);
  if (!s) return;
  editingSubjectId = id;
  document.getElementById("subjectFormTitle").textContent = "تعديل المادة";
  document.getElementById("subjectTitle").value = s.title || "";
  document.getElementById("subjectIcon").value  = s.icon  || "";
  document.getElementById("subjectColor").value = s.color || "#14304A";
  document.getElementById("subjectOrder").value = s.order || 1;
  document.getElementById("subjectDesc").value  = s.description || "";
  document.getElementById("subjectFormCard").style.display = "block";
  document.getElementById("subjectFormCard").scrollIntoView({ behavior: "smooth" });
};

window.deleteSubject = async (id, title) => {
  if (!await confirm2(`هل تريد حذف مادة "${title}"؟`)) return;
  try {
    await window.Api.deleteSubject(id);
    showToast("تم حذف المادة");
    loadSubjects();
  } catch (e) { showToast("خطأ: " + e.message, "error"); }
};

// ── Lectures & Materials ─────────────────────────────────────
async function populateSubjectSelect() {
  const sel = document.getElementById("adminSubjectSelect");
  const subjects = allSubjectsCache.length ? allSubjectsCache : await window.Api.getSubjects();
  allSubjectsCache = subjects;
  sel.innerHTML = '<option value="">اختر مادة...</option>' +
    subjects.map(s => `<option value="${s.id}">${esc(s.icon || "📘")} ${esc(s.title)}</option>`).join("");
}

document.getElementById("adminSubjectSelect").addEventListener("change", async (e) => {
  const id = e.target.value;
  if (!id) return;
  loadAdminLectures(id);
  loadAdminMaterials(id);
});

// Sub-tabs
document.querySelectorAll(".admin-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".admin-tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".admin-subtab").forEach(t => t.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.subtab).classList.add("active");
  });
});

// File drop wiring
function wireDrop(dropId, inputId) {
  const drop  = document.getElementById(dropId);
  const input = document.getElementById(inputId);
  drop.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    if (input.files[0]) {
      drop.classList.add("has-file");
      drop.childNodes[0].textContent = "📎 " + input.files[0].name;
    }
  });
}
wireDrop("adminLecDrop", "adminLecFile");
wireDrop("adminMatDrop", "adminMatFile");

async function loadAdminLectures(subjectId) {
  const el = document.getElementById("adminLecList");
  el.innerHTML = '<div class="admin-loading">جاري التحميل...</div>';
  try {
    const lecs = await window.Api.getLectures(subjectId);
    if (!lecs.length) { el.innerHTML = '<div class="admin-empty">لا توجد محاضرات</div>'; return; }
    el.innerHTML = lecs.map(l => `
      <div class="admin-card">
        <div class="admin-card-header">
          <div>
            <strong>${esc(l.title)}</strong>
            ${l.youtube_url ? `<a href="${esc(l.youtube_url)}" target="_blank" class="card-link">▶️ مشاهدة</a>` : ""}
            ${l.file_url    ? `<a href="${esc(l.file_url)}"    target="_blank" class="card-link">⬇️ تحميل</a>` : ""}
          </div>
          <button class="admin-btn-danger" onclick="deleteLecture('${subjectId}','${l.id}')">🗑️</button>
        </div>
      </div>
    `).join("");
  } catch (e) { el.innerHTML = `<div class="admin-error">${esc(e.message)}</div>`; }
}

document.getElementById("addLecBtn").addEventListener("click", async () => {
  const subjectId = document.getElementById("adminSubjectSelect").value;
  if (!subjectId) { showToast("اختر مادة أولاً", "error"); return; }
  const title  = document.getElementById("lecTitle").value.trim();
  const url    = document.getElementById("lecUrl").value.trim();
  const file   = document.getElementById("adminLecFile").files[0];
  if (!title)  { showToast("يرجى إدخال عنوان المحاضرة", "error"); return; }

  const btn = document.getElementById("addLecBtn");
  btn.disabled = true; btn.textContent = "جاري الرفع...";

  try {
    let file_url = null;
    if (file) {
      const prog = document.getElementById("adminLecProgress");
      const fill = document.getElementById("adminLecProgressFill");
      const text = document.getElementById("adminLecProgressText");
      prog.style.display = "block";
      file_url = await window.Api.uploadFile(
        `lectures/${subjectId}/${Date.now()}_${file.name}`, file,
        p => { fill.style.width = p + "%"; text.textContent = p + "%"; }
      );
      prog.style.display = "none";
    }
    await window.Api.addLecture(subjectId, {
      title,
      youtube_url: url || null,
      file_url:    file_url || null,
      published_by: currentAdmin.uid
    });
    showToast("✅ تمت إضافة المحاضرة");
    document.getElementById("lecTitle").value = "";
    document.getElementById("lecUrl").value   = "";
    document.getElementById("adminLecFile").value = "";
    document.getElementById("adminLecDrop").classList.remove("has-file");
    document.getElementById("adminLecDrop").childNodes[0].textContent = "📎 اختر ملف فيديو";
    loadAdminLectures(subjectId);
  } catch (e) { showToast("خطأ: " + e.message, "error"); }
  finally { btn.disabled = false; btn.textContent = "➕ إضافة محاضرة"; }
});

window.deleteLecture = async (subjectId, lectureId) => {
  if (!await confirm2("هل تريد حذف هذه المحاضرة؟")) return;
  try {
    await window.Api.deleteLecture(subjectId, lectureId);
    showToast("تم الحذف"); loadAdminLectures(subjectId);
  } catch (e) { showToast("خطأ: " + e.message, "error"); }
};

async function loadAdminMaterials(subjectId) {
  const el = document.getElementById("adminMatList");
  el.innerHTML = '<div class="admin-loading">جاري التحميل...</div>';
  try {
    const mats = await window.Api.getMaterials(subjectId);
    if (!mats.length) { el.innerHTML = '<div class="admin-empty">لا توجد ملازم</div>'; return; }
    el.innerHTML = mats.map(m => `
      <div class="admin-card">
        <div class="admin-card-header">
          <div>
            <strong>${esc(m.title)}</strong>
            ${m.file_url ? `<a href="${esc(m.file_url)}" target="_blank" class="card-link">⬇️ تحميل</a>` : ""}
          </div>
          <button class="admin-btn-danger" onclick="deleteMaterial('${subjectId}','${m.id}')">🗑️</button>
        </div>
      </div>
    `).join("");
  } catch (e) { el.innerHTML = `<div class="admin-error">${esc(e.message)}</div>`; }
}

document.getElementById("addMatBtn").addEventListener("click", async () => {
  const subjectId = document.getElementById("adminSubjectSelect").value;
  if (!subjectId) { showToast("اختر مادة أولاً", "error"); return; }
  const title = document.getElementById("matTitle").value.trim();
  const file  = document.getElementById("adminMatFile").files[0];
  if (!title)  { showToast("يرجى إدخال اسم الملف", "error"); return; }
  if (!file)   { showToast("يرجى اختيار ملف PDF", "error"); return; }

  const btn = document.getElementById("addMatBtn");
  btn.disabled = true; btn.textContent = "جاري الرفع...";

  try {
    const prog = document.getElementById("adminMatProgress");
    const fill = document.getElementById("adminMatProgressFill");
    const text = document.getElementById("adminMatProgressText");
    prog.style.display = "block";
    const file_url = await window.Api.uploadFile(
      `materials/${subjectId}/${Date.now()}_${file.name}`, file,
      p => { fill.style.width = p + "%"; text.textContent = p + "%"; }
    );
    prog.style.display = "none";
    await window.Api.addMaterial(subjectId, {
      title, file_url, published_by: currentAdmin.uid
    });
    showToast("✅ تمت إضافة الملف");
    document.getElementById("matTitle").value = "";
    document.getElementById("adminMatFile").value = "";
    document.getElementById("adminMatDrop").classList.remove("has-file");
    document.getElementById("adminMatDrop").childNodes[0].textContent = "📎 اختر ملف PDF";
    loadAdminMaterials(subjectId);
  } catch (e) { showToast("خطأ: " + e.message, "error"); }
  finally { btn.disabled = false; btn.textContent = "➕ إضافة ملف"; }
});

window.deleteMaterial = async (subjectId, matId) => {
  if (!await confirm2("هل تريد حذف هذا الملف؟")) return;
  try {
    await window.Api.deleteMaterial(subjectId, matId);
    showToast("تم الحذف"); loadAdminMaterials(subjectId);
  } catch (e) { showToast("خطأ: " + e.message, "error"); }
};

// ── Users ────────────────────────────────────────────────────
async function loadUsers() {
  const list = document.getElementById("usersList");
  list.innerHTML = '<div class="admin-loading">جاري التحميل...</div>';
  try {
    let users = await window.Api.getAllUsers();
    if (currentUserFilter !== "all")
      users = users.filter(u => u.role === currentUserFilter);

    if (!users.length) { list.innerHTML = '<div class="admin-empty">لا توجد نتائج</div>'; return; }

    list.innerHTML = users.map(u => `
      <div class="admin-card">
        <div class="admin-card-header">
          <div>
            <strong>${esc(u.full_name || "—")}</strong>
            <span class="tag tag-role-${u.role || "student"}">${roleLabel(u.role)}</span>
          </div>
          <div class="admin-card-actions" style="gap:6px;">
            ${u.uid !== currentAdmin?.uid ? `
              <select class="role-select" onchange="changeRole('${u.uid}', this.value)">
                <option value="student"  ${u.role === "student"  ? "selected" : ""}>طالب</option>
                <option value="teacher"  ${u.role === "teacher"  ? "selected" : ""}>أستاذ</option>
                <option value="admin"    ${u.role === "admin"    ? "selected" : ""}>مسؤول</option>
              </select>
            ` : '<span style="color:#888;font-size:.8rem;">أنت</span>'}
          </div>
        </div>
        <div style="font-size:.82rem;color:#666;margin-top:4px;">
          ${esc(u.email || "")}
        </div>
      </div>
    `).join("");
  } catch (e) { list.innerHTML = `<div class="admin-error">${esc(e.message)}</div>`; }
}

window.changeRole = async (uid, role) => {
  try {
    await window.Api.setUserRole(uid, role);
    showToast(`✅ تم تغيير الدور إلى ${roleLabel(role)}`);
    loadOverview();
  } catch (e) { showToast("خطأ: " + e.message, "error"); }
};

document.querySelectorAll(".filter-btn[data-userfilter]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn[data-userfilter]").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentUserFilter = btn.dataset.userfilter;
    loadUsers();
  });
});

// ── Logout ────────────────────────────────────────────────────
document.getElementById("adminLogoutBtn").addEventListener("click", async () => {
  await window.Auth.signOut();
  window.location.href = "index.html";
});

// ── Confirm Dialog ────────────────────────────────────────────
function confirm2(msg) {
  return new Promise(resolve => {
    document.getElementById("confirmMsg").textContent = msg;
    document.getElementById("confirmOverlay").style.display = "flex";
    const yes = document.getElementById("confirmYes");
    const no  = document.getElementById("confirmNo");
    const close = (val) => {
      document.getElementById("confirmOverlay").style.display = "none";
      resolve(val);
    };
    yes.onclick = () => close(true);
    no.onclick  = () => close(false);
  });
}

// ── Helpers ────────────────────────────────────────────────
function statusLabel(s) {
  return { pending: "معلّق", approved: "مقبول", rejected: "مرفوض" }[s] || s;
}
function roleLabel(r) {
  return { admin: "مسؤول", teacher: "أستاذ", student: "طالب" }[r] || r;
}
function formatDate(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("ar");
}

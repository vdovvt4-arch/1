// ============================================================
// Firebase configuration & data layer.
// Drop-in replacement for supabase-client.js — exposes the same
// `Auth` and `Api` objects so app.js / auth-page.js work unchanged.
//
// Loaded as an ES module:
// <script type="module" src="js/firebase-client.js"></script>
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider,
  OAuthProvider, signOut, updateProfile as fbUpdateAuthProfile,
  RecaptchaVerifier, signInWithPhoneNumber,
  updatePassword as fbUpdatePassword, reauthenticateWithCredential,
  EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, collection,
  addDoc, getDocs, query, where, orderBy, deleteDoc, serverTimestamp,
  runTransaction, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBL_7_tJuNMmTbRvFJg5igFeD3HfU61mdU",
  authDomain: "max7-b1bc4.firebaseapp.com",
  projectId: "max7-b1bc4",
  storageBucket: "max7-b1bc4.firebasestorage.app",
  messagingSenderId: "201739788532",
  appId: "1:201739788532:web:afddaa4dcf3621fa8a3ea1",
  measurementId: "G-9RMCZP1PFR"
};

const app = initializeApp(firebaseConfig);
// Analytics only works over https/localhost — guard so file:// or
// unsupported environments don't throw.
try { getAnalytics(app); } catch (e) { /* analytics unsupported here */ }

const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

function randomUsername() {
  return "user_" + Math.random().toString(36).slice(2, 8);
}

// ------------------------------------------------------------
// Create the Firestore profile/streak docs the first time a
// user signs in (mirrors the Postgres trigger in the Supabase version).
// Every new profile is created with role:"student" — teacher accounts
// are promoted manually from the Firebase console (Firestore ->
// profiles/{uid} -> set role to "teacher") so a student can never
// grant themselves teacher access from the client. The public
// meta/stats.studentCount counter is bumped once per brand-new account
// so the login screen can show a live "registered students" figure.
// ------------------------------------------------------------
async function ensureUserDocs(user, extra = {}) {
  const profileRef = doc(db, "profiles", user.uid);
  const existing = await getDoc(profileRef);
  if (!existing.exists()) {
    await setDoc(profileRef, {
      full_name: extra.full_name || user.displayName || "طالب جديد",
      username: extra.username || randomUsername(),
      avatar_url: user.photoURL || null,
      academic_year: 2,
      role: "student",
      welcomed: false,
      created_at: serverTimestamp()
    });
    await setDoc(doc(db, "streaks", user.uid), {
      current_streak: 0,
      longest_streak: 0,
      last_active_date: null
    });
    // Public counter — read by index.html before login, so keep it
    // in its own tiny doc instead of counting the profiles collection
    // (which non-signed-in visitors can't query).
    await setDoc(doc(db, "meta", "stats"), { studentCount: increment(1) }, { merge: true });
  }
}

// ------------------------------------------------------------
// AUTH
// ------------------------------------------------------------
const Auth = {
  async signUpWithEmail(email, password, fullName, username) {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await fbUpdateAuthProfile(cred.user, { displayName: fullName });
      await ensureUserDocs(cred.user, { full_name: fullName, username });
      return { data: cred, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  async signInWithEmail(email, password) {
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await ensureUserDocs(cred.user);
      return { data: cred, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  async signInWithGoogle() {
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      await ensureUserDocs(cred.user);
      return { data: cred, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  async signInWithApple() {
    try {
      const cred = await signInWithPopup(auth, new OAuthProvider("apple.com"));
      await ensureUserDocs(cred.user);
      return { data: cred, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Firebase Phone Auth sends a standard SMS OTP (no native WhatsApp
  // channel like Supabase's `channel: "whatsapp"`). Kept under the same
  // method names so the UI flow (ask phone → ask code) stays identical.
  async requestWhatsAppOtp(phone) {
    try {
      if (!window.__recaptchaVerifier) {
        window.__recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
      }
      const confirmation = await signInWithPhoneNumber(auth, phone, window.__recaptchaVerifier);
      window.__confirmationResult = confirmation;
      return { error: null };
    } catch (error) {
      return { error };
    }
  },

  async verifyWhatsAppOtp(phone, token) {
    try {
      const cred = await window.__confirmationResult.confirm(token);
      await ensureUserDocs(cred.user);
      return { error: null };
    } catch (error) {
      return { error };
    }
  },

  async signOut() {
    return await signOut(auth);
  },

  // Real password change: Firebase requires a fresh sign-in before it
  // will accept updatePassword, so we reauthenticate with the current
  // password first — this is also how we validate it's actually correct.
  async changePassword(currentPassword, newPassword) {
    try {
      const user = auth.currentUser;
      if (!user || !user.email) return { error: { message: "لا يمكن تغيير كلمة السر لهذا نوع الحساب" } };
      const cred = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, cred);
      await fbUpdatePassword(user, newPassword);
      return { error: null };
    } catch (error) {
      return { error };
    }
  },

  async getUser() {
    return new Promise((resolve) => {
      const unsub = onAuthStateChanged(auth, (user) => {
        unsub();
        resolve(user ? { id: user.uid, email: user.email } : null);
      });
    });
  },

  onAuthStateChange(callback) {
    return onAuthStateChanged(auth, (user) => callback("AUTH_STATE_CHANGE", { user }));
  }
};

// ------------------------------------------------------------
// DATA (Firestore)
// ------------------------------------------------------------
const Api = {
  async getProfile(userId) {
    const snap = await getDoc(doc(db, "profiles", userId));
    return snap.exists() ? { id: userId, ...snap.data() } : null;
  },

  async updateProfile(userId, fields) {
    return await updateDoc(doc(db, "profiles", userId), fields);
  },

  async getStreak(userId) {
    const snap = await getDoc(doc(db, "streaks", userId));
    return snap.exists() ? snap.data() : { current_streak: 0, longest_streak: 0 };
  },

  async getSubjectsWithLectureCounts() {
    const subjSnap = await getDocs(query(collection(db, "subjects"), orderBy("sort_order")));
    const lecSnap = await getDocs(collection(db, "lectures"));
    const lectures = lecSnap.docs.map(d => d.data());
    return subjSnap.docs.map(d => {
      const s = { id: d.id, ...d.data() };
      s.lectureCount = lectures.filter(l => l.subject_id === d.id).length;
      return s;
    });
  },

  async getLecturesForSubject(subjectId) {
    const snap = await getDocs(
      query(collection(db, "lectures"), where("subject_id", "==", subjectId), orderBy("lecture_number"))
    );
    // content_type is missing on older/legacy docs — treat those as
    // regular video lectures so nothing that already exists disappears.
    return snap.docs
      .map(d => ({ id: d.id, content_type: "video", ...d.data() }))
      .filter(l => (l.content_type || "video") === "video");
  },

  // "قسم الملازم" — PDF/handout materials for a subject, stored in the
  // same `lectures` collection with content_type:"note" so one teacher
  // dashboard manages both without a second schema.
  async getMaterialsForSubject(subjectId) {
    const snap = await getDocs(
      query(collection(db, "lectures"), where("subject_id", "==", subjectId), orderBy("lecture_number"))
    );
    return snap.docs
      .map(d => ({ id: d.id, content_type: "video", ...d.data() }))
      .filter(l => l.content_type === "note");
  },

  // Everything for a subject regardless of type — used by the teacher
  // dashboard so the instructor sees one combined manage-list.
  async getAllContentForSubject(subjectId) {
    const snap = await getDocs(
      query(collection(db, "lectures"), where("subject_id", "==", subjectId), orderBy("lecture_number"))
    );
    return snap.docs.map(d => ({ id: d.id, content_type: "video", ...d.data() }));
  },

  // Teacher-only: publish a new lecture (video) or ملزمة (note/PDF).
  // Firestore rules double-check role:"teacher" server-side.
  async addContent(subjectId, { title, lecture_number, content_type, url, file_path }) {
    return await addDoc(collection(db, "lectures"), {
      subject_id: subjectId,
      title: title || "بدون عنوان",
      lecture_number: Number(lecture_number) || 0,
      content_type: content_type === "note" ? "note" : "video",
      url: url || null,
      file_path: file_path || null,
      created_at: serverTimestamp()
    });
  },

  // Teacher-only: remove a lecture/ملزمة, and its uploaded file if any.
  async deleteContent(id, file_path) {
    if (file_path) {
      try { await deleteObject(storageRef(storage, file_path)); } catch (e) { /* already gone / external URL */ }
    }
    return await deleteDoc(doc(db, "lectures", id));
  },

  // Uploads a file (PDF ملزمة or a small video clip) to Firebase Storage
  // and resolves with its public download URL + storage path (the path
  // is kept so deleteContent() can clean the file up later).
  uploadFile(path, file, onProgress) {
    return new Promise((resolve, reject) => {
      const ref = storageRef(storage, path);
      const task = uploadBytesResumable(ref, file);
      task.on("state_changed",
        (snap) => {
          if (onProgress) onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
        },
        (error) => reject(error),
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve({ url, path });
        }
      );
    });
  },

  // Real avatar upload — replaces the initial-letter placeholder with
  // the student's actual photo, stored under avatars/{uid}/... and
  // mirrored onto both the Firestore profile and the Firebase Auth user.
  async uploadAvatar(userId, file, onProgress) {
    const path = `avatars/${userId}/${Date.now()}_${file.name}`;
    const { url } = await Api.uploadFile(path, file, onProgress);
    await updateDoc(doc(db, "profiles", userId), { avatar_url: url });
    if (auth.currentUser) {
      try { await fbUpdateAuthProfile(auth.currentUser, { photoURL: url }); } catch (e) { /* non-fatal */ }
    }
    return url;
  },

  // Public "registered students" counter — safe to read before login
  // (see firestore.rules: meta/stats is the one publicly readable doc).
  async getStudentCount() {
    try {
      const snap = await getDoc(doc(db, "meta", "stats"));
      return snap.exists() ? (snap.data().studentCount || 0) : 0;
    } catch (e) {
      return 0;
    }
  },

  // Marks the one-time welcome screen as seen so it never shows twice.
  async markWelcomed(userId) {
    return await updateDoc(doc(db, "profiles", userId), { welcomed: true });
  },

  // Mirrors the Postgres bump_streak trigger, done client-side via a
  // Firestore transaction so concurrent writes stay consistent.
  async logActivity(userId, activity_type, ref_id = null) {
    await addDoc(collection(db, "activity_log"), {
      user_id: userId, activity_type, ref_id, created_at: serverTimestamp()
    });

    const streakRef = doc(db, "streaks", userId);
    const today = new Date().toISOString().slice(0, 10);

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(streakRef);
      const s = snap.exists() ? snap.data() : { current_streak: 0, longest_streak: 0, last_active_date: null };

      if (s.last_active_date === today) return; // already counted today

      let current;
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (s.last_active_date === yesterday) {
        current = (s.current_streak || 0) + 1;
      } else {
        current = 1;
      }
      const longest = Math.max(s.longest_streak || 0, current);

      tx.set(streakRef, { current_streak: current, longest_streak: longest, last_active_date: today }, { merge: true });
    });
  },

  async getSavedItems(userId) {
    const snap = await getDocs(
      query(collection(db, "saved_items"), where("user_id", "==", userId), orderBy("created_at", "desc"))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async saveItem(userId, item_type, ref_id, title) {
    return await addDoc(collection(db, "saved_items"), {
      user_id: userId, item_type, ref_id, title, created_at: serverTimestamp()
    });
  },

  async removeSavedItem(id) {
    return await deleteDoc(doc(db, "saved_items", id));
  },

  async recordAttendance(sessionId, userId) {
    return await setDoc(doc(db, "attendance_records", `${sessionId}_${userId}`), {
      session_id: sessionId, user_id: userId, scanned_at: serverTimestamp()
    });
  }
};

// Expose globally so app.js / auth-page.js (regular scripts) can use them.
window.Auth = Auth;
window.Api = Api;
window.dispatchEvent(new Event("firebase-ready"));


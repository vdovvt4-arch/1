import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const auth = getAuth();
const db = getFirestore();

let isLoginMode = true;

const tabLogin = document.getElementById('tabLogin');
const tabSignup = document.getElementById('tabSignup');
const signupFields = document.getElementById('signupFields');
const roleSelector = document.getElementById('roleSelector');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const stageField = document.getElementById('stageField');

tabSignup.addEventListener('click', () => {
    isLoginMode = false;
    signupFields.style.display = 'block';
    roleSelector.style.display = 'flex';
    authSubmitBtn.textContent = 'إنشاء حساب جديد';
    tabSignup.classList.add('active');
    tabLogin.classList.remove('active');
});

tabLogin.addEventListener('click', () => {
    isLoginMode = true;
    signupFields.style.display = 'none';
    roleSelector.style.display = 'none';
    authSubmitBtn.textContent = 'دخول';
    tabLogin.classList.add('active');
    tabSignup.classList.remove('active');
});

// إخفاء حقل المرحلة إذا اختار "أستاذ"
document.querySelectorAll('input[name="userRole"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        if(e.target.value === 'teacher') {
            stageField.style.display = 'none';
        } else {
            stageField.style.display = 'block';
        }
    });
});

document.getElementById('emailForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('emailInput').value;
    const password = document.getElementById('passInput').value;
    
    authSubmitBtn.disabled = true;
    authSubmitBtn.textContent = 'جاري التحميل...';

    try {
        if (isLoginMode) {
            // تسجيل الدخول
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const userDoc = await getDoc(doc(db, "users", userCredential.user.uid));
            
            if (userDoc.exists() && userDoc.data().role === 'teacher') {
                window.location.href = 'teacher.html';
            } else {
                window.location.href = 'app.html';
            }
        } else {
            // إنشاء حساب جديد
            const role = document.querySelector('input[name="userRole"]:checked').value;
            const name = document.getElementById('nameInput').value;
            const stage = role === 'student' ? document.getElementById('stageInput').value : null;
            
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            
            // حفظ بيانات المستخدم في فايرستور
            await setDoc(doc(db, "users", userCredential.user.uid), {
                name: name,
                email: email,
                role: role,
                stage: stage,
                createdAt: new Date()
            });
            
            if (role === 'teacher') window.location.href = 'teacher.html';
            else window.location.href = 'app.html';
        }
    } catch (error) {
        alert("حدث خطأ: تأكد من البيانات المدخلة، أو قد يكون الإيميل مستخدم مسبقاً.");
        authSubmitBtn.disabled = false;
        authSubmitBtn.textContent = isLoginMode ? 'دخول' : 'إنشاء حساب جديد';
    }
});

// شروط الاستخدام
const openTerms = document.getElementById('openTerms');
const closeTerms = document.getElementById('closeTerms');
const termsModal = document.getElementById('termsModal');

if(openTerms && closeTerms && termsModal) {
    openTerms.addEventListener('click', (e) => {
        e.preventDefault();
        termsModal.style.display = 'flex';
    });
    closeTerms.addEventListener('click', () => {
        termsModal.style.display = 'none';
    });
}

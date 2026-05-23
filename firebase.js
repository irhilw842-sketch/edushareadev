/* ============================================
   EduShare - Firebase Config & Auth System v2
   Secure per-subject admin permissions
   ============================================ */
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

<<<<<<< HEAD
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

=======
>>>>>>> a3ce2a9c38f867d92db122e39b7ff277af59149e
// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyA_B32KxGmbO0mY60edPUL9u1xBXjM2YHo",
  authDomain: "edushare-8f39b.firebaseapp.com",
  projectId: "edushare-8f39b",
  storageBucket: "edushare-8f39b.firebasestorage.app",
  messagingSenderId: "374595933733",
  appId: "1:374595933733:web:5a34bab9240254ae6291cc",
  measurementId: "G-VGE9J7S7JW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

/* ---- Subject registry ---- */
const SUBJECTS = [
    { id: 'math',         name: 'Mathématiques',          icon: 'fa-square-root-variable', color: '#2563EB', bg: '#EEF2FF' },
    { id: 'francais',     name: 'Français',                icon: 'fa-language',             color: '#DB2777', bg: '#FCE7F3' },
    { id: 'anglais',      name: 'Anglais',                 icon: 'fa-globe',                color: '#2563EB', bg: '#DBEAFE' },
    { id: 'svt',          name: 'SVT',                     icon: 'fa-dna',                  color: '#22C55E', bg: '#DCFCE7' },
    { id: 'informatique', name: 'Informatique',            icon: 'fa-laptop-code',          color: '#9333EA', bg: '#F3E8FF' },
    { id: 'physique',     name: 'Physique',                icon: 'fa-flask',                color: '#D97706', bg: '#FEF3C7' },
    { id: 'industrielle', name: 'Technologie Industrielle',icon: 'fa-industry',             color: '#4F46E5', bg: '#E0E7FF' },
    { id: 'primaire',     name: 'Enseignement Primaire',   icon: 'fa-child',                color: '#EC4899', bg: '#FCE7F3' }
];

function getSubject(id)     { return SUBJECTS.find(s => s.id === id) || null; }
function getSubjectName(id) { return getSubject(id)?.name   || id; }
function getSubjectIcon(id) { return getSubject(id)?.icon   || 'fa-book'; }

/* ---- Firestore admin doc key (dots not allowed as doc IDs) ---- */
function emailToKey(email) {
    return email.toLowerCase().replace(/\./g, ',');
}

/* ============================================================
   checkAdminPrivileges(email)
   Returns the admin Firestore document or null.

   Expected Firestore structure  (collection: "admins"):
   Document ID = email with dots replaced by commas
   Fields:
     name    : string   – display name
     subject : string   – subject id this admin may manage
     active  : boolean  – false = account suspended
     role    : string   – "admin" | "superadmin"
============================================================ */
async function checkAdminPrivileges(email) {
    try {
        const ref  = db.collection('admins').doc(emailToKey(email));
        const snap = await ref.get();
        if (!snap.exists) return null;
        const data = snap.data();
        if (data.active === false) return null;   // suspended account
        return data;
    } catch (err) {
        console.error('[EduShare] checkAdminPrivileges:', err);
        return null;
    }
}

/* ============================================================
   signInAdmin(email, password)
   Returns { success, user?, adminData?, error? }
============================================================ */
async function signInAdmin(email, password) {
    try {
        const result    = await auth.signInWithEmailAndPassword(email, password);
        const adminData = await checkAdminPrivileges(email);

        if (!adminData) {
            await auth.signOut();
            return { success: false, error: "Cet email n'a pas les droits administrateur sur EduShare." };
        }

        /* Log last login (non-blocking) */
        db.collection('admins').doc(emailToKey(email)).update({
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(() => {});

        return { success: true, user: result.user, adminData };

    } catch (err) {
        const MESSAGES = {
            'auth/user-not-found':       'Aucun compte trouvé avec cet email.',
            'auth/wrong-password':       'Mot de passe incorrect.',
            'auth/invalid-credential':   'Email ou mot de passe incorrect.',
            'auth/invalid-email':        "Format d'email invalide.",
            'auth/too-many-requests':    'Trop de tentatives. Veuillez réessayer dans quelques minutes.',
            'auth/network-request-failed': 'Erreur réseau. Vérifiez votre connexion.',
            'auth/user-disabled':        'Ce compte a été désactivé.'
        };
        return { success: false, error: MESSAGES[err.code] || `Erreur inattendue (${err.code}).` };
    }
}

/* ---- sign out ---- */
async function signOutAdmin() {
    try   { await auth.signOut(); return { success: true }; }
    catch (err) { return { success: false, error: err.message }; }
}

/* ============================================================
   canManageSubject(adminData, subjectId)
   Returns true only if the admin owns that subject
   OR has the "superadmin" role.
============================================================ */
function canManageSubject(adminData, subjectId) {
    if (!adminData) return false;
    if (adminData.role === 'superadmin') return true;
    return adminData.subject === subjectId;
}

/* ============================================================
   Auth state guard – runs on every page load.
   Admin pages redirect to login if unauthenticated or
   if the logged-in admin tries to access another subject.
============================================================ */
auth.onAuthStateChanged(async (user) => {
    const path          = window.location.pathname;
    const isAdminPage   = path.includes('/pages/admin/');
    const isLoginPage   = path.includes('/connexion.html');

    if (isAdminPage) {
        if (!user) {
            window.location.replace('/pages/connexion.html');
            return;
        }

        const adminData = await checkAdminPrivileges(user.email);
        if (!adminData) {
            await auth.signOut();
            window.location.replace('/pages/connexion.html');
            return;
        }

        const pageSubject = path.split('/').pop().replace('.html', '');
        if (!canManageSubject(adminData, pageSubject)) {
            /* Redirect to the admin's own subject page */
            window.location.replace(`/pages/admin/${adminData.subject}.html`);
        }
    }

    /* Redirect already-authenticated admin away from login page */
    if (isLoginPage && user) {
        const adminData = await checkAdminPrivileges(user.email);
        if (adminData?.subject) {
            window.location.replace(`/pages/admin/${adminData.subject}.html`);
        }
    }
});

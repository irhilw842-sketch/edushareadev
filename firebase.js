/* ============================================
   EduShare - Firebase Configuration
   ============================================ */
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

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

const SUBJECTS = [
    { id: 'math', name: 'Mathématiques', icon: 'fa-square-root-variable', color: '#2563EB', bg: '#EEF2FF' },
    { id: 'francais', name: 'Français', icon: 'fa-language', color: '#DB2777', bg: '#FCE7F3' },
    { id: 'anglais', name: 'Anglais', icon: 'fa-globe', color: '#2563EB', bg: '#DBEAFE' },
    { id: 'svt', name: 'SVT', icon: 'fa-dna', color: '#22C55E', bg: '#DCFCE7' },
    { id: 'informatique', name: 'Informatique', icon: 'fa-laptop-code', color: '#9333EA', bg: '#F3E8FF' },
    { id: 'physique', name: 'Physique', icon: 'fa-flask', color: '#D97706', bg: '#FEF3C7' },
    { id: 'industrielle', name: 'Technologie Industrielle', icon: 'fa-industry', color: '#4F46E5', bg: '#E0E7FF' },
    { id: 'primaire', name: 'Enseignement Primaire', icon: 'fa-child', color: '#EC4899', bg: '#FCE7F3' }
];

function getSubjectName(subjectId) {
    const subject = SUBJECTS.find(s => s.id === subjectId);
    return subject ? subject.name : subjectId;
}

function getSubjectIcon(subjectId) {
    const subject = SUBJECTS.find(s => s.id === subjectId);
    return subject ? subject.icon : 'fa-book';
}

function getRedirectPath(subjectId) {
    return `/pages/admin/${subjectId}.html`;
}

async function checkAdminPrivileges(email) {
    try {
        const doc = await db.collection('admins').doc(email.replace(/\./g, ',')).get();
        if (doc.exists) {
            return doc.data();
        }
        return null;
    } catch (error) {
        console.error('Erreur vérification admin:', error);
        return null;
    }
}

async function signInAdmin(email, password) {
    try {
        const result = await auth.signInWithEmailAndPassword(email, password);
        const adminData = await checkAdminPrivileges(email);
        if (!adminData) {
            await auth.signOut();
            return { success: false, error: 'Cet email n\'a pas les privilèges administrateur.' };
        }
        return { success: true, user: result.user, adminData };
    } catch (error) {
        let message = 'Erreur de connexion.';
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            message = 'Email ou mot de passe incorrect.';
        } else if (error.code === 'auth/invalid-email') {
            message = 'Format d\'email invalide.';
        } else if (error.code === 'auth/too-many-requests') {
            message = 'Trop de tentatives. Réessayez plus tard.';
        }
        return { success: false, error: message };
    }
}

async function signOutAdmin() {
    try {
        await auth.signOut();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function getCurrentAdmin() {
    const user = auth.currentUser;
    if (!user) return null;
    const adminData = await checkAdminPrivileges(user.email);
    return adminData ? { user, adminData } : null;
}

auth.onAuthStateChanged(async (user) => {
    const currentPath = window.location.pathname;
    const isAdminPage = currentPath.includes('/pages/admin/');

    if (isAdminPage) {
        if (!user) {
            window.location.href = '/pages/connexion.html';
            return;
        }
        const adminData = await checkAdminPrivileges(user.email);
        if (!adminData) {
            await auth.signOut();
            window.location.href = '/pages/connexion.html';
            return;
        }
        const expectedSubject = currentPath.split('/').pop().replace('.html', '');
        if (adminData.subject !== expectedSubject && expectedSubject !== 'dashboard') {
            window.location.href = getRedirectPath(adminData.subject);
        }
    }
});

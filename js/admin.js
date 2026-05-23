/* ============================================
   EduShare – js/admin.js  v2
   Per-subject security + fast upload + errors
   ============================================ */

const API_BASE = '/api/upload';

/* ── Bootstrap ─────────────────────────────────────────── */

async function initAdminPage(subjectId) {
    /* Auth guard: firebase.js onAuthStateChanged handles redirect,
       but we double-check here for defence-in-depth */
    const user = auth.currentUser;
    if (!user) {
        redirectToLogin('Session expirée.');
        return;
    }

    const adminData = await checkAdminPrivileges(user.email);
    if (!adminData) {
        await auth.signOut();
        redirectToLogin('Privilèges insuffisants.');
        return;
    }

    /* Strict subject check */
    if (!canManageSubject(adminData, subjectId)) {
        showBanner(
            `⚠️  Vous n'êtes pas autorisé à gérer la matière "${subjectId}". ` +
            `Votre matière assignée est "${getSubjectName(adminData.subject)}".`,
            'error', 0
        );
        setTimeout(() => {
            window.location.replace(`/pages/admin/${adminData.subject}.html`);
        }, 3000);
        return;
    }

    /* Populate UI */
    setText('adminName',   adminData.name  || user.email);
    setText('subjectName', getSubjectName(subjectId));
    const icon = document.getElementById('subjectIcon');
    if (icon) {
        icon.className = `fas ${getSubjectIcon(subjectId)}`;
    }

    /* Wire up form */
    const form = document.getElementById('uploadForm');
    if (form) form.addEventListener('submit', e => { e.preventDefault(); handleUpload(subjectId); });

    /* Logout button */
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', async () => {
        await signOutAdmin();
        window.location.replace('/pages/connexion.html');
    });

    /* Load files */
    await loadFiles(subjectId);
}

/* ── Upload ─────────────────────────────────────────────── */

async function handleUpload(subjectId) {
    const fileInput   = document.getElementById('fileInput');
    const folderInput = document.getElementById('folderInput');
    const submitBtn   = document.getElementById('submitBtn');
    const progressBar = document.getElementById('progressFill');
    const progressBox = document.getElementById('uploadProgress');
    const progressTxt = document.getElementById('progressText');

    if (!fileInput?.files?.length) {
        showBanner('Veuillez sélectionner un fichier avant d\'uploader.', 'error');
        return;
    }

    const file   = fileInput.files[0];
    const folder = (folderInput?.value.trim()) || 'General';

    /* Client-side size check (50 MB) */
    if (file.size > 50 * 1024 * 1024) {
        showBanner(`Fichier trop volumineux (${(file.size/1024/1024).toFixed(1)} Mo). Maximum autorisé : 50 Mo.`, 'error');
        return;
    }

    /* UI: disable & show progress */
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Upload en cours…';
    if (progressBox) progressBox.style.display = 'block';

    const formData = new FormData();
    formData.append('file',    file);
    formData.append('subject', subjectId);
    formData.append('folder',  folder);

    try {
        /* Use XHR for real upload progress */
        const result = await xhrUpload(API_BASE, formData, pct => {
            if (progressBar) progressBar.style.width = pct + '%';
            if (progressTxt) progressTxt.textContent = pct < 100
                ? `Upload : ${pct}%`
                : 'Finalisation…';
        });

        if (result.success) {
            showBanner(`✅  "${result.fileName}" uploadé avec succès dans le dossier "${result.folder}".`, 'success');
            fileInput.value = '';
            if (folderInput) folderInput.value = 'General';
            await loadFiles(subjectId);
        } else {
            showBanner(`❌  Échec de l'upload : ${result.error || 'Erreur inconnue.'}`, 'error');
        }

    } catch (e) {
        showBanner(`❌  Erreur réseau : ${e.message}. Vérifiez votre connexion et réessayez.`, 'error');
    }

    /* Reset UI */
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fas fa-upload"></i> Uploader le fichier';
    if (progressBox) progressBox.style.display = 'none';
    if (progressBar) progressBar.style.width = '0%';
}

/* XHR wrapper for real upload progress */
function xhrUpload(url, formData, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url);
        xhr.upload.addEventListener('progress', e => {
            if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100));
        });
        xhr.addEventListener('load', () => {
            try   { resolve(JSON.parse(xhr.responseText)); }
            catch { reject(new Error('Réponse serveur invalide.')); }
        });
        xhr.addEventListener('error',   () => reject(new Error('Connexion interrompue.')));
        xhr.addEventListener('timeout', () => reject(new Error('Le serveur n\'a pas répondu (timeout).')));
        xhr.timeout = 120000;   // 2 min max
        xhr.send(formData);
    });
}

/* ── Load & render files ────────────────────────────────── */

async function loadFiles(subjectId) {
    const container = document.getElementById('filesContainer');
    if (!container) return;
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Chargement des fichiers…</div>';

    try {
        const res    = await fetch(`${API_BASE}?subject=${subjectId}`, { cache: 'no-store' });
        const result = await res.json();

        if (!res.ok) {
            container.innerHTML = errorState(`Erreur serveur (${res.status}) : ${result.error || 'inconnue'}.`);
            return;
        }

        if (!result.files?.length) {
            container.innerHTML = emptyState('Aucun fichier uploadé pour le moment.');
            return;
        }

        /* Group by folder */
        const grouped = {};
        result.files.forEach(f => {
            const k = f.folder || 'General';
            (grouped[k] = grouped[k] || []).push(f);
        });

        let html = '';
        for (const [folder, files] of Object.entries(grouped)) {
            html += `
            <div class="folder-section">
                <h3 class="folder-title">
                    <i class="fas fa-folder-open" style="color:var(--primary)"></i>
                    ${escHtml(folder)}
                    <span class="file-count">(${files.length} fichier${files.length > 1 ? 's' : ''})</span>
                </h3>`;
            files.forEach(f => {
                const ext      = f.fileName.split('.').pop().toLowerCase();
                const iconCls  = fileIconClass(ext);
                const iconFa   = fileIcon(ext);
                const sizeFmt  = formatSize(f.size);
                const dateFmt  = f.uploadedAt ? new Date(f.uploadedAt).toLocaleDateString('fr-FR') : '';
                html += `
                <div class="file-card" data-name="${escHtml(f.fileName.toLowerCase())}">
                    <div class="file-icon ${iconCls}"><i class="fas ${iconFa}"></i></div>
                    <div class="file-info">
                        <h4>${escHtml(f.fileName)}</h4>
                        <span>${sizeFmt}${dateFmt ? ' · ' + dateFmt : ''}</span>
                    </div>
                    <a href="${escHtml(f.url)}" target="_blank" rel="noopener" class="file-download" title="Télécharger">
                        <i class="fas fa-download"></i>
                    </a>
                    <button class="file-delete" onclick="deleteFile('${escHtml(f.url)}','${subjectId}')" title="Supprimer ce fichier">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>`;
            });
            html += '</div>';
        }
        container.innerHTML = html;

        /* Wire search if present */
        wireSearch();

    } catch (e) {
        container.innerHTML = errorState(`Impossible de charger les fichiers : ${e.message}`);
    }
}

/* ── Delete ─────────────────────────────────────────────── */

async function deleteFile(url, subjectId) {
    if (!confirm('Supprimer ce fichier ? Cette action est irréversible.')) return;

    try {
        const res    = await fetch(API_BASE, {
            method:  'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ url })
        });
        const result = await res.json();

        if (result.success) {
            showBanner('🗑️  Fichier supprimé avec succès.', 'success');
            await loadFiles(subjectId);
        } else {
            showBanner(`❌  Suppression échouée : ${result.error}`, 'error');
        }
    } catch (e) {
        showBanner(`❌  Erreur réseau lors de la suppression : ${e.message}`, 'error');
    }
}

/* ── Search ─────────────────────────────────────────────── */

function wireSearch() {
    const input = document.getElementById('searchInput');
    if (!input) return;
    input.addEventListener('input', () => {
        const q = input.value.toLowerCase().trim();
        document.querySelectorAll('.file-card').forEach(card => {
            const name = card.dataset.name || '';
            card.style.display = name.includes(q) ? '' : 'none';
        });
        /* Hide empty folder sections */
        document.querySelectorAll('.folder-section').forEach(sec => {
            const visible = [...sec.querySelectorAll('.file-card')].some(c => c.style.display !== 'none');
            sec.style.display = visible ? '' : 'none';
        });
    });
}

/* ── UI helpers ─────────────────────────────────────────── */

function showBanner(msg, type = 'success', duration = 5000) {
    const el = document.getElementById('message');
    if (!el) { console[type === 'error' ? 'error' : 'log'](msg); return; }
    el.textContent = msg;
    el.className   = `message message-${type}`;
    el.style.display = 'block';
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (duration > 0) setTimeout(() => { el.style.display = 'none'; }, duration);
}

function redirectToLogin(reason) {
    sessionStorage.setItem('loginError', reason);
    window.location.replace('/pages/connexion.html');
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function escHtml(str) {
    return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function emptyState(msg) {
    return `<div class="empty-state"><i class="fas fa-folder-open"></i><p>${msg}</p></div>`;
}

function errorState(msg) {
    return `<div class="empty-state">
        <i class="fas fa-exclamation-triangle" style="color:#DC2626"></i>
        <p style="color:#DC2626">${msg}</p>
        <p style="font-size:.85rem;margin-top:8px">Consultez la console pour plus de détails.</p>
    </div>`;
}

/* ── File type helpers ──────────────────────────────────── */

function fileIconClass(ext) {
    if (['pdf'].includes(ext))                              return 'pdf';
    if (['doc','docx','txt'].includes(ext))                 return 'doc';
    if (['mp4','avi','mov','mkv','webm'].includes(ext))     return 'video';
    if (['png','jpg','jpeg','gif','svg','webp'].includes(ext)) return 'image';
    if (['xls','xlsx'].includes(ext))                       return 'excel';
    if (['ppt','pptx'].includes(ext))                       return 'ppt';
    if (['zip','rar','7z'].includes(ext))                   return 'archive';
    return 'doc';
}

function fileIcon(ext) {
    const map = {
        pdf:'fa-file-pdf', doc:'fa-file-word', docx:'fa-file-word', txt:'fa-file-lines',
        mp4:'fa-video', avi:'fa-video', mov:'fa-video', mkv:'fa-video', webm:'fa-video',
        png:'fa-image', jpg:'fa-image', jpeg:'fa-image', gif:'fa-image', svg:'fa-image', webp:'fa-image',
        xls:'fa-file-excel', xlsx:'fa-file-excel',
        ppt:'fa-file-powerpoint', pptx:'fa-file-powerpoint',
        zip:'fa-file-zipper', rar:'fa-file-zipper', '7z':'fa-file-zipper'
    };
    return map[ext] || 'fa-file';
}

function formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024)        return bytes + ' o';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko';
    return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
}

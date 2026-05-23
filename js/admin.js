/* ============================================
   EduShare - Admin JavaScript
   ============================================ */

const API_BASE = '/api/upload';

async function initAdminPage(subjectId) {
    const user = auth.currentUser;
    if (!user) {
        window.location.href = '/pages/connexion.html';
        return;
    }

    const adminData = await checkAdminPrivileges(user.email);
    if (!adminData || adminData.subject !== subjectId) {
        await auth.signOut();
        window.location.href = '/pages/connexion.html';
        return;
    }

    document.getElementById('adminName').textContent = adminData.name || user.email;
    document.getElementById('subjectName').textContent = getSubjectName(subjectId);
    document.getElementById('subjectIcon').className = `fas ${getSubjectIcon(subjectId)}`;

    await loadFiles(subjectId);

    const form = document.getElementById('uploadForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleUpload(subjectId);
        });
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await signOutAdmin();
            window.location.href = '/pages/connexion.html';
        });
    }
}

async function handleUpload(subjectId) {
    const fileInput = document.getElementById('fileInput');
    const folderInput = document.getElementById('folderInput');
    const progress = document.getElementById('uploadProgress');
    const submitBtn = document.getElementById('submitBtn');

    if (!fileInput.files.length) {
        showMessage('Veuillez sélectionner un fichier', 'error');
        return;
    }

    const file = fileInput.files[0];
    const folder = folderInput.value.trim() || 'General';

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Upload...';
    progress.style.display = 'block';
    progress.querySelector('span').textContent = 'Upload en cours...';

    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('subject', subjectId);
        formData.append('folder', folder);

        const response = await fetch(API_BASE, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            showMessage('Fichier uploadé avec succès !', 'success');
            fileInput.value = '';
            await loadFiles(subjectId);
        } else {
            showMessage('Erreur: ' + (result.error || 'Échec de l\'upload'), 'error');
        }
    } catch (error) {
        showMessage('Erreur de connexion au serveur.', 'error');
    }

    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fas fa-upload"></i> Uploader le fichier';
    progress.style.display = 'none';
}

async function loadFiles(subjectId) {
    const container = document.getElementById('filesContainer');
    if (!container) return;

    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>';

    try {
        const response = await fetch(`${API_BASE}?subject=${subjectId}`);
        const result = await response.json();

        if (!result.files || result.files.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-folder-open"></i><p>Aucun fichier pour le moment</p></div>';
            return;
        }

        const grouped = {};
        result.files.forEach(file => {
            const folder = file.folder || 'General';
            if (!grouped[folder]) grouped[folder] = [];
            grouped[folder].push(file);
        });

        let html = '';
        for (const [folder, files] of Object.entries(grouped)) {
            html += `<div class="folder-section">
                <h3 class="folder-title"><i class="fas fa-folder" style="color: var(--primary);"></i> ${folder} <span class="file-count">(${files.length})</span></h3>`;

            files.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

            files.forEach(file => {
                const ext = file.fileName.split('.').pop().toLowerCase();
                const iconClass = getFileIconClass(ext);
                const sizeFormatted = formatFileSize(file.size);

                html += `<div class="file-card">
                    <div class="file-icon ${iconClass}"><i class="${getFileIcon(ext)}"></i></div>
                    <div class="file-info">
                        <h4>${file.fileName}</h4>
                        <span>${sizeFormatted} • ${new Date(file.uploadedAt).toLocaleDateString('fr-FR')}</span>
                    </div>
                    <a href="${file.url}" target="_blank" class="file-download" title="Télécharger"><i class="fas fa-download"></i></a>
                    <button class="file-delete" onclick="deleteFile('${file.url}','${subjectId}')" title="Supprimer"><i class="fas fa-trash"></i></button>
                </div>`;
            });

            html += '</div>';
        }

        container.innerHTML = html;

    } catch (error) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle" style="color: #DC2626;"></i><p>Erreur de chargement. Vérifiez que l\'API Vercel Blob est configurée.</p></div>';
    }
}

async function deleteFile(url, subjectId) {
    if (!confirm('Supprimer ce fichier ? Cette action est irréversible.')) return;

    try {
        const response = await fetch(API_BASE, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        const result = await response.json();

        if (result.success) {
            showMessage('Fichier supprimé', 'success');
            await loadFiles(subjectId);
        } else {
            showMessage('Erreur lors de la suppression', 'error');
        }
    } catch (error) {
        showMessage('Erreur de connexion', 'error');
    }
}

function getFileIconClass(ext) {
    if (['pdf'].includes(ext)) return 'pdf';
    if (['doc', 'docx'].includes(ext)) return 'doc';
    if (['mp4', 'avi', 'mov', 'mkv'].includes(ext)) return 'video';
    if (['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext)) return 'image';
    return 'doc';
}

function getFileIcon(ext) {
    if (['pdf'].includes(ext)) return 'fas fa-file-pdf';
    if (['doc', 'docx'].includes(ext)) return 'fas fa-file-word';
    if (['mp4', 'avi', 'mov', 'mkv'].includes(ext)) return 'fas fa-video';
    if (['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext)) return 'fas fa-image';
    if (['xls', 'xlsx'].includes(ext)) return 'fas fa-file-excel';
    if (['ppt', 'pptx'].includes(ext)) return 'fas fa-file-powerpoint';
    if (['zip', 'rar'].includes(ext)) return 'fas fa-file-archive';
    return 'fas fa-file';
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' o';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko';
    return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
}

function showMessage(msg, type) {
    const el = document.getElementById('message');
    if (!el) return;
    el.textContent = msg;
    el.className = `message message-${type}`;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 4000);
}

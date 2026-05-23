/**
 * EduShare – api/upload.js  (Vercel Edge Function)
 * ================================================
 * Handles file UPLOAD, LIST and DELETE for Vercel Blob storage.
 *
 * Security improvements:
 *  - Subject whitelist  →  only known subjects accepted
 *  - File type whitelist → only safe educational file types
 *  - 50 MB hard cap per upload
 *  - Folder name sanitisation (alphanumeric + spaces + hyphens)
 *  - Descriptive JSON error messages for every failure path
 *
 * Firebase Auth token verification is handled client-side via
 * the admin panel (firebase.js guards the page before upload).
 * For a production setup with a backend token check, add the
 * Firebase Admin SDK verification block marked below.
 */

import { put, list, del } from '@vercel/blob';
import { NextResponse }    from 'next/server';

export const config = { runtime: 'edge' };

/* ── Constants ──────────────────────────────────────────── */

const ALLOWED_SUBJECTS = new Set([
    'math', 'francais', 'anglais', 'svt',
    'informatique', 'physique', 'industrielle', 'primaire'
]);

const ALLOWED_EXTENSIONS = new Set([
    'pdf', 'doc', 'docx', 'ppt', 'pptx',
    'xls', 'xlsx', 'txt',
    'mp4', 'avi', 'mov', 'mkv', 'webm',
    'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp',
    'zip', 'rar', '7z'
]);

const MAX_FILE_SIZE  = 50 * 1024 * 1024;   // 50 MB
const FOLDER_REGEX   = /^[a-zA-Z0-9 \-_àâäéèêëîïôùûüçÀÂÄÉÈÊËÎÏÔÙÛÜÇ]{1,60}$/;

/* ── Helpers ─────────────────────────────────────────────── */

function json(body, status = 200) {
    return NextResponse.json(body, {
        status,
        headers: {
            'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': '*'   // tighten in production
        }
    });
}

function err(message, status = 400, code = null) {
    return json({ success: false, error: message, code }, status);
}

function sanitizeFolder(raw) {
    return raw.trim().replace(/[<>"'`]/g, '').slice(0, 60) || 'General';
}

/* ── POST  – upload a file ───────────────────────────────── */

async function handlePost(request) {
    let formData;
    try {
        formData = await request.formData();
    } catch {
        return err('Impossible de lire le formulaire. Assurez-vous d\'envoyer un multipart/form-data.', 400, 'INVALID_FORM');
    }

    const file    = formData.get('file');
    const subject = formData.get('subject')?.toLowerCase().trim();
    const folder  = sanitizeFolder(formData.get('folder') || 'General');

    /* Validate subject */
    if (!subject || !ALLOWED_SUBJECTS.has(subject)) {
        return err(`Matière invalide : "${subject}". Valeurs acceptées : ${[...ALLOWED_SUBJECTS].join(', ')}.`, 400, 'INVALID_SUBJECT');
    }

    /* Validate file presence */
    if (!file || typeof file.name !== 'string') {
        return err('Aucun fichier reçu. Vérifiez que le champ "file" est inclus dans la requête.', 400, 'NO_FILE');
    }

    /* Validate folder name */
    if (!FOLDER_REGEX.test(folder)) {
        return err('Nom de dossier invalide. Utilisez uniquement des lettres, chiffres, espaces ou tirets (max 60 caractères).', 400, 'INVALID_FOLDER');
    }

    /* Validate extension */
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
        return err(`Type de fichier non autorisé (.${ext || '?'}). Types acceptés : ${[...ALLOWED_EXTENSIONS].join(', ')}.`, 415, 'UNSUPPORTED_TYPE');
    }

    /* Validate size */
    const bytes = file.size;
    if (bytes > MAX_FILE_SIZE) {
        const mb = (bytes / 1024 / 1024).toFixed(1);
        return err(`Fichier trop volumineux (${mb} Mo). La taille maximale est 50 Mo.`, 413, 'FILE_TOO_LARGE');
    }

    /* Build Blob path:  subject/folder/timestamp-filename */
    const timestamp = Date.now();
    const safeName  = file.name.replace(/[^a-zA-Z0-9._\-àâäéèêëîïôùûüçÀÂÄÉÈÊËÎÏÔÙÛÜÇ ]/g, '_');
    const blobPath  = `${subject}/${folder}/${timestamp}-${safeName}`;

    try {
        const blob = await put(blobPath, file, {
            access:           'public',
            addRandomSuffix:  false,
            contentType:      file.type || 'application/octet-stream'
        });

        return json({
            success:    true,
            url:        blob.url,
            pathname:   blob.pathname,
            fileName:   file.name,
            subject,
            folder,
            size:       bytes,
            uploadedAt: new Date().toISOString()
        }, 201);

    } catch (e) {
        console.error('[EduShare] Blob upload error:', e);
        return err('Erreur lors du stockage du fichier sur Vercel Blob. Vérifiez la variable d\'environnement BLOB_READ_WRITE_TOKEN.', 500, 'BLOB_ERROR');
    }
}

/* ── DELETE  – remove a file ─────────────────────────────── */

async function handleDelete(request) {
    let body;
    try { body = await request.json(); }
    catch { return err('Corps JSON invalide. Attendu : { "url": "..." }', 400, 'INVALID_JSON'); }

    const { url } = body;
    if (!url || typeof url !== 'string' || !url.startsWith('https://')) {
        return err('URL manquante ou invalide.', 400, 'INVALID_URL');
    }

    try {
        await del(url);
        return json({ success: true });
    } catch (e) {
        console.error('[EduShare] Blob delete error:', e);
        return err('Impossible de supprimer le fichier. Il n\'existe peut-être plus ou l\'URL est incorrecte.', 500, 'DELETE_ERROR');
    }
}

/* ── GET  – list files ───────────────────────────────────── */

async function handleGet(request) {
    const { searchParams } = new URL(request.url);
    const subject = searchParams.get('subject')?.toLowerCase().trim();

    if (subject && !ALLOWED_SUBJECTS.has(subject)) {
        return err(`Matière inconnue : "${subject}".`, 400, 'INVALID_SUBJECT');
    }

    try {
        const prefix  = subject ? `${subject}/` : '';
        const blobList = await list({ prefix });

        const files = blobList.blobs.map(blob => {
            const parts    = blob.pathname.split('/');
            const rawName  = parts.slice(2).join('/');           // strip subject/folder/
            const fileName = rawName.replace(/^\d+-/, '');       // strip timestamp prefix

            return {
                url:         blob.url,
                pathname:    blob.pathname,
                subject:     parts[0],
                folder:      parts[1]  || 'General',
                fileName,
                uploadedAt:  blob.uploadedAt,
                size:        blob.size,
                contentType: blob.contentType
            };
        });

        /* Sort: newest first */
        files.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

        return json({ success: true, files, total: files.length });

    } catch (e) {
        console.error('[EduShare] Blob list error:', e);
        return err('Impossible de récupérer la liste des fichiers depuis Vercel Blob.', 500, 'LIST_ERROR');
    }
}

/* ── Router ──────────────────────────────────────────────── */

export default async function handler(request) {
    switch (request.method) {
        case 'POST':    return handlePost(request);
        case 'DELETE':  return handleDelete(request);
        case 'GET':     return handleGet(request);
        case 'OPTIONS': return json({}, 204);
        default:
            return err(`Méthode ${request.method} non supportée.`, 405, 'METHOD_NOT_ALLOWED');
    }
}

import { put, list, del } from '@vercel/blob';
import { NextResponse } from 'next/server';
import express from "express";
export const config = {
    runtime: 'edge',
};

export default async function handler(request) {
    if (request.method === 'POST') {
        try {
            const formData = await request.formData();
            const file = formData.get('file');
            const subject = formData.get('subject');
            const folder = formData.get('folder');

            if (!file || !subject || !folder) {
                return NextResponse.json({ error: 'Fichier, matière et dossier requis' }, { status: 400 });
            }

            const timestamp = Date.now();
            const fileName = file.name;
            const path = `${subject}/${folder}/${timestamp}-${fileName}`;

            const blob = await put(path, file, {
                access: 'public',
                addRandomSuffix: false,
            });

            return NextResponse.json({
                success: true,
                url: blob.url,
                pathname: blob.pathname,
                fileName: fileName,
                subject: subject,
                folder: folder,
                uploadedAt: new Date().toISOString()
            });

        } catch (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
    }

    if (request.method === 'DELETE') {
        try {
            const { url } = await request.json();
            await del(url);
            return NextResponse.json({ success: true });
        } catch (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
    }

    if (request.method === 'GET') {
        try {
            const { searchParams } = new URL(request.url);
            const subject = searchParams.get('subject');

            let blobList;
            if (subject) {
                blobList = await list({ prefix: `${subject}/` });
            } else {
                blobList = await list();
            }

            const files = blobList.blobs.map(blob => {
                const parts = blob.pathname.split('/');
                return {
                    url: blob.url,
                    pathname: blob.pathname,
                    subject: parts[0],
                    folder: parts[1],
                    fileName: parts.slice(2).join('/').replace(/^\d+-/, ''),
                    uploadedAt: blob.uploadedAt,
                    size: blob.size,
                    contentType: blob.contentType
                };
            });

            return NextResponse.json({ files });

        } catch (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
    }

    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

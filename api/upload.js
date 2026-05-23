import { put, list, del } from '@vercel/blob';

export const config = {
    runtime: 'nodejs',
};

export default async function handler(request, response) {

    if (request.method === 'POST') {
        try {
            const formData = await request.formData();
            const file = formData.get('file');
            const subject = formData.get('subject');
            const folder = formData.get('folder');

            if (!file || !subject || !folder) {
                return response.status(400).json({
                    error: 'Fichier, matière et dossier requis'
                });
            }

            const timestamp = Date.now();
            const fileName = file.name;
            const path = `${subject}/${folder}/${timestamp}-${fileName}`;

            const blob = await put(path, file, {
                access: 'public',
                addRandomSuffix: false,
            });

            return response.status(200).json({
                success: true,
                url: blob.url,
                pathname: blob.pathname,
                fileName,
                subject,
                folder,
                uploadedAt: new Date().toISOString()
            });

        } catch (error) {
            return response.status(500).json({
                error: error.message
            });
        }
    }

    if (request.method === 'DELETE') {
        try {
            const { url } = request.body;

            await del(url);

            return response.status(200).json({
                success: true
            });

        } catch (error) {
            return response.status(500).json({
                error: error.message
            });
        }
    }

    if (request.method === 'GET') {
        try {
            const subject = request.query.subject;

            let blobList;

            if (subject) {
                blobList = await list({
                    prefix: `${subject}/`
                });
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

            return response.status(200).json({ files });

        } catch (error) {
            return response.status(500).json({
                error: error.message
            });
        }
    }

    return response.status(405).json({
        error: 'Method not allowed'
    });
}

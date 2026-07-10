import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import { DoclingClient } from '@/lib/docling/client';
import {
  extractTablesFromDocument,
  extractImagesFromDocument,
  suggestColumnMapping,
} from '@/lib/docling/extractors';

export const config = {
  api: { bodyParser: false },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const form = formidable({ maxFileSize: 50 * 1024 * 1024 });

  let fields: formidable.Fields;
  let files: formidable.Files;
  try {
    [fields, files] = await form.parse(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'File upload failed';
    return res.status(400).json({ error: message });
  }

  const file = Array.isArray(files.file) ? files.file[0] : files.file;
  if (!file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const client = new DoclingClient();

  const healthy = await client.isHealthy();
  if (!healthy) {
    return res.status(503).json({
      error:
        'Docling service niet beschikbaar. Start de service met: docker compose up -d',
    });
  }

  const buffer = fs.readFileSync(file.filepath);
  const filename = file.originalFilename || 'document.pdf';

  let result;
  try {
    result = await client.convertFile(buffer, filename, {
      to_formats: ['json', 'md'],
      table_mode:
        (fields.table_mode?.[0] as 'fast' | 'accurate') || 'accurate',
      include_images: fields.include_images?.[0] !== 'false',
      image_export_mode: 'embedded',
      do_ocr: fields.do_ocr?.[0] === 'true',
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Document processing failed';
    return res.status(500).json({ error: message });
  } finally {
    fs.unlink(file.filepath, () => {});
  }

  if (result.status === 'failure') {
    return res
      .status(500)
      .json({ error: 'Document processing failed', errors: result.errors });
  }

  const tables = result.document.json_content
    ? extractTablesFromDocument(result.document.json_content)
    : [];
  const images = result.document.json_content
    ? extractImagesFromDocument(result.document.json_content)
    : [];

  const tablesWithSuggestions = tables.map((table) => ({
    ...table,
    suggestedMapping: suggestColumnMapping(table.headers),
  }));

  return res.status(200).json({
    success: true,
    markdown: result.document.md_content,
    tables: tablesWithSuggestions,
    images,
    processingTime: result.processing_time,
    status: result.status,
  });
}

import { readFile } from 'node:fs/promises';
import { requestOwner, failure, noStore } from '../../../../../../../modules/ocr/http.mjs';
import { getTask, safeFile, OcrError } from '../../../../../../../modules/ocr/store.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request, { params }) {
  try {
    const owner = await requestOwner(request), { id, fileId } = await params, task = await getTask(id, owner);
    const entry = fileId === 'source' ? task.source : task.artifacts.find(a => a.id === fileId);
    if (!entry) throw new OcrError('文件不存在。', 404);
    const file = await safeFile(id, entry.file);
    const type = ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', md: 'text/plain; charset=utf-8', json: 'application/json; charset=utf-8' })[entry.type] || 'application/octet-stream';
    return new Response(await readFile(file), { headers: { ...noStore, 'Content-Type': type,
      'Content-Disposition': `attachment; filename="ocr-result"; filename*=UTF-8''${encodeURIComponent(entry.name)}`,
      'Content-Security-Policy': "default-src 'none'; sandbox" } });
  } catch (error) { return failure(error); }
}

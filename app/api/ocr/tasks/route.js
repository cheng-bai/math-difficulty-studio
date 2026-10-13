import { requestOwner, json, failure, publicTask } from '../../../../modules/ocr/http.mjs';
import { createTask, listTasks, OcrError } from '../../../../modules/ocr/store.mjs';
import { publicBackend, MAX_UPLOAD } from '../../../../modules/ocr/config.mjs';
import { workerStatus } from '../../../../modules/ocr/worker.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  try {
    const owner = await requestOwner(request);
    const [tasks, backend, worker] = await Promise.all([listTasks(owner), publicBackend(), workerStatus()]);
    return json({ tasks: tasks.slice(0, 100).map(t => { const { preview, ...summary } = publicTask(t); return summary; }), backend, worker });
  } catch (error) { return failure(error); }
}
export async function POST(request) {
  try {
    const owner = await requestOwner(request, true);
    const length = Number(request.headers.get('content-length'));
    if (!length || !Number.isFinite(length) || length > MAX_UPLOAD + 65536) throw new OcrError('请求需包含长度，且文件不能超过 50 MB。', 413);
    const backend = await publicBackend();
    if (!backend.ready) throw new OcrError(backend.message, 503);
    // Limit the actual stream too; a forged Content-Length cannot bypass the cap.
    const reader = request.body?.getReader();
    if (!reader) throw new OcrError('缺少原始文件。');
    const chunks = []; let total = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > MAX_UPLOAD + 65536) { await reader.cancel(); throw new OcrError('上传文件超过 50 MB。', 413); }
      chunks.push(value);
    }
    let form;
    try { form = await new Response(Buffer.concat(chunks), { headers: { 'Content-Type': request.headers.get('content-type') || '' } }).formData(); }
    catch { throw new OcrError('无法读取上传文件。'); }
    const entries = [...form.entries()];
    if (entries.length !== 2 || form.getAll('file').length !== 1 || form.getAll('remoteConsent').length !== 1) throw new OcrError('每个 OCR 任务只能包含一份原件。');
    if (backend.remote && form.get('remoteConsent') !== 'yes') throw new OcrError('请确认将这份文件发送至 MinerU 服务进行识别。');
    const file = form.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') throw new OcrError('请选择原始文件。');
    const task = await createTask({ name: file.name, bytes: Buffer.from(await file.arrayBuffer()), owner, backend: backend.backend });
    return json({ task: publicTask(task) }, 201);
  } catch (error) { return failure(error); }
}

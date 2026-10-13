import { mkdir, readFile, writeFile, rename, readdir, lstat, realpath, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { dataRoot, MAX_UPLOAD } from './config.mjs';
import { fileLock } from './file-lock.mjs';

export class OcrError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function taskPath(id) { if (!ID.test(id)) throw new OcrError('任务不存在。', 404); return path.join(dataRoot(), 'tasks', id); }
export async function atomicJSON(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  await rename(temporary, file);
}
async function unlockedTask(id) {
  try { return JSON.parse(await readFile(path.join(taskPath(id), 'task.json'), 'utf8')); }
  catch (error) { if (error instanceof OcrError) throw error; throw new OcrError('任务不存在。', 404); }
}
export async function getTask(id, owner) {
  const task = await unlockedTask(id);
  if (owner && task.owner !== owner) throw new OcrError('任务不存在。', 404);
  return task;
}
export async function mutateTask(id, update) {
  const root = taskPath(id);
  let release;
  for (let attempt = 0; attempt < 10; attempt++) {
    try { release = await fileLock(path.join(root, '.state-lock')); break; }
    catch (error) {
      if (error.code !== 'ELOCKED' || attempt === 9) throw new OcrError('任务正在更新或本地文件锁不可用，请稍后重试。', 409);
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  }
  try {
    const task = await unlockedTask(id);
    const next = await update(task);
    if (!next) return task;
    next.updatedAt = new Date().toISOString();
    await atomicJSON(path.join(root, 'task.json'), next);
    return next;
  } finally { await release(); }
}
function fileExtension(name, bytes) {
  const ext = path.extname(name).toLowerCase();
  const valid = ext === '.pdf' ? bytes.subarray(0, 5).toString() === '%PDF-' :
    ext === '.png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) :
    ['.jpg', '.jpeg'].includes(ext) ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 :
    ext === '.webp' ? bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP' : false;
  if (!valid) throw new OcrError('请提交真实的 PDF、PNG、JPEG 或 WebP 文件；扩展名与内容必须一致。');
  return ext;
}
export async function createTask({ name, bytes, owner, backend }) {
  if (!bytes.length || bytes.length > MAX_UPLOAD) throw new OcrError('文件不能为空，且不能超过 50 MB。', 413);
  const ext = fileExtension(name, bytes), id = randomUUID();
  const tasks = path.join(dataRoot(), 'tasks');
  await mkdir(tasks, { recursive: true, mode: 0o700 });
  const temporary = path.join(tasks, `.${id}.tmp`);
  await mkdir(temporary, { mode: 0o700 });
  const now = new Date().toISOString();
  const task = { schema: 'studio-ocr-task-v1', id, owner, status: 'queued', stage: '等待本地 OCR 进程', createdAt: now, updatedAt: now,
    backend, attempt: 0, history: [], artifacts: [], error: null,
    source: { name: path.basename(name.replaceAll('\\', '/')).slice(0, 180), file: `source${ext}`, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') },
    reviewStatus: 'ocr_draft_unreviewed' };
  try {
    await writeFile(path.join(temporary, task.source.file), bytes, { mode: 0o600 });
    await atomicJSON(path.join(temporary, 'task.json'), task);
    await rename(temporary, taskPath(id));
    return task;
  } catch (error) { await rm(temporary, { recursive: true, force: true }); throw error; }
}
export async function listTasks(owner) {
  const names = await readdir(path.join(dataRoot(), 'tasks')).catch(() => []), tasks = [];
  for (const id of names.filter(name => ID.test(name))) {
    try { const task = await getTask(id, owner); tasks.push(task); } catch { /* Ignore other owners/incomplete tasks. */ }
  }
  return tasks.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
}
export async function retryTask(id, owner) {
  return mutateTask(id, task => {
    if (task.owner !== owner) throw new OcrError('任务不存在。', 404);
    if (!['failed', 'interrupted'].includes(task.status)) throw new OcrError('仅失败或中断的任务可以重试。', 409);
    return { ...task, status: 'queued', stage: '等待重试', error: null, artifacts: [],
      history: [...task.history, { attempt: task.attempt, status: task.status, error: task.error, at: task.updatedAt }] };
  });
}
export async function safeFile(id, relative) {
  const root = taskPath(id);
  const parts = relative.split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || /[\\\0]/.test(p))) throw new OcrError('文件不存在。', 404);
  let current = root;
  for (const part of parts) { current = path.join(current, part); if ((await lstat(current)).isSymbolicLink()) throw new OcrError('文件不存在。', 404); }
  const resolvedRoot = await realpath(/* turbopackIgnore: true */ root), resolved = await realpath(/* turbopackIgnore: true */ current);
  if (!resolved.startsWith(resolvedRoot + path.sep) || !(await lstat(resolved)).isFile()) throw new OcrError('文件不存在。', 404);
  return resolved;
}
export function publicTask(task) {
  const { owner, ...result } = task;
  return { ...result, source: { name: task.source.name, bytes: task.source.bytes, sha256: task.source.sha256 },
    artifacts: task.artifacts.map(({ file, ...entry }) => entry) };
}

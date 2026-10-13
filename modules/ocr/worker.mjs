import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { localRuntime } from '../../lib/local-runtime.mjs';
import { dataRoot } from './config.mjs';
import { listTasks, mutateTask, atomicJSON } from './store.mjs';
import { runMineru } from './mineru.mjs';
import { fileLock } from './file-lock.mjs';

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}
export async function acquireWorker() {
  const root = dataRoot();
  await mkdir(root, { recursive: true, mode: 0o700 });
  try { return await fileLock(path.join(root, 'worker-process.lock')); }
  catch { throw new Error('已有 OCR 进程运行，或 Python 3 文件锁不可用。'); }
}
export async function workerStatus() {
  try {
    const record = JSON.parse(await readFile(path.join(dataRoot(), 'worker.json'), 'utf8'));
    return { online: record.status === 'running' && alive(record.pid) && Date.now() - Date.parse(record.heartbeat) < 20000 };
  } catch { return { online: false }; }
}
export async function runWorker({ signal = new AbortController().signal, provider = runMineru, pollMs = 1000 } = {}) {
  if (!localRuntime()) throw new Error('OCR worker 仅能在显式本地模式启动。');
  const release = await acquireWorker();
  const heartbeatFile = path.join(dataRoot(), 'worker.json');
  const heartbeat = () => atomicJSON(heartbeatFile, { pid: process.pid, status: 'running', heartbeat: new Date().toISOString() });
  let ticker;
  try {
    await heartbeat();
    ticker = setInterval(() => heartbeat().catch(() => {}), 5000);
    for (const task of await listTasks()) {
      if (task.status === 'running') {
        await mutateTask(task.id, t => ({ ...t, status: 'interrupted', stage: '上次运行中断，可手动重试', error: '上次 OCR 进程中断；远端可能已经接收文件，重试会重新提交。' }));
      }
    }
    while (!signal.aborted) {
      const tasks = (await listTasks()).filter(t => t.status === 'queued').reverse();
      for (const queued of tasks) {
        if (signal.aborted) break;
        let task;
        try {
          task = await mutateTask(queued.id, t => t.status !== 'queued' ? null : ({ ...t, status: 'running', stage: 'MinerU 正在识别公式、版面与题图', attempt: t.attempt + 1, startedAt: new Date().toISOString(), error: null }));
        } catch { continue; }
        if (task.status !== 'running') continue;
        try {
          const result = await provider(task, { signal });
          if (signal.aborted) throw new Error('本地 OCR 进程已停止；远端可能已接收文件，重试会重新提交。');
          await mutateTask(task.id, t => ({ ...t, ...result, status: 'succeeded', stage: 'OCR 草稿已生成，等待按原图校对', completedAt: new Date().toISOString() }));
        } catch (error) {
          await mutateTask(task.id, t => ({ ...t, status: signal.aborted ? 'interrupted' : 'failed', stage: signal.aborted ? '识别中断，可手动重试' : '识别失败，可重试', error: error.message }));
        }
      }
      if (!signal.aborted) await new Promise(resolve => {
        const wake = () => { clearTimeout(timer); signal.removeEventListener('abort', wake); resolve(); };
        const timer = setTimeout(wake, pollMs); signal.addEventListener('abort', wake, { once: true });
      });
    }
  } finally {
    clearInterval(ticker);
    try { await atomicJSON(heartbeatFile, { pid: process.pid, status: 'stopped', heartbeat: new Date().toISOString() }); }
    finally { await release(); }
  }
}

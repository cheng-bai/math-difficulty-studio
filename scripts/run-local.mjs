import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) throw new Error('本地启动器不能在云函数环境运行。');
const port = process.env.STUDIO_PORT || '3102';
if (!/^\d+$/.test(port) || +port < 1024 || +port > 65535) throw new Error('STUDIO_PORT 需在 1024—65535 之间。');
// Check before spawning the worker: a failed UI startup must not start queued OCR.
await new Promise((resolve, reject) => { const s = net.createServer(); s.once('error', reject); s.listen(+port, '127.0.0.1', () => s.close(resolve)); });
const env = { ...process.env, STUDIO_RUNTIME: 'local', STUDIO_BUILD_DIR: '.next-local' };
const children = [];
const web = spawn(process.execPath, ['node_modules/next/dist/bin/next', process.argv.includes('--production') ? 'start' : 'dev', '--hostname', '127.0.0.1', '--port', port], { cwd: root, env, stdio: 'inherit' });
children.push(web);
let stopping = false;
function stop() { if (stopping) return; stopping = true; for (const child of children) if (child.exitCode === null) child.kill('SIGTERM'); }
for (const signal of ['SIGINT','SIGTERM']) process.once(signal, stop);
web.once('exit', code => { process.exitCode = code || 0; stop(); });
let ready = false;
for (let i = 0; i < 120 && !stopping; i++) {
  try { const response = await fetch(`http://127.0.0.1:${port}/workbench`); await response.arrayBuffer(); if (response.ok) { ready = true; break; } } catch { /* Starting. */ }
  await new Promise(resolve => setTimeout(resolve, 500));
}
if (!ready) { stop(); process.exitCode = 1; }
else if (!stopping) {
  const worker = spawn(process.execPath, ['scripts/ocr-worker.mjs'], { cwd: root, env, stdio: 'inherit' });
  children.push(worker);
  worker.once('exit', code => { if (!stopping) { console.error('本地 OCR 进程已停止，请重启本地网站后重试中断任务。'); process.exitCode = code || 1; stop(); } });
  console.log(`本地试卷处理台：http://127.0.0.1:${port}/workbench`);
}

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readdir, lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { mineruConfig } from './config.mjs';
import { taskPath, safeFile } from './store.mjs';

export function mineruArguments(config, source, output) {
  return config.backend === 'open-api' ? ['extract', source, '--model', 'vlm', '--ocr', '--formula', '--table', '-f', 'md,json', '-o', output, '--timeout', '900'] :
    ['-p', source, '-o', output, '-m', 'ocr', '-l', 'ch', '-f', 'true'];
}
export async function runMineru(task, { signal } = {}) {
  const config = await mineruConfig();
  if (!config.command || !config.configured) throw new Error('MinerU 命令或精确解析凭据不可用，请检查本机配置。');
  if (config.backend !== task.backend) throw new Error('MinerU 后端配置已改变，请恢复提交时的后端后重试。');
  const root = taskPath(task.id), output = path.join(root, `attempt-${task.attempt}`);
  await mkdir(output, { recursive: true, mode: 0o700 });
  const source = await safeFile(task.id, task.source.file);
  await new Promise((resolve, reject) => {
    const child = spawn(config.command, mineruArguments(config, source, output), { shell: false, stdio: ['ignore', 'ignore', 'pipe'] });
    // Classify errors without storing or exposing raw URLs, tokens or CLI logs.
    let classification = '';
    child.stderr.on('data', chunk => {
      const text = chunk.toString();
      if (/401|403|unauthorized|token.*(?:invalid|expired)/i.test(text)) classification = 'MinerU 凭据被拒绝或已过期。';
      else if (/proxyconnect|dial tcp|network|timeout|connection/i.test(text)) classification = 'MinerU 网络连接失败或超时，请检查网络与代理后重试。';
    });
    let timedOut = false;
    const kill = () => child.kill('SIGTERM');
    const timer = setTimeout(() => { timedOut = true; kill(); }, 16 * 60 * 1000);
    const forceTimer = setTimeout(() => child.kill('SIGKILL'), 16 * 60 * 1000 + 5000);
    const abort = () => { kill(); setTimeout(() => child.kill('SIGKILL'), 5000).unref(); };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const cleanup = () => { clearTimeout(timer); clearTimeout(forceTimer); signal?.removeEventListener('abort', abort); };
    child.once('error', () => { cleanup(); reject(new Error('无法启动 MinerU，请检查命令权限。')); });
    child.once('close', code => { cleanup(); code === 0 && !signal?.aborted ? resolve() : reject(new Error(signal?.aborted ? '本地 OCR 进程已停止；远端可能已接收文件，重试会重新提交。' : timedOut ? 'MinerU 任务超时，请稍后重试。' : classification || 'MinerU 解析失败，请检查服务状态或文件后重试。')); });
  });
  const artifacts = [];
  async function walk(folder) {
    for (const name of (await readdir(folder)).sort()) {
      const file = path.join(folder, name), stat = await lstat(file);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) { await walk(file); continue; }
      if (!stat.isFile() || !/\.(md|json|png|jpe?g|webp|pdf|zip)$/i.test(name)) continue;
      artifacts.push({ id: String(artifacts.length), name: path.relative(output, file).split(path.sep).join('/'), file: path.relative(root, file).split(path.sep).join('/'), bytes: stat.size, type: path.extname(name).slice(1).toLowerCase() });
    }
  }
  await walk(output);
  const markdown = artifacts.find(a => a.type === 'md' && a.bytes > 0);
  if (!markdown) throw new Error('MinerU 未返回有效 Markdown，任务保留为失败，请检查文件后重试。');
  const preview = (await readFile(await safeFile(task.id, markdown.file), 'utf8')).slice(0, 60000);
  const archiveName = 'OCR识别包.zip', archive = path.join(output, archiveName);
  const files = artifacts.map(a => a.name);
  try {
    await promisify(execFile)(process.env.STUDIO_PYTHON || 'python3', ['-c', 'import json,sys,zipfile\nwith zipfile.ZipFile(sys.argv[1], "w", zipfile.ZIP_DEFLATED) as z:\n for name in json.loads(sys.argv[2]): z.write(name, name)', archive, JSON.stringify(files)], { cwd: output, timeout: 30000, signal });
  } catch { throw new Error('识别文件已保留，但打包失败，请检查 Python 3 后重试。'); }
  artifacts.push({ id: String(artifacts.length), name: archiveName, file: path.relative(root, archive).split(path.sep).join('/'), bytes: (await lstat(archive)).size, type: 'zip' });
  return { artifacts, preview };
}

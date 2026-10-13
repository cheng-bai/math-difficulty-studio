import { access, readdir, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const MAX_UPLOAD = 50 * 1024 * 1024;
export function dataRoot() { return path.resolve(/* turbopackIgnore: true */ process.env.STUDIO_DATA_DIR || path.join(process.cwd(), '.local', 'ocr')); }
export async function mineruConfig() {
  const backend = process.env.MINERU_BACKEND || 'open-api';
  if (!['open-api', 'local-cli'].includes(backend)) throw new Error('不支持的 MinerU 后端配置。');
  const name = backend === 'open-api' ? 'mineru-open-api' : 'mineru';
  const candidates = process.env.MINERU_CLI ? [process.env.MINERU_CLI] : [];
  // The uv Python wrapper chmods its binary on every invocation. Prefer its
  // already-executable bundled binary, without changing the installed tool.
  if (!candidates.length && backend === 'open-api') {
    const lib = path.join(os.homedir(), '.local/share/uv/tools/mineru-open-api/lib');
    const arch = { arm64: 'arm64', x64: 'amd64' }[process.arch];
    for (const entry of await readdir(lib).catch(() => [])) {
      candidates.push(path.join(lib, entry, 'site-packages/mineru_open_api/bin', `${name}-${process.platform}-${arch}${process.platform === 'win32' ? '.exe' : ''}`));
    }
  }
  if (!process.env.MINERU_CLI) for (const dir of (process.env.PATH || '').split(path.delimiter)) candidates.push(path.join(dir, name));
  let command = null;
  for (const candidate of candidates) {
    try { await access(candidate, constants.X_OK); command = path.resolve(candidate); break; } catch { /* Try next installed location. */ }
  }
  const config = backend === 'open-api' ? await readFile(path.join(os.homedir(), '.mineru/config.yaml'), 'utf8').catch(() => '') : '';
  const configured = backend === 'local-cli' || Boolean(process.env.MINERU_API_TOKEN || /^\s*token:\s*\S+/m.test(config));
  return { backend, command, configured, remote: backend === 'open-api' };
}
export async function publicBackend() {
  const { backend, command, configured, remote } = await mineruConfig();
  return { backend, remote, ready: Boolean(command && configured), maxBytes: MAX_UPLOAD,
    message: !command ? '未找到 MinerU 命令；可用 MINERU_CLI 指定已安装命令。' : !configured ? 'MinerU 精确解析凭据未配置。' : remote ? '复用本机 MinerU 精确解析配置；执行时文件发送至 MinerU 服务。' : '使用本机 MinerU CLI 解析。' };
}

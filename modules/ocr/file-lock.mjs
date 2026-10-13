import { spawn } from 'node:child_process';

// Kernel advisory locks are released even after SIGKILL or power loss. Keep the
// lock file in place: unlinking it would allow two processes to lock two inodes.
// Python's standard library supplies flock on the local macOS/Linux host.
const program = `import fcntl, os, sys
fd = os.open(sys.argv[1], os.O_RDWR | os.O_CREAT, 0o600)
try:
    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    print('busy', flush=True)
    sys.exit(2)
print('locked', flush=True)
sys.stdin.buffer.read()
os.close(fd)
`;
export async function fileLock(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(/* turbopackIgnore: true */ process.env.STUDIO_PYTHON || 'python3', ['-u', '-c', program, file], { shell: false, stdio: ['pipe', 'pipe', 'ignore'] });
    let acquired = false, text = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('本地文件锁启动超时。')); }, 5000);
    child.stdout.on('data', chunk => {
      text += chunk;
      if (!acquired && text.includes('locked\n')) {
        acquired = true; clearTimeout(timer);
        resolve(async () => {
          if (child.exitCode !== null) return;
          const exited = new Promise(done => child.once('exit', done));
          child.stdin.end(); await exited;
        });
      }
    });
    child.once('error', () => { clearTimeout(timer); reject(new Error('本地文件锁需要 Python 3（macOS/Linux），可用 STUDIO_PYTHON 指定路径。')); });
    child.once('exit', code => {
      clearTimeout(timer);
      if (!acquired) { const error = new Error(code === 2 ? '文件正在被另一进程更新。' : '无法取得本地文件锁，请检查 Python 3。'); error.code = code === 2 ? 'ELOCKED' : 'ELOCKCONFIG'; reject(error); }
    });
    child.stdin.on('error', () => {});
  });
}

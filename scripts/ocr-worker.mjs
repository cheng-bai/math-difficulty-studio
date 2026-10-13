import { runWorker } from '../modules/ocr/worker.mjs';
const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => controller.abort());
try { await runWorker({ signal: controller.signal }); }
catch (error) { console.error(error.message); process.exitCode = 1; }

'use client';
import { useEffect, useRef, useState } from 'react';

const labels = { queued: '等待识别', running: '正在识别', succeeded: '草稿待校对', failed: '识别失败', interrupted: '识别中断' };
export default function LocalOcr() {
  const [file, setFile] = useState(null), [consent, setConsent] = useState(false), [backend, setBackend] = useState(null);
  const [tasks, setTasks] = useState([]), [worker, setWorker] = useState(null), [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const selected = useRef(null);
  useEffect(() => {
    const controller = new AbortController(); let timer;
    async function refresh() {
      try {
        const response = await fetch('/api/ocr/tasks', { signal: controller.signal });
        const data = await response.json(); if (!response.ok) throw new Error(data.error);
        setTasks(data.tasks); setBackend(data.backend); setWorker(data.worker);
        if (!selected.current && data.tasks.length) selected.current = data.tasks[0].id;
        if (selected.current) {
          const id = selected.current;
          const result = await fetch(`/api/ocr/tasks/${id}`, { signal: controller.signal });
          const body = await result.json(); if (!result.ok) throw new Error(body.error);
          if (selected.current === id) setDetail(body.task);
        }
      } catch (e) { if (!controller.signal.aborted) setError(e.message || '无法读取本地任务。'); }
      finally { if (!controller.signal.aborted) timer = setTimeout(refresh, 2500); }
    }
    refresh(); return () => { controller.abort(); clearTimeout(timer); };
  }, []);
  async function select(id) {
    selected.current = id; setError('');
    try {
      const response = await fetch(`/api/ocr/tasks/${id}`), data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (selected.current === id) setDetail(data.task);
    } catch (e) { setError(e.message); }
  }
  async function submit(event) {
    event.preventDefault(); setError('');
    if (!file) { setError('请先选择 PDF 或试卷图片。'); return; }
    if (file.size > 50 * 1024 * 1024) { setError('文件不能超过 50 MB。'); return; }
    setBusy(true);
    try {
      const body = new FormData(); body.append('file', file); body.append('remoteConsent', consent ? 'yes' : 'no');
      const response = await fetch('/api/ocr/tasks', { method: 'POST', body });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      selected.current = data.task.id; setDetail(data.task); setTasks(old => [data.task, ...old]);
    } catch (e) { setError(e.message || '提交失败，请重试。'); }
    finally { setBusy(false); }
  }
  async function retry() {
    const id = detail.id;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/ocr/tasks/${id}`, { method: 'POST' }), data = await response.json();
      if (!response.ok) throw new Error(data.error); if (selected.current === id) setDetail(data.task);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  const link = id => `/api/ocr/tasks/${detail.id}/files/${id}`;
  return <section className="ocr-panel" aria-labelledby="local-ocr-title">
    <div className="section-title"><h2 id="local-ocr-title">原卷识别 · MinerU</h2><span>本机工作空间</span></div>
    <p className="ocr-intro">先把原卷转成可编辑的 Markdown，保留题图，再校对题目与公式。</p>
    <div className="ocr-layout"><div>
      <form onSubmit={submit} className="ocr-form">
        <label className="ocr-file">原卷 PDF / 图片<input aria-label="MinerU 原卷" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={e => { setFile(e.target.files?.[0] || null); setConsent(false); setError(''); }}/></label>
        <p className="bench-hint">每次一份，最大 50 MB。多页试卷请合成一个 PDF；本轮支持 OCR，不自动解题或评分。</p>
        <p className="ocr-boundary">{backend?.message || '正在检查本机 MinerU 配置…'}</p>
        {backend?.remote && <label className="ocr-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/>我同意将当前选择的这份文件发送至 MinerU 服务进行精确识别。</label>}
        <button className="bench-primary" type="submit" disabled={busy || !backend?.ready || !worker?.online || (backend.remote && !consent)}>{busy ? '正在提交…' : '开始 MinerU 识别'}</button>
        {worker && !worker.online && <p className="ocr-warning">本地 OCR 进程尚未就绪或已经停止。请使用 npm run local 启动，任务会保留。</p>}
        {error && <p className="bench-error" role="alert">{error}</p>}
      </form>
      <h3 className="ocr-history-title">本地任务</h3><p className="bench-hint">原件和任务记录存放在本机。刷新页面后仍可查看；无需重新部署网站。</p>
      <div className="ocr-tasks">{tasks.length ? tasks.map(task => <button key={task.id} className={detail?.id === task.id ? 'selected' : ''} onClick={() => select(task.id)}><strong>{task.source.name}</strong><span>{labels[task.status] || task.status} · 第 {task.attempt} 次识别</span></button>) : <p className="bench-hint">尚无 OCR 任务。</p>}</div>
    </div><div className="ocr-result" aria-live="polite">
      {detail ? <><div className="ocr-status"><span>{labels[detail.status]}</span><small>OCR 草稿 · 未经数学校对</small></div><h3>{detail.source.name}</h3><p>{detail.stage}</p>
        {detail.error && <p className="bench-error">{detail.error}</p>}
        {['failed','interrupted'].includes(detail.status) && <><p className="bench-hint">重试会保留原件及之前的识别记录。中断前 MinerU 可能已接收文件，重试将重新提交。</p><button className="bench-download" onClick={retry} disabled={busy || !worker?.online}>重试这份原卷</button></>}
        <a className="ocr-source-link" href={link('source')} download>下载已归档原件 ↗</a>
        {detail.artifacts.length > 0 && <><h4>识别文件与题图</h4><ul className="ocr-artifacts">{detail.artifacts.map(a => <li key={a.id}><a href={link(a.id)} download>{a.name}</a><small>{(a.bytes/1024).toFixed(1)} KB</small></li>)}</ul></>}
        {detail.preview && <><h4>Markdown 草稿预览</h4><p className="bench-hint">此处显示识别源稿，公式保留 LaTeX。预览最多 60,000 字符，完整稿可在上方下载。未决公式、题号和图形条件需按原件核对。</p><pre className="ocr-preview">{detail.preview}</pre></>}
      </> : <div className="ocr-empty"><p>选择一份原卷，开始识别。</p><p>结果包含 Markdown 和 MinerU 实际返回的图片、结构数据；识别完成后仍需校对。</p></div>}
    </div></div>
  </section>;
}

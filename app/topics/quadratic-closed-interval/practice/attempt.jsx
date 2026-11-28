'use client';

import { useState } from 'react';

export function Attempt({ itemId, endpoint }) {
  const [result, setResult] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const draftId = `${itemId}-draft`;
  const solutionId = `${itemId}-solution`;

  async function reveal() {
    setPending(true);
    setError('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST', cache: 'no-store',
        headers: { 'X-Studio-Attempt': 'confirmed' },
      });
      if (response.status === 401) {
        setError('登录已失效，请重新登录后再试。');
        return;
      }
      if (!response.ok) throw new Error('Reveal failed');
      setResult(await response.json());
    } catch {
      setError('暂时无法打开解析，请重试。');
    } finally {
      setPending(false);
    }
  }

  return <div className="topic-attempt">
    <label htmlFor={draftId}>我的草稿（选填）</label>
    <textarea id={draftId} rows={3} placeholder="可以写下所求最值、检查点和参数范围。" />
    {!result && <button type="button" className="topic-button" disabled={pending} onClick={reveal} aria-controls={solutionId}>
      {pending ? '正在打开解析…' : '我已尝试，查看本题解析'}
    </button>}
    {error && <p role="alert">{error}</p>}
    <div id={solutionId} aria-live="polite">
      {result && <section className="topic-solution">
        <h3>本题答案与解析</h3>
        <p dangerouslySetInnerHTML={{ __html: result.answer }} />
        <ol>{result.solution.map(step => <li key={step} dangerouslySetInnerHTML={{ __html: step }} />)}</ol>
      </section>}
    </div>
  </div>;
}

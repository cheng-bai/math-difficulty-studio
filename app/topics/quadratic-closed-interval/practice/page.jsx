import { redirect } from 'next/navigation';
import { currentUser } from '../../../../lib/session.mjs';
import { practicePath, practiceView, revealPath } from '../../../../lib/quadratic-topic.server.mjs';
import { Problem, StudyNotes, TopicIntro } from '../topic-view.jsx';
import { Attempt } from './attempt.jsx';

export const dynamic = 'force-dynamic';

export default async function Page() {
  if (!await currentUser()) redirect(`/login?next=${encodeURIComponent(practicePath)}`);
  const topic = practiceView();
  return <main id="content" className="workspace topic-workspace">
    <header className="topbar"><a href="/" className="brand">← 数学难度研究室</a><span>学生练习</span></header>
    <TopicIntro topic={topic} audience="学生练习">
      <p>先独立尝试，再看每题解析。对照两题：函数和区间不变，哪一个函数值最容易越界？</p>
      <p className="topic-meta">草稿只留在当前页面，不提交、不评分。</p>
    </TopicIntro>
    <details className="topic-card topic-reference">
      <summary>复习知识与方法</summary>
      <StudyNotes knowledge={topic.knowledge} method={topic.method} />
    </details>
    {topic.items.map((item, index) => <article key={item.id} id={item.id} className="topic-section topic-card">
      <h2>{item.title}</h2>
      <Problem item={item} />
      <Attempt endpoint={revealPath(item.id)} itemId={item.id} />
      <nav className="topic-links" aria-label={`${item.title}的对照题`}>
        <a href={`#${item.contrast_id}`}>{index === 0 ? '去做对照变式 →' : '← 返回例题对照'}</a>
      </nav>
    </article>)}
  </main>;
}

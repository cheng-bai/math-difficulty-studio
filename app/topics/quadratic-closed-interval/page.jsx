import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '../../../lib/session.mjs';
import { practicePath, teacherView, topicPath } from '../../../lib/quadratic-topic.server.mjs';
import { Problem, StudyNotes, TopicIntro, TopicText } from './topic-view.jsx';

export const dynamic = 'force-dynamic';

export default async function Page() {
  if (!await currentUser()) redirect(`/login?next=${encodeURIComponent(topicPath)}`);
  const topic = teacherView();
  const { curriculum } = topic;
  return <main id="content" className="workspace topic-workspace">
    <header className="topbar">
      <Link href="/" className="brand" prefetch={false}>← 数学难度研究室</Link>
      <Link href={practicePath} prefetch={false}>打开学生练习 ↗</Link>
    </header>
    <TopicIntro topic={topic} audience="教师讲评">
      <p className="topic-meta">{curriculum.edition}</p>
      <p>{curriculum.primary}<br />关联：{curriculum.related}<br />先备：{curriculum.prerequisites}</p>
      <p className="topic-meta">{curriculum.verification}</p>
    </TopicIntro>
    <nav className="topic-links" aria-label="专题目录">
      <a href="#knowledge">知识</a>
      <a href={`#${topic.method.id}`}>方法</a>
      {topic.items.map(item => <a href={`#${item.id}`} key={item.id}>{item.title.split('｜')[0]}</a>)}
    </nav>
    <StudyNotes knowledge={topic.knowledge} method={topic.method} />
    {topic.items.map((item, index) => <article key={item.id} id={item.id} className="topic-section topic-card">
      <h2>0{index + 3} {item.title}</h2>
      <Problem item={item} />
      <p className="topic-meta">{item.source_ids.map(id => `${topic.sources[id].title} · ${topic.sources[id].license}`).join(' / ')} · 第 {item.revision} 版</p>
      <TopicText>{item.purpose}</TopicText>
      <details open className="topic-solution">
        <summary>答案与解析</summary>
        <TopicText>{item.content.answer}</TopicText>
        <ol>{item.content.solution.map((step, stepIndex) => <li key={step}>
          <TopicText>{step}</TopicText>
          {item.analysis_input.steps.filter(note => note.solution_step === stepIndex + 1).map(note =>
            <TopicText className="topic-annotation" key={note.commentary}>{note.commentary}</TopicText>)}
        </li>)}</ol>
      </details>
      <aside className="topic-teaching">
        <h3>教师讲评</h3>
        <TopicText>{item.content.teaching}</TopicText>
        <p className="topic-meta">批注说明题目与解题步骤，不用于判断学生能力。</p>
      </aside>
      <nav className="topic-links" aria-label={`${item.title}的关联内容`}>
        {item.knowledge_ids.map(id => <a href={`#${id}`} key={id}>{topic.knowledge.find(node => node.id === id).title}</a>)}
        <a href={`#${item.method_id}`}>回看方法</a>
        <a href={`#${item.contrast_id}`}>{index === 0 ? '去看对照变式 →' : '← 返回例题对照'}</a>
      </nav>
    </article>)}
  </main>;
}

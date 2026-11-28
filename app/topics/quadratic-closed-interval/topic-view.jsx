import { renderTopicText } from '../../../lib/topic-content.mjs';

export function TopicText({ as: Tag = 'p', children, className }) {
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: renderTopicText(children) }} />;
}

export function TopicIntro({ topic, audience, children }) {
  return <section className="topic-intro">
    <p className="eyebrow">专题 01 / {audience}</p>
    <h1>{topic.title}</h1>
    <p className="lead">{topic.goal}</p>
    {children}
  </section>;
}

export function StudyNotes({ knowledge, method }) {
  return <>
    <section id="knowledge" className="topic-section">
      <h2>01 知识 · 先读懂条件</h2>
      <div className="topic-knowledge">
        {knowledge.map(node => <article id={node.id} className="topic-card" key={node.id}>
          <h3>{node.title}</h3>
          <TopicText>{node.body}</TopicText>
        </article>)}
      </div>
    </section>
    <section id={method.id} className="topic-section topic-card topic-method">
      <h2>02 方法 · {method.title}</h2>
      <TopicText>{method.signal}</TopicText>
      <ol>{method.steps.map(step => <TopicText as="li" key={step}>{step}</TopicText>)}</ol>
      <TopicText className="topic-warning">{method.disable}</TopicText>
    </section>
  </>;
}

export function Problem({ item }) {
  return <div className="topic-problem">
    <TopicText>{item.content.premises}</TopicText>
    <TopicText>{item.content.question}</TopicText>
  </div>;
}

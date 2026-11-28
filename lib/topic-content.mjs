import katex from 'katex';

export function studentTopic(topic) {
  return {
    title: topic.title,
    goal: topic.goal,
    knowledge: topic.knowledge.map(({ id, title, body }) => ({ id, title, body })),
    method: {
      id: topic.method.id,
      title: topic.method.title,
      signal: topic.method.signal,
      steps: [...topic.method.steps],
      disable: topic.method.disable,
    },
    items: topic.items.map(({ id, title, contrast_id, content }) => ({
      id, title, contrast_id,
      content: { premises: content.premises, question: content.question },
    })),
  };
}

export function renderTopicText(text) {
  const parts = text.split('$');
  if (parts.length % 2 === 0) throw new Error('未配对的数学分隔符');
  return parts.map((part, index) => {
    if (index % 2 === 0) return part.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    if (!part.trim() || part.includes('\n') || /\\(?:href|url|html|includegraphics)/.test(part)) {
      throw new Error('专题只接受不含链接或 HTML 指令的行内公式');
    }
    return katex.renderToString(part, { throwOnError: true, trust: false, strict: false, maxExpand: 1000 });
  }).join('');
}

export function studentSolution(topic, itemId) {
  const item = topic.items.find(({ id }) => id === itemId);
  if (!item) return null;
  return {
    id: item.id,
    answer: renderTopicText(item.content.answer),
    solution: item.content.solution.map(renderTopicText),
  };
}

import { renderTopicText } from './topic-content.mjs';

export function validateTopic(topic) {
  function requireField(condition, path) {
    if (!condition) throw new Error(`无效的专题字段：${path}`);
  }

  function checkText(text, path) {
    requireField(typeof text === 'string' && text.trim(), path);
    try { renderTopicText(text); }
    catch (cause) { throw new Error(`专题公式无法渲染：${path}`, { cause }); }
  }

  function checkTexts(object, fields, path) {
    for (const name of fields) checkText(object?.[name], `${path}.${name}`);
  }

  function checkList(list, path) {
    requireField(Array.isArray(list) && list.length > 0, path);
  }

  const anchors = new Set(['knowledge']);
  function addAnchor(id, path) {
    requireField(typeof id === 'string' && /^[a-z][a-z0-9-]*$/.test(id) && !anchors.has(id), path);
    anchors.add(id);
  }

  requireField(topic.schema_version === 'studio-topic-v1', 'schema_version');
  requireField(typeof topic.id === 'string' && /^[a-z][a-z0-9-]*$/.test(topic.id), 'id');
  checkTexts(topic, ['title', 'goal'], 'topic');
  checkTexts(topic.curriculum, ['edition', 'primary', 'related', 'prerequisites', 'verification'], 'curriculum');
  checkList(topic.knowledge, 'knowledge');
  for (const node of topic.knowledge) {
    addAnchor(node.id, 'knowledge.id');
    checkTexts(node, ['title', 'body'], node.id);
  }
  addAnchor(topic.method?.id, 'method.id');
  checkTexts(topic.method, ['title', 'signal', 'disable'], 'method');
  checkList(topic.method.steps, 'method.steps');
  for (const step of topic.method.steps) checkText(step, 'method.steps');

  checkList(topic.items, 'items');
  for (const item of topic.items) {
    addAnchor(item.id, 'items.id');
    requireField(Number.isInteger(item.revision) && item.revision > 0, `${item.id}.revision`);
    checkList(item.source_ids, `${item.id}.source_ids`);
    for (const id of item.source_ids) {
      requireField(Object.hasOwn(topic.sources ?? {}, id), `${item.id}.source_ids`);
      checkTexts(topic.sources[id], ['title', 'license'], `sources.${id}`);
    }
    checkList(item.knowledge_ids, `${item.id}.knowledge_ids`);
    requireField(item.knowledge_ids.every(id => topic.knowledge.some(node => node.id === id)), `${item.id}.knowledge_ids`);
    requireField(item.method_id === topic.method.id, `${item.id}.method_id`);
    requireField(topic.items.some(other => other !== item && other.id === item.contrast_id && other.contrast_id === item.id), `${item.id}.contrast_id`);
    checkTexts(item, ['title', 'purpose'], item.id);
    checkTexts(item.content, ['premises', 'question', 'answer', 'teaching'], `${item.id}.content`);
    checkList(item.content.solution, `${item.id}.solution`);
    for (const step of item.content.solution) checkText(step, `${item.id}.solution`);
    checkList(item.analysis_input?.steps, `${item.id}.analysis_input.steps`);
    for (const note of item.analysis_input.steps) {
      requireField(Number.isInteger(note.solution_step) && note.solution_step >= 1 && note.solution_step <= item.content.solution.length, `${item.id}.solution_step`);
      checkText(note.commentary, `${item.id}.commentary`);
    }
  }
}

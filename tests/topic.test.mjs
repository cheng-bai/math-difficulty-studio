import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { safeReturnPath } from '../lib/auth-config.mjs';
import { renderTopicText, studentSolution, studentTopic } from '../lib/topic-content.mjs';
import { validateTopic } from '../lib/topic-validation.mjs';

const topic = JSON.parse(readFileSync(new URL('../content/topics/quadratic-closed-interval/topic.json', import.meta.url)));
const [upper, lower] = topic.items;

test('topic pack validates all renderable text, revision evidence, and loop links', () => {
  validateTopic(topic);
  assert.equal(upper.content.premises, lower.content.premises);
  for (const [field, target, badValue] of [
    ['contrast_id', item => item, 'missing'],
    ['source_ids', item => item, ['unknown']],
    ['solution_step', item => item.analysis_input.steps[0], 100],
    ['answer', item => item.content, '$\\notATeXCommand$'],
  ]) {
    const invalid = structuredClone(topic);
    target(invalid.items[0])[field] = badValue;
    assert.throws(() => validateTopic(invalid), new RegExp(field));
  }
  assert.throws(() => renderTopicText('broken $x'), /分隔符/);
  assert.equal(renderTopicText('<script>'), '&lt;script&gt;');
});

test('teacher evidence is present but student initial data uses an allowlist', () => {
  const expanded = structuredClone(topic);
  expanded.knowledge[0].unreviewed = 'private-canary';
  expanded.method.internal = 'private-canary';
  expanded.items[0].content.extraSolution = 'private-canary';
  const practice = studentTopic(expanded);
  assert.deepEqual(practice.items[0].content, { premises: upper.content.premises, question: upper.content.question });
  const raw = JSON.stringify(practice);
  assert.doesNotMatch(raw, /"(?:answer|solution|teaching|commentary|analysis_input)"|private-canary|1\/4|36\/25/);
  for (const item of topic.items) {
    assert.ok(item.content.answer && item.content.teaching && item.analysis_input.steps[0].commentary);
    for (const text of [item.content.answer, ...item.content.solution, item.content.teaching, ...item.analysis_input.steps.map(note => note.commentary)]) {
      assert.ok(!raw.includes(JSON.stringify(text).slice(1, -1)));
    }
  }
});

test('reveal returns exactly one requested answer and its student-safe steps', () => {
  for (const item of topic.items) {
    const result = studentSolution(topic, item.id);
    assert.deepEqual(result, { id: item.id, answer: renderTopicText(item.content.answer), solution: item.content.solution.map(renderTopicText) });
    assert.match(result.answer, /class="katex"/);
    assert.doesNotMatch(JSON.stringify(result), /teaching|commentary|【教学追问】|【关键题素】/);
  }
  assert.equal(studentSolution(topic, 'missing'), null);
});

test('original pair matches the endpoint and vertex calculations, including equalities', () => {
  assert.equal(upper.content.answer, '$t\\ge \\frac{1}{4}$。');
  assert.equal(lower.content.answer, '$t\\le 1$。');
  const value = (x, parameter) => x ** 2 - 2 * parameter * x;
  for (const parameter of [-2, 0, 0.24, 0.25, 0.26, 1, 1.1, 1.2, 1.25, 2, 3]) {
    const candidates = [value(0, parameter), value(2, parameter)];
    if (parameter > 0 && parameter < 2) candidates.push(value(parameter, parameter));
    assert.equal(Math.max(...candidates) <= 3, parameter >= 0.25);
    assert.equal(Math.min(...candidates) >= -1, parameter <= 1);
  }
  assert.ok(value(0, 6/5) >= -1 && value(2, 6/5) >= -1);
  assert.equal(value(6/5, 6/5), -36/25);
  assert.ok(-36/25 < -1);
});

test('topic pages are valid login returns, not the reveal API', () => {
  const path = `/topics/${topic.id}`;
  assert.equal(safeReturnPath(path), path);
  assert.equal(safeReturnPath(`${path}/practice#lower-bound`), `${path}/practice#lower-bound`);
  assert.equal(safeReturnPath(`/api${path}/upper-bound/reveal`), '/');
  assert.equal(safeReturnPath(`//other.invalid${path}`), '/');
});

import 'server-only';
import topic from '../content/topics/quadratic-closed-interval/topic.json';
import { studentSolution, studentTopic } from './topic-content.mjs';

export const topicPath = `/topics/${topic.id}`;
export const practicePath = `${topicPath}/practice`;
export const revealPath = itemId => `/api/topics/${topic.id}/${itemId}/reveal`;

export function teacherView() {
  return topic;
}

export function practiceView() {
  return studentTopic(topic);
}

export function revealItem(itemId) {
  return studentSolution(topic, itemId);
}

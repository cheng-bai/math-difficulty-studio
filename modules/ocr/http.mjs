import { localRequest } from '../../lib/local-runtime.mjs';
import { currentUser } from '../../lib/session.mjs';
import { publicTask, OcrError } from './store.mjs';

export const noStore = { 'Cache-Control': 'private, no-store, max-age=0', 'Vercel-CDN-Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
export async function requestOwner(request, write = false) {
  if (!localRequest(request, write)) throw new OcrError('此接口仅在本机同源运行模式开放。', 403);
  const user = await currentUser();
  if (!user) throw new OcrError('请先登录。', 401);
  return user.id ? `id:${user.id}` : `legacy:${user.username}`;
}
export function json(value, status = 200) { return Response.json(value, { status, headers: noStore }); }
export function failure(error) { return json({ error: error instanceof OcrError ? error.message : '操作失败，请稍后重试。' }, error instanceof OcrError ? error.status : 500); }
export { publicTask };

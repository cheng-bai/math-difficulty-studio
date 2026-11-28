import { currentUser } from '../../../../../../lib/session.mjs';
import { sameOrigin } from '../../../../../../lib/security.mjs';
import { revealItem } from '../../../../../../lib/quadratic-topic.server.mjs';

const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Vercel-CDN-Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};

export async function POST(request, { params }) {
  if (!await currentUser()) return Response.json({ error: '请先登录。' }, { status: 401, headers });
  if (!sameOrigin(request)) return Response.json({ error: '请在练习页查看解析。' }, { status: 403, headers });
  if (request.headers.get('x-studio-attempt') !== 'confirmed') {
    return Response.json({ error: '请先尝试本题，再确认查看解析。' }, { status: 400, headers });
  }
  const { item } = await params;
  const result = revealItem(item);
  return result
    ? Response.json(result, { headers })
    : Response.json({ error: '没有这道练习题。' }, { status: 404, headers });
}

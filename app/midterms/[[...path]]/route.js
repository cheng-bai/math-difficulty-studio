import { currentUser } from '../../../lib/session.mjs';
import { serveMidterms } from '../../../lib/midterms.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, {params}) {
  return serveMidterms(request, (await params).path || [], {user:await currentUser()});
}

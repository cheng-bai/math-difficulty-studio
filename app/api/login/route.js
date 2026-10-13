import { NextResponse } from 'next/server';
import { checkPassword, issueSession, sameOrigin, COOKIE_NAME, SESSION_SECONDS } from '../../../lib/security.mjs';
import { authReady } from '../../../lib/auth.mjs';
import { authProvider, safeReturnPath } from '../../../lib/auth-config.mjs';
import { routeSupabase } from '../../../lib/supabase/route.mjs';
import { verifiedStudioUser } from '../../../lib/supabase/auth.mjs';
export const runtime = 'nodejs';
// Best-effort instance-local throttling; the long random invited passwords are the primary defense.
const attempts = new Map();
export async function POST(request) {
  if(!sameOrigin(request)) return NextResponse.json({error:'Forbidden'}, {status:403});
  if(!authReady()) return NextResponse.json({error:'Unavailable'}, {status:503});
  if(Number(request.headers.get('content-length') || 0)>4096) return NextResponse.json({error:'Invalid input'}, {status:413});
  let body;
  try { const text=await request.text(); if(text.length>4096) throw new Error(); body=JSON.parse(text); } catch { return NextResponse.json({error:'Invalid input'}, {status:400}); }
  const supabase = authProvider() === 'supabase';
  const identifier = supabase ? body?.email : body?.username;
  if(!body || typeof identifier!=='string' || typeof body.password!=='string' || !identifier.trim() || identifier.length>(supabase?254:80) || !body.password || body.password.length>256) return NextResponse.json({error:'Invalid input'}, {status:400});
  const id=identifier.trim().toLowerCase(); const now=Date.now();
  for(const [k,v] of attempts) if(v.until<now) attempts.delete(k);
  if(attempts.size>2000) return NextResponse.json({error:'Try later'}, {status:429});
  const attempt=attempts.get(id)||{count:0,until:now+60000};
  if(attempt.count>=8) return NextResponse.json({error:'Try later'}, {status:429,headers:{'Retry-After':'60'}});
  attempt.count++; attempts.set(id,attempt);
  if (supabase) {
    const auth = routeSupabase(request);
    try {
      const { error } = await auth.client.auth.signInWithPassword({ email: id, password: body.password });
      if (error) {
        const status = error.status === 429 ? 429 : !error.status || error.status >= 500 ? 503 : 401;
        return auth.apply(NextResponse.json({error: status === 429 ? 'Try later' : status === 503 ? 'Unavailable' : 'Invalid credentials'}, {status}));
      }
      if (!await verifiedStudioUser(auth.client)) {
        try { await auth.client.auth.signOut({ scope: 'local' }); } catch { /* Clear local tokens below even during an outage. */ }
        return auth.clearSession(auth.apply(NextResponse.json({error:'Invalid credentials'}, {status:401})));
      }
      attempts.delete(id);
      const response = auth.apply(NextResponse.json({ok:true, next:safeReturnPath(body.next)}));
      response.cookies.set(COOKIE_NAME,'',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:0});
      return response;
    } catch {
      return auth.clearSession(auth.apply(NextResponse.json({error:'Unavailable'}, {status:503})));
    }
  }
  const user=await checkPassword(body.username,body.password);
  if(!user) return NextResponse.json({error:'Invalid credentials'}, {status:401});
  attempts.delete(id);
  const response=NextResponse.json({ok:true, next:safeReturnPath(body.next)}, {headers:{'Cache-Control':'private, no-store'}});
  response.cookies.set(COOKIE_NAME,await issueSession(user),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:SESSION_SECONDS});
  return response;
}

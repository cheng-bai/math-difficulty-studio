import { NextResponse } from 'next/server';
import { sameOrigin, COOKIE_NAME } from '../../../lib/security.mjs';
import { authProvider, supabaseConfig } from '../../../lib/auth-config.mjs';
import { routeSupabase } from '../../../lib/supabase/route.mjs';
export async function POST(request) {
  if(!sameOrigin(request)) return new Response('Forbidden',{status:403});
  const response=new NextResponse(null,{status:303,headers:{Location:'/login','Cache-Control':'private, no-store'}});
  if (authProvider() === 'supabase' && supabaseConfig()) {
    const auth = routeSupabase(request);
    try {
      const { error } = await auth.client.auth.signOut({ scope: 'local' });
      if (error) return auth.apply(NextResponse.json({error:'退出失败，请重试。'}, {status:503}));
    } catch { return auth.apply(NextResponse.json({error:'退出失败，请重试。'}, {status:503})); }
    auth.clearSession(auth.apply(response));
  }
  response.cookies.set(COOKIE_NAME,'',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:0});
  return response;
}

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { currentUser } from '../../../lib/session.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const root=path.join(process.cwd(),'private','library');
const types={'.csv':'text/csv; charset=utf-8','.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.svg':'image/svg+xml','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf'};
export async function GET(request,{params}) {
  if(!await currentUser())return new Response(null,{status:303,headers:{Location:'/login','Cache-Control':'private, no-store'}});
  const parts=(await params).path||[];
  if(!parts.length)return new Response(null,{status:303,headers:{Location:'/library/index.html#library','Cache-Control':'private, no-store'}});
  if(parts.some(p=>p==='.'||p==='..'||p.includes('\\')||p.includes('/')||p.includes('\0')))return new Response('Not found',{status:404});
  const file=parts.join('/');
  const manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
  if(!manifest.some(entry=>entry.path===file))return new Response('Not found',{status:404});
  let data=await readFile(path.join(root,file));
  const extension=path.extname(file).toLowerCase();
  if(extension==='.html') {
    const nav='<nav aria-label="网站导航" style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 20px;background:#203a35;color:#f5f3ec;font:13px sans-serif"><a href="/" style="color:inherit;text-decoration:none">← 返回研究室</a><span>自定义试卷库</span><form method="post" action="/api/logout"><button style="background:transparent;color:inherit;border:1px solid #879e97;padding:4px 10px;cursor:pointer">退出登录</button></form></nav>';
    data=data.toString('utf8').replace(/<body([^>]*)>/i,`<body$1>${nav}`);
  }
  return new Response(data,{headers:{
    'Content-Type':types[extension]||'application/octet-stream',
    'Cache-Control':'private, no-store, max-age=0','Vercel-CDN-Cache-Control':'no-store',
    'Content-Security-Policy':"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'self'",
    'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Robots-Tag':'noindex, nofollow, noarchive'
  }});
}

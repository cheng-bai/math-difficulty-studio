import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { safeReturnPath } from './auth-config.mjs';

const defaultRoot = path.join(process.cwd(), 'private', 'midterms');
const digest = /^[a-f0-9]{64}$/;
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.csv':'text/csv; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.svg':'image/svg+xml','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf'};
const headers = {
  'Cache-Control':'private, no-store, max-age=0',
  'Vercel-CDN-Cache-Control':'no-store',
  'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'self'",
  'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'same-origin',
  'X-Robots-Tag':'noindex, nofollow, noarchive',
};

export async function serveMidterms(request, parts = [], {user, root=defaultRoot} = {}) {
  if (!user) {
    const url = new URL(request.url);
    return new Response(null, {status:303,headers:{...headers,Location:'/login?next='+encodeURIComponent(safeReturnPath(url.pathname+url.search))}});
  }
  if (!Array.isArray(parts) || parts.some(p=>typeof p!=='string'||!p||p==='.'||p==='..'||/[\\/\u0000-\u001f]/.test(p))) {
    return new Response('Not found',{status:404,headers});
  }
  try {
    let releaseId, file;
    if (parts[0] === 'releases') {
      if (!digest.test(parts[1] || '')) return new Response('Not found',{status:404,headers});
      releaseId=parts[1]; file=parts.slice(2).join('/')||'index.html';
    } else {
      const current=JSON.parse(await readFile(path.join(root,'current.json'),'utf8'));
      if (!digest.test(current.releaseId||'')) throw new Error('Invalid release');
      releaseId=current.releaseId; file=parts.join('/')||'index.html';
    }
    const releaseRoot=path.join(root,'releases',releaseId);
    const manifest=JSON.parse(await readFile(path.join(releaseRoot,'manifest.json'),'utf8'));
    if (manifest.releaseId!==releaseId || !Array.isArray(manifest.artifacts)) throw new Error('Invalid manifest');
    const entry=manifest.artifacts.find(a=>a.path===file);
    const type=types[path.extname(file).toLowerCase()];
    if (!entry || !type || file==='manifest.json') return new Response('Not found',{status:404,headers});
    const bytes=await readFile(path.join(releaseRoot,file));
    if (bytes.length!==entry.bytes || createHash('sha256').update(bytes).digest('hex')!==entry.sha256) throw new Error('Artifact integrity mismatch');
    return new Response(bytes,{headers:{...headers,'Content-Type':type,'X-Midterms-Release':releaseId,
      ...(file.endsWith('.csv')?{'Content-Disposition':`attachment; filename="midterms-${path.basename(file).replace(/[^a-zA-Z0-9._-]/g,'_')}"`}:{})}});
  } catch (error) {
    if (error.code==='ENOENT') return new Response('期中材料尚未发布。',{status:404,headers});
    return new Response('期中材料暂时不可用。',{status:503,headers});
  }
}

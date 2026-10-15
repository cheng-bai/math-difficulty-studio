import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { serveMidterms } from '../lib/midterms.mjs';
import { safeReturnPath } from '../lib/auth-config.mjs';

/** The importer needs markdown-it-py; pick the first interpreter that provides it. */
function pythonWithMarkdownIt(){
  const candidates = (process.env.STUDIO_PYTHON ? [process.env.STUDIO_PYTHON] : [])
    .concat(['python3','/opt/homebrew/bin/python3','/usr/bin/python3']);
  for(const python of candidates){
    try{
      execFileSync(python,['-c','import markdown_it'],{stdio:'pipe'});
      return python;
    }catch{ /* try the next interpreter */ }
  }
  throw new Error('未找到带 markdown-it-py 的 Python；请安装后重试');
}

test('midterm publication statistics, pending values, duplicates, rendering and repeat import',()=>{
  execFileSync(pythonWithMarkdownIt(),['-m','unittest','discover','-s','tests','-p','test_midterms.py'],{cwd:process.cwd(),stdio:'pipe',timeout:120000});
});

test('midterms keep login return URLs and protect every resource before reading files',async()=>{
  assert.equal(safeReturnPath('/midterms/papers/a/index.html#unit-1'),'/midterms/papers/a/index.html#unit-1');
  assert.equal(safeReturnPath('//evil.test/midterms'),'/');
  assert.equal(safeReturnPath('/midtermsevil'),'/');
  for(const file of ['','data.json','assets/a.png','papers/a/units.csv','releases/'+'a'.repeat(64)+'/index.html']){
    const response=await serveMidterms(new Request('https://studio.test/midterms/'+file),file?file.split('/'):[],{});
    assert.equal(response.status,303);
    assert.match(response.headers.get('Location'),/^\/login\?next=/);
    assert.match(response.headers.get('Cache-Control'),/no-store/);
  }
});

test('midterms allow only manifest reader artifacts, verify integrity and preserve release links',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'midterms-route-'));
  try {
    const releaseId='a'.repeat(64),release=path.join(root,'releases',releaseId);
    await mkdir(release,{recursive:true});
    const content=Buffer.from('<!doctype html><h1>reader</h1>');
    await writeFile(path.join(release,'index.html'),content);
    await writeFile(path.join(release,'secret.md'),'private source');
    await writeFile(path.join(release,'manifest.json'),JSON.stringify({releaseId,artifacts:[{path:'index.html',bytes:content.length,sha256:createHash('sha256').update(content).digest('hex')}]}));
    await writeFile(path.join(root,'current.json'),JSON.stringify({releaseId}));
    const request=new Request('https://studio.test/midterms');
    const options={root,user:{id:'reader'}};
    let response=await serveMidterms(request,[],options);
    assert.equal(response.status,200);
    assert.equal(response.headers.get('X-Midterms-Release'),releaseId);
    assert.match(response.headers.get('Content-Security-Policy'),/connect-src 'none'/);
    response=await serveMidterms(request,['releases',releaseId,'index.html'],options);
    assert.equal(response.status,200);
    for(const parts of [['secret.md'],['manifest.json'],['..','secret.md'],['assets','..\\secret.md'],['releases','not-a-digest','index.html']]){
      assert.equal((await serveMidterms(request,parts,options)).status,404);
    }
    await writeFile(path.join(release,'index.html'),'changed');
    assert.equal((await serveMidterms(request,[],options)).status,503);
  } finally {await rm(root,{recursive:true,force:true});}
});

test('existing protected collections remain in the auth matcher and build resources',async()=>{
  const proxy=await readFile(new URL('../proxy.js',import.meta.url),'utf8');
  const config=await readFile(new URL('../next.config.mjs',import.meta.url),'utf8');
  for(const route of ['reader','library','bookshelf','national','midterms','workbench'])assert.ok(proxy.includes('/'+route+'/:path*'));
  for(const resource of ['private/library','private/bookshelf','private/national','private/midterms'])assert.ok(config.includes(resource));
});

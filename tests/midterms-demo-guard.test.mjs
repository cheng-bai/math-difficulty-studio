import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const script=new URL('../scripts/run-midterms-demo.mjs',import.meta.url);
for(const hasData of [true,false])test('demo command preserves existing non-demo or incomplete private release: '+hasData,async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'midterms-demo-guard-'));
 try{
  const rid='f'.repeat(64),folder=path.join(root,'private/midterms');
  await mkdir(path.join(folder,'releases',rid),{recursive:true});
  const pointer=JSON.stringify({releaseId:rid});await writeFile(path.join(folder,'current.json'),pointer);
  if(hasData)await writeFile(path.join(folder,'releases',rid,'data.json'),JSON.stringify({demo:false}));
  assert.throws(()=>execFileSync(process.execPath,[fileURLToPath(script)],{cwd:root,stdio:'pipe'}),error=>error.status!==0 && (hasData?/已有非演示期中资料/.test(String(error.stderr)):/ENOENT[\s\S]*data\.json/.test(String(error.stderr))));
  assert.equal(await readFile(path.join(folder,'current.json'),'utf8'),pointer);
 }finally{await rm(root,{recursive:true,force:true});}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, symlink, mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createTask, getTask, retryTask, mutateTask, listTasks, safeFile, taskPath, publicTask } from '../modules/ocr/store.mjs';
import { runWorker, acquireWorker } from '../modules/ocr/worker.mjs';
import { localRuntime, localRequest } from '../lib/local-runtime.mjs';
import { mineruArguments, runMineru } from '../modules/ocr/mineru.mjs';
import { fileLock } from '../modules/ocr/file-lock.mjs';
import { spawn, execFileSync } from 'node:child_process';

const pdf = Buffer.from('%PDF-1.7\nfixture');
async function waitFor(fn) { for (let i=0;i<100;i++) { if (await fn()) return; await new Promise(r=>setTimeout(r,10)); } throw new Error('Timed out'); }
test('local OCR storage, ownership, lifecycle and safe downloads', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'studio-ocr-'));
  const previous = { STUDIO_DATA_DIR: process.env.STUDIO_DATA_DIR, STUDIO_RUNTIME: process.env.STUDIO_RUNTIME, VERCEL: process.env.VERCEL };
  process.env.STUDIO_DATA_DIR=root; process.env.STUDIO_RUNTIME='local'; delete process.env.VERCEL;
  try {
    await t.test('explicit local opt-in is disabled in cloud and cross-origin requests', () => {
      assert.equal(localRuntime({ STUDIO_RUNTIME:'local', VERCEL:'1' }),false);
      assert.equal(localRuntime({ NODE_ENV:'development' }),false);
      const make = (host,origin) => new Request('http://127.0.0.1:3102/api/ocr/tasks',{headers:{host,origin}});
      assert.equal(localRequest(make('127.0.0.1:3102','http://127.0.0.1:3102'),true),true);
      assert.equal(localRequest(make('127.0.0.1:3102','https://127.0.0.1:3102'),true),false);
      assert.equal(localRequest(make('evil.example','http://evil.example'),true),false);
    });
    const task = await createTask({name:'../../数学.pdf',bytes:pdf,owner:'user:a',backend:'open-api'});
    await t.test('source is immutable, hashed, private and metadata is isolated',async()=>{
      assert.equal(task.source.name,'数学.pdf'); assert.match(task.source.sha256,/^[0-9a-f]{64}$/);
      assert.deepEqual(await readFile(await safeFile(task.id,task.source.file)),pdf);
      await assert.rejects(()=>getTask(task.id,'user:b'),e=>e.status===404);
      assert.equal((await listTasks('user:b')).length,0);
      await assert.rejects(()=>retryTask(task.id,'user:b'),e=>e.status===404);
      assert.equal(publicTask(task).owner,undefined); assert.equal(publicTask(task).source.file,undefined);
    });
    await t.test('invalid content, task IDs and escape paths are refused',async()=>{
      await assert.rejects(()=>createTask({name:'fake.pdf',bytes:Buffer.from('not pdf'),owner:'a',backend:'open-api'}));
      await assert.rejects(()=>createTask({name:'exam.html',bytes:pdf,owner:'a',backend:'open-api'}));
      await assert.rejects(()=>getTask('../config','user:a'),e=>e.status===404);
      await assert.rejects(()=>safeFile(task.id,'../task.json'),e=>e.status===404);
      await symlink(path.join(root,'outside'),path.join(taskPath(task.id),'escape'));
      await assert.rejects(()=>safeFile(task.id,'escape'),e=>e.status===404);
    });
    await t.test('worker singleton prevents concurrent execution',async()=>{
      const release=await acquireWorker(); await assert.rejects(()=>acquireWorker()); await release();
    });
    await t.test('worker failure is preserved and retry succeeds without altering original',async()=>{
      let calls=0; const controller=new AbortController();
      const running=runWorker({signal:controller.signal,pollMs:10,provider:async()=>{calls++;throw new Error('fixture offline');}});
      await waitFor(async()=> (await getTask(task.id)).status==='failed');controller.abort();await running;
      assert.equal(calls,1);assert.equal((await getTask(task.id)).error,'fixture offline');
      const retried=await retryTask(task.id,'user:a');assert.equal(retried.status,'queued');
      const next=new AbortController();const worker=runWorker({signal:next.signal,pollMs:10,provider:async()=>({artifacts:[{id:'0',name:'draft.md',file:'attempt-2/draft.md',bytes:5,type:'md'}],preview:'$x^2$'})});
      await waitFor(async()=> (await getTask(task.id)).status==='succeeded');next.abort();await worker;
      const result=await getTask(task.id);assert.equal(result.attempt,2);assert.equal(result.history.length,1);assert.equal(result.history[0].status,'failed');assert.equal(result.history[0].error,'fixture offline');assert.equal(result.source.sha256,task.source.sha256);
      await assert.rejects(()=>retryTask(task.id,'user:a'),e=>e.status===409);
      assert.equal(publicTask(result).artifacts[0].file,undefined);
    });
    await t.test('a previous running task is marked interrupted and not resubmitted automatically',async()=>{
      const interrupted=await createTask({name:'another.pdf',bytes:pdf,owner:'user:a',backend:'open-api'});
      await mutateTask(interrupted.id,t=>({...t,status:'running',attempt:1}));
      const controller=new AbortController();let calls=0;
      const worker=runWorker({signal:controller.signal,pollMs:10,provider:async()=>{calls++;return {};}});
      await waitFor(async()=> (await getTask(interrupted.id)).status==='interrupted');controller.abort();await worker;
      assert.equal(calls,0);assert.match((await getTask(interrupted.id)).error,/重试会重新提交/);
    });
    await t.test('short-lived task locks prevent simultaneous state mutation',async()=>{
      const release=await fileLock(path.join(taskPath(task.id),'.state-lock'));
      await assert.rejects(()=>mutateTask(task.id,t=>t),e=>e.status===409);
      await release();
    });
    await t.test('kernel lock is automatically released when owning Node process is killed',async()=>{
      const file=path.join(root,'crash-lock');
      const fixture=`import {fileLock} from ${JSON.stringify(new URL('../modules/ocr/file-lock.mjs',import.meta.url).href)};await fileLock(process.argv[1]);console.log('ready');setInterval(()=>{},1000);`;
      const child=spawn(process.execPath,['--input-type=module','-e',fixture,file],{stdio:['ignore','pipe','pipe']});
      await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);});
      await assert.rejects(()=>fileLock(file));
      const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGKILL');await exited;
      let release;
      await waitFor(async()=>{try{release=await fileLock(file);return true;}catch{return false;}});await release();
    });
    await t.test('leftover lock files and old recovery directories cannot strand queued tasks',async()=>{
      await mkdir(path.join(root,'worker-recovery.lock'));
      const q=await createTask({name:'queued.pdf',bytes:pdf,owner:'user:a',backend:'open-api'});
      await writeFile(path.join(taskPath(q.id),'.state-lock'),'old metadata');
      await mkdir(path.join(taskPath(q.id),'.lock'));
      const controller=new AbortController();let calls=0;
      const worker=runWorker({signal:controller.signal,pollMs:10,provider:async()=>{calls++;return {artifacts:[],preview:'draft'};}});
      await waitFor(async()=> (await getTask(q.id)).status==='succeeded');controller.abort();await worker;
      assert.equal(calls,1);
    });
    await t.test('MinerU uses fixed precision arguments and keeps native backend replaceable',()=>{
      const remote=mineruArguments({backend:'open-api'},'/source.pdf','/output');
      assert.deepEqual(remote.slice(0,2),['extract','/source.pdf']);assert.ok(remote.includes('vlm'));assert.ok(remote.includes('md,json'));
      assert.deepEqual(mineruArguments({backend:'local-cli'},'/a.pdf','/b').slice(0,4),['-p','/a.pdf','-o','/b']);
    });
    await t.test('provider fixture verifies output manifest and a usable ZIP without a network call',async()=>{
      const fixture=path.join(root,'fixture-cli');
      await writeFile(fixture,`#!/usr/bin/env node\nconst fs=require('node:fs');const out=process.argv[process.argv.indexOf('-o')+1];fs.mkdirSync(out+'/images',{recursive:true});fs.writeFileSync(out+'/draft.md','$x^2$\\n![](images/figure.png)');fs.writeFileSync(out+'/data.json','{}');fs.writeFileSync(out+'/images/figure.png','fixture image');`,{mode:0o700});
      const previous=process.env.MINERU_CLI;process.env.MINERU_CLI=fixture;
      try {
        const sample=await createTask({name:'provider.pdf',bytes:pdf,owner:'user:a',backend:'open-api'});sample.attempt=1;
        const result=await runMineru(sample);
        assert.ok(result.artifacts.some(a=>a.type==='md'));assert.ok(result.artifacts.some(a=>a.type==='json'));assert.ok(result.artifacts.some(a=>a.type==='png'));
        const zip=result.artifacts.find(a=>a.type==='zip');assert.ok(zip.bytes>0);
        const inspection=execFileSync(process.env.STUDIO_PYTHON||'python3',['-c','import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;assert "images/figure.png" in z.namelist();assert "draft.md" in z.namelist()',await safeFile(sample.id,zip.file)]);
        assert.equal(inspection.length,0);assert.match(result.preview,/\$x\^2\$/);
      }finally {if(previous===undefined)delete process.env.MINERU_CLI;else process.env.MINERU_CLI=previous;}
    });
  } finally {
    for(const [key,value]of Object.entries(previous)) { if(value===undefined)delete process.env[key];else process.env[key]=value; }
    await rm(root,{recursive:true,force:true});
  }
});

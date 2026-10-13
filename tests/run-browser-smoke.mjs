import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {scryptSync} from 'node:crypto';
const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const user={username:'fixture',name:'Fixture',salt:'a'.repeat(32),hash:scryptSync('browser-fixture-password','a'.repeat(32),64).toString('hex')};
const env={...process.env,STUDIO_RUNTIME:'',AUTH_PROVIDER:'legacy',AUTH_SECRET:'browser-fixture-secret-not-for-production'.repeat(2),AUTH_USERS_JSON:JSON.stringify([user])};
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:['ignore','ignore','inherit']});
try{
 let ready=false;
 for(let i=0;i<100;i++){
  if(server.exitCode!==null)throw new Error('Test server exited');
  try{const r=await fetch(`http://127.0.0.1:${port}/login`);await r.arrayBuffer();if(r.ok){ready=true;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 if(!ready)throw new Error('Test server startup timed out');
 const test=spawn(process.env.STUDIO_PYTHON||'python3',['tests/browser-smoke.py',`http://127.0.0.1:${port}`],{stdio:'inherit',env});
 process.exitCode=await new Promise((resolve,reject)=>{test.once('error',reject);test.once('exit',code=>resolve(code??1));});
}finally{
 if(server.exitCode===null){const stopped=new Promise(resolve=>server.once('exit',resolve));server.kill('SIGTERM');await stopped;}
}

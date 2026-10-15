// Publish only the generated original demo; preserve an existing real exam release.
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const root=process.cwd(),python=process.env.STUDIO_PYTHON||'python3';
let hasPointer=false;
try{
 const raw=await readFile('private/midterms/current.json','utf8');hasPointer=true;
 const pointer=JSON.parse(raw);
 if(!/^[a-f0-9]{64}$/.test(pointer.releaseId))throw new Error('Invalid existing release pointer');
 const data=JSON.parse(await readFile(path.join(root,'private/midterms/releases',pointer.releaseId,'data.json'),'utf8'));
 if(data.demo!==true)throw new Error('已有非演示期中资料；演示命令不会覆盖。请显式preview/import自己的来源。');
}catch(error){if(hasPointer||error.code!=='ENOENT')throw error;}
execFileSync(process.execPath,['scripts/setup-demo.mjs'],{stdio:'inherit'});
execFileSync(python,['scripts/setup-midterms-demo.py'],{stdio:'inherit'});
execFileSync(python,['scripts/import-midterms.py','--source','private/midterms-demo-source','--preview'],{stdio:'inherit'});
execFileSync(python,['scripts/import-midterms.py','--source','private/midterms-demo-source','--apply'],{stdio:'inherit'});
console.log('原创期中演示已就绪：/midterms；演示资料不代表真实学校或考试。');

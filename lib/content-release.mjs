import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.join(process.cwd(),'private/studio');
export async function currentRelease(){
 const {releaseId}=JSON.parse(await readFile(path.join(root,'current.json'),'utf8'));
 if(!/^r-[0-9a-f]{24}$/.test(releaseId))throw new Error('Invalid content release');
 const directory=path.join(root,'releases',releaseId);
 const manifest=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8'));
 if(manifest.releaseId!==releaseId)throw new Error('Content release mismatch');
 return {releaseId,async artifact(name){
  if(!manifest.public_artifacts.includes(name)||name.split('/').some(p=>!p||p==='.'||p==='..'||p.includes('\\')))return null;
  const data=await readFile(path.join(directory,'artifacts',name));
  if(createHash('sha256').update(data).digest('hex')!==manifest.files['artifacts/'+name])throw new Error('Content integrity failure');
  return data;
 },async json(name){const data=await this.artifact(name);if(!data)throw new Error('Unknown content artifact');return JSON.parse(data.toString('utf8'));}};
}

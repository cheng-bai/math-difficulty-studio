import { randomBytes, scryptSync } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const [command,rawUsername] = process.argv.slice(2), username=(rawUsername||'').toLowerCase();
if(!['add','reset','disable'].includes(command)||!/^[a-z0-9_-]{3,40}$/.test(username)) throw new Error('Usage: node scripts/manage-account.mjs add|reset|disable username');
const env=JSON.parse(readFileSync('.local/deployment-env.json','utf8'));
const users=JSON.parse(env.AUTH_USERS_JSON), index=users.findIndex(u=>u.username===username);
if(command==='add'&&index>=0)throw new Error('Account already exists; use reset');
if(command!=='add'&&index<0)throw new Error('Account not found');
if(command==='disable'&&users.length===1)throw new Error('Refusing to disable the only account');
let password;
if(command==='disable')users.splice(index,1);
else {
  password=randomBytes(18).toString('base64url');const salt=randomBytes(16).toString('hex');
  const user={username,name:index>=0?users[index].name:username,salt,hash:scryptSync(password,salt,64).toString('hex')};
  if(index>=0)users[index]=user;else users.push(user);
  writeFileSync(`.local/登录账号-${username}.txt`,`数学难度研究室\n账号：${username}\n密码：${password}\n`,{mode:0o600});
  // Keep the owner's credential file and verification fixture consistent after reset.
  if(existsSync('.local/credentials.json')) {
    const owner=JSON.parse(readFileSync('.local/credentials.json','utf8'));
    if(owner.username===username){writeFileSync('.local/credentials.json',JSON.stringify({username,password}),{mode:0o600});writeFileSync('.local/登录账号.txt',`数学难度研究室\n账号：${username}\n密码：${password}\n`,{mode:0o600});}
  }
}
env.AUTH_USERS_JSON=JSON.stringify(users);
writeFileSync('.local/deployment-env.json',JSON.stringify(env),{mode:0o600});
const current=existsSync('.env.local')?readFileSync('.env.local','utf8'):'';
const rest=current.split('\n').filter(line=>!/^AUTH_(SECRET|USERS_JSON)=/.test(line)).join('\n');
writeFileSync('.env.local',`${rest}\nAUTH_SECRET=${env.AUTH_SECRET}\nAUTH_USERS_JSON='${env.AUTH_USERS_JSON}'\n`,{mode:0o600});
console.log(`Account ${command} complete. Sync AUTH_USERS_JSON to Vercel and redeploy to apply.`);

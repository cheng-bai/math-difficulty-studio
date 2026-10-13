"""Local single-writer repository, immutable releases, atomic activation."""
import fcntl,json,os,re,shutil,tempfile,uuid
from contextlib import contextmanager
from pathlib import Path
from .domain import encoded,digest,load,validate
from .rendering import build

class Repository:
 def __init__(self,root,store=None):
  self.root=Path(root).resolve();self.paper_id=load(self.root/'studio-project.json')['migrated_papers'][0]
  if not re.fullmatch(r'[A-Za-z0-9_-]+',self.paper_id):raise ValueError('非法试卷ID')
  self.store=Path(store) if store else self.root/'private/studio'
 def pointer(self):return load(self.store/'current.json')
 def release(self,rid):
  if not re.fullmatch(r'r-[0-9a-f]{24}',rid):raise ValueError('非法内容版本')
  return self.store/'releases'/rid
 @contextmanager
 def lock(self):
  self.store.mkdir(parents=True,exist_ok=True)
  with (self.store/'.lock').open('a') as f:
   fcntl.flock(f,fcntl.LOCK_EX)
   try:yield
   finally:fcntl.flock(f,fcntl.LOCK_UN)
 def sources(self,rid=None):
  p=self.release(rid or self.pointer()['releaseId'])/'source'/self.paper_id
  paper=load(p/'paper.json');return paper,{uid:load(p/(uid+'.json')) for uid in paper['unit_ids']}
 def check(self,rid=None):
  rid=rid or self.pointer()['releaseId'];p=self.release(rid);m=load(p/'manifest.json')
  if m['releaseId']!=rid:raise ValueError('版本标识不匹配')
  for name,sha in m['files'].items():
   if '..' in Path(name).parts or Path(name).is_absolute() or digest((p/name).read_bytes())!=sha:raise ValueError('快照完整性失败: '+name)
  return m
 def activate(self,rid,requests):
  raw=encoded(dict(schema_version='studio-pointer-v1',releaseId=rid,requests=requests))
  tmp=self.store/('.pointer-'+uuid.uuid4().hex)
  try:
   with tmp.open('wb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
   os.replace(tmp,self.store/'current.json')
   fd=os.open(self.store,os.O_RDONLY)
   try:os.fsync(fd)
   finally:os.close(fd)
  finally:tmp.unlink(missing_ok=True)
 def construct(self,paper,units,change,parent,fail=False):
  artifacts,deps=build(self.root,paper,units)
  rid='r-'+digest(dict(paper=paper,units=units,artifacts={k:digest(v) for k,v in artifacts.items()},parent=parent,change=change))[:24]
  final=self.release(rid);final.parent.mkdir(parents=True,exist_ok=True)
  if final.exists():self.check(rid);return rid
  stage=Path(tempfile.mkdtemp(prefix='.building-',dir=self.store))
  try:
   files={**{'artifacts/'+k:v for k,v in artifacts.items()},'source/'+self.paper_id+'/paper.json':encoded(paper),**{'source/'+self.paper_id+'/'+k+'.json':encoded(v) for k,v in units.items()},'change.json':encoded(change)}
   for name,raw in files.items():
    p=stage/name;p.parent.mkdir(parents=True,exist_ok=True)
    with p.open('wb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
   manifest=dict(schema_version='studio-release-v1',releaseId=rid,parent=parent,files={k:digest(v) for k,v in files.items()},public_artifacts=sorted(artifacts),dependencies=deps)
   (stage/'manifest.json').write_bytes(encoded(manifest))
   if fail:raise RuntimeError('注入的生成失败')
   for name,sha in deps.items():
    if digest((self.root/name).read_bytes())!=sha:raise ValueError('旧卷或索引在生成时改变，请重试')
   os.rename(stage,final);self.check(rid)
   return rid
  finally:
   if stage.exists():shutil.rmtree(stage)
 def init(self):
  with self.lock():
   if (self.store/'current.json').exists():return self.pointer()['releaseId']
   seed=self.root/'content/migration'/self.paper_id;paper=load(seed/'paper.json');units={uid:load(seed/(uid+'.json')) for uid in paper['unit_ids']}
   rid=self.construct(paper,units,dict(type='initialization',math_review='原创演示数据；结构分仅用于演示，不代表学生表现'),None);self.activate(rid,{})
   return rid
 def prepare(self,change):
  validate(self.root,'change',change);pointer=self.pointer();key=change['requestId'];sha=digest(change)
  old=pointer['requests'].get(key)
  if old:
   if old['sha256']!=sha:raise ValueError('同一requestId对应不同内容')
   return old['releaseId'],None,None
  if pointer['releaseId']!=change['expectedReleaseId']:raise ValueError('发布版本冲突')
  self.check();paper,units=self.sources();seen=set()
  if change['paperId']!=paper['id']:raise ValueError('试卷ID不匹配')
  for entry in change['units']:
   u=entry['value'];uid=u['id']
   if uid in seen or uid not in units:raise ValueError('重复或未知题号')
   seen.add(uid)
   if units[uid]['revision']!=entry['expectedRevision'] or u['revision']!=entry['expectedRevision']+1:raise ValueError('题目版本冲突')
   units[uid]=u
  return pointer,paper,units
 def preview(self,change):
  pointer,paper,units=self.prepare(change)
  if paper is None:return dict(releaseId=pointer,idempotent=True)
  artifacts,_=build(self.root,paper,units)
  return dict(expectedReleaseId=pointer['releaseId'],changed=[x['value']['id'] for x in change['units']],collection=json.loads(artifacts['collection.json']),dataset=json.loads(artifacts['national/'+self.paper_id+'/分析数据.json']))
 def apply(self,change,fail=False):
  with self.lock():
   pointer,paper,units=self.prepare(change)
   if paper is None:return pointer
   rid=self.construct(paper,units,change,pointer['releaseId'],fail=fail)
   requests={**pointer['requests'],change['requestId']:dict(sha256=digest(change),releaseId=rid)}
   self.activate(rid,requests);return rid
 def rebuild(self,expected):
  with self.lock():
   p=self.pointer()
   if p['releaseId']!=expected:raise ValueError('发布版本冲突')
   self.check();paper,units=self.sources();rid=self.construct(paper,units,{'type':'rebuild'},expected)
   self.activate(rid,p['requests']);return rid
 def rollback(self,target,expected):
  with self.lock():
   p=self.pointer()
   if p['releaseId']!=expected:raise ValueError('发布版本冲突')
   self.check(target)
   # Request history stays monotonic even when content moves backwards.
   self.activate(target,p['requests']);return target

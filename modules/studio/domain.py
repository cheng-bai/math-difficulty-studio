"""Strict editorial inputs and deterministic derived values."""
import hashlib,json,re
from pathlib import Path
from statistics import mean,median,pstdev
from jsonschema import Draft202012Validator
from .scoring import score_question

def encoded(value):
 return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False).encode()
def digest(value):return hashlib.sha256(value if isinstance(value,bytes) else encoded(value)).hexdigest()
def load(path):return json.loads(Path(path).read_text())
def validate(root,kind,value):
 Draft202012Validator(load(root/'schemas'/f'{kind}.schema.json')).validate(value)
def statistics(items):
 required=[q for q in items if not q.get('optional')];valid=[q for q in required if q.get('D') is not None];ds=[q['D'] for q in valid]
 return dict(total=len(required),valid=len(valid),pending=len(required)-len(valid),coverage=len(valid)/len(required) if required else 0,mean=mean(ds) if ds else None,median=median(ds) if ds else None,maximum=max(ds) if ds else None,population_sd=pstdev(ds) if ds else None,bands={b:sum(q['band']==b for q in valid) for b in ['基础','中档','难题']},optional=len(items)-len(required),mean_HCT={k:mean(q[k] for q in valid) if valid else None for k in 'HCT'})
def compute(root,paper,units,render):
 engine=digest((root/'modules/studio/scoring.py').read_bytes())
 if paper['engine_sha256']!=engine:raise ValueError('评分引擎哈希不匹配，须显式升级算法版本')
 if set(units)!=set(paper['unit_ids']) or len(set(paper['unit_ids']))!=len(paper['unit_ids']):raise ValueError('题目清单不匹配')
 items=[]
 for uid in paper['unit_ids']:
  u=units[uid];validate(root,'unit',u)
  if u['id']!=uid:raise ValueError('题号与文件不匹配')
  if not u['content']['question'].strip():raise ValueError('题干为空')
  if not set(u['source_ids'])<=set(s['id'] for s in paper['sources']):raise ValueError('未知来源')
  a=u['analysis_input'];steps={s['id'] for s in a['steps']};phases={p['id'] for p in a['phases']}
  if any(s.get('phase_id') not in phases for s in a['steps']):raise ValueError('步骤阶段不存在')
  if any(not set(p['step_ids'])<=steps for p in a['phases']):raise ValueError('阶段引用不存在')
  if [x['item'] for x in a['risks']]!=list(range(1,6)):raise ValueError('风险序号应为1—5')
  result=score_question(dict(id=uid,**a,t=[x['value'] for x in a['risks']],T_evidence=a['risks']))
  q={k:u[k] for k in ['id','n','kind','points','optional','module']}
  q.update(a);q.update({k:render(v) for k,v in u['content'].items()});q.update(result)
  q['version']=f"r{u['revision']}";q['analysis_binding']=dict(input_sha256=digest(u),engine_sha256=engine,algorithm=paper['algorithm'])
  items.append(q)
 return dict(items=items,stats=statistics(items),algorithm=paper['algorithm'],source=paper['source'],paper_name=paper['paper_name'])

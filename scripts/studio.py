#!/usr/bin/env python3
"""Offline content maintenance. Production has no write or AI endpoint."""
import argparse,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from modules.studio.repository import Repository
from modules.studio.domain import load
p=argparse.ArgumentParser(description=__doc__);s=p.add_subparsers(dest='command',required=True)
for name in ['init','inspect','check']:s.add_parser(name)
for name in ['preview','apply']:
 a=s.add_parser(name);a.add_argument('change',type=Path)
a=s.add_parser('draft');a.add_argument('unit');a.add_argument('--out',type=Path,required=True);a.add_argument('--request',required=True);a.add_argument('--reason',required=True)
a=s.add_parser('rebuild');a.add_argument('--expected-release',required=True)
a=s.add_parser('rollback');a.add_argument('target');a.add_argument('--expected-release',required=True)
a=p.parse_args();repo=Repository(ROOT)
try:
 if a.command=='init':result={'releaseId':repo.init()}
 elif a.command=='inspect':
  paper,units=repo.sources();result={'releaseId':repo.pointer()['releaseId'],'paper':paper,'revisions':{k:v['revision'] for k,v in units.items()},'source':str(repo.release(repo.pointer()['releaseId'])/'source'/repo.paper_id)}
 elif a.command=='draft':
  import copy
  paper,units=repo.sources();u=copy.deepcopy(units[a.unit]);revision=u['revision'];u['revision']+=1
  result=dict(schema_version='studio-change-v1',requestId=a.request,expectedReleaseId=repo.pointer()['releaseId'],paperId=paper['id'],reason=a.reason,units=[dict(expectedRevision=revision,value=u)])
  from modules.studio.domain import validate
  validate(ROOT,'change',result)
  with a.out.open('x') as f:json.dump(result,f,ensure_ascii=False,indent=2)
  result={'draft':str(a.out.resolve()),'status':'仅创建草稿，未改变发布内容'}
 elif a.command=='check':result={'releaseId':repo.check()['releaseId'],'integrity':'ok'}
 elif a.command=='preview':result=repo.preview(load(a.change))
 elif a.command=='apply':
  result={'releaseId':repo.apply(load(a.change)),'currentReleaseId':repo.pointer()['releaseId']}
 elif a.command=='rebuild':result={'releaseId':repo.rebuild(a.expected_release)}
 else:result={'releaseId':repo.rollback(a.target,a.expected_release)}
 print(json.dumps(result,ensure_ascii=False,indent=2))
except Exception as e:
 print(f'内容操作失败: {e}',file=sys.stderr);sys.exit(1)

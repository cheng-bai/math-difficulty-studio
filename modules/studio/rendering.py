"""One build generates all reader artifacts; no scores in templates."""
import html,json,re,subprocess
from pathlib import Path
from markdown_it import MarkdownIt
from .domain import load,encoded,digest,compute,statistics

def js(value):return encoded(value).decode().replace('<','\\u003c').replace('>','\\u003e').replace('&','\\u0026')
def markdown(value):
 # Keep LaTeX out of Markdown escape handling. Raw HTML is always escaped.
 tokens=[]
 def hold(m):
  tex=m[2] if m[1]=='$$' else m[3]
  if any(x in tex for x in ['\\href','\\url','\\html','\\includegraphics']):raise ValueError('公式含不允许的链接或HTML指令')
  tokens.append(f'<span class="tex" data-display="{str(m[1]=="$$").lower()}" data-tex="{html.escape(tex,quote=True)}"></span>')
  return f'STUDIOMATHTOKEN{len(tokens)-1}END'
 value=re.sub(r'(\$\$)(.+?)\$\$|\$([^$\n]+)\$',hold,value,flags=re.S)
 if '$' in value:raise ValueError('未配对的数学分隔符')
 md=MarkdownIt('commonmark',{'html':False})
 tree=md.parse(value)
 def images(nodes):
  for token in nodes:
   if token.type=='image':
    url=token.attrGet('src') or ''
    if not re.fullmatch(r'/national/assets/[0-9a-f]{64}\.(png|jpg|jpeg)',url):raise ValueError('题图必须引用受控内容资产')
   if token.children:images(token.children)
 images(tree)
 result=md.renderer.render(tree,md.options,{})
 for i,v in enumerate(tokens):result=result.replace(f'STUDIOMATHTOKEN{i}END',v)
 return result

def plain(s):
 s=re.sub(r'data-tex="([^"]*)"',lambda m:'> '+html.unescape(m[1])+' <',s)
 return re.sub(r'\s+',' ',html.unescape(re.sub('<[^>]*>',' ',s))).strip()
def legacy_dataset(path):return json.loads(re.search(r'<script[^>]*id="analysis-data"[^>]*>(.*?)</script>',path.read_text(),re.S)[1])
def reader(root,d,paper):
 s=d['stats'];items=d['items'];valid=[q for q in items if not q['optional'] and q['D'] is not None];highest=max(valid,key=lambda q:q['D']) if valid else None
 value=lambda v:'—' if v is None else f'{v:.2f}'
 cells=[('已评分 / 必答小问',f'{s["valid"]}<small>/ {s["total"]}</small>',f'待核{s["pending"]}问 · 选做另列{s["optional"]}问'),('平均难度 D · 已评分必答问',value(s['mean']),f'分母{s["valid"]}问 · 不代表失分率'),('最高难度 D',str(s['maximum']) if highest else '—',f'第{highest["id"]}问 · B={highest["B"]}' if highest else '暂无已定分问'),('难题问数 / B=3 小问',f'{s["bands"]["难题"]}<small>/ {sum(q["B"]==3 for q in valid)}</small>','B=3：关键想法有明显发现门槛')]
 metrics='<section class="metrics" aria-label="全卷统计">'+''.join(f'<div class="metric"><span class="caption">{a}</span><span class="num">{b}</span><span class="small">{c}</span></div>' for a,b,c in cells)+'</section>'
 bands=s['bands'];dist=f'<aside class="dist"><h3>有效必答{s["valid"]}问的档位分布</h3><div class="ratio">{bands["基础"]} <span style="font:14px sans-serif">基础 / {bands["中档"]} 中档 / {bands["难题"]} 难题</span></div><div class="stack">'
 for b,color in zip(bands,['green','orange','red']):dist+=f'<span style="width:{100*bands[b]/max(1,s["valid"])}%;background:var(--{color})"></span>'
 dist+='</div>'+''.join(f'<div class="dist-row"><span>{b}</span><b>{100*n/max(1,s["valid"]):.1f}%</b></div>' for b,n in bands.items())+'</aside>'
 template=(root/'content/templates/national-reader.html').read_text()
 values={'DATA':js(d),'METRICS':metrics,'DISTRIBUTION':dist,'HERO_BANDS':f'<strong>{bands["基础"]} 基础 / {bands["中档"]} 中档 / {bands["难题"]} 难题</strong>','INITIAL_UNIT':js(paper['initial_unit']),'PAPER_NAME':html.escape(paper['paper_name']),'PAPER_ID':js(paper['id'])}
 for k,v in values.items():template=template.replace('@@'+k+'@@',v)
 # Explicit downloadable reader data comes from the same immutable release.
 template=template.replace('返回试卷总览 →</a>','返回试卷总览 →</a><a class="reader-action secondary" href="./分析数据.json" download>下载分析数据 ↓</a>')
 return template

def validate_math(root,units):
 formulas=[]
 def walk(v):
  if isinstance(v,dict):
   for x in v.values():walk(x)
  elif isinstance(v,list):
   for x in v:walk(x)
  elif isinstance(v,str):
   for m in re.finditer(r'(\$\$)(.+?)\$\$|\$([^$\n]+)\$',v,re.S):formulas.append(dict(tex=m[2] if m[1] else m[3],display=bool(m[1])))
 for u in units.values():walk(u)
 result=subprocess.run(['node',str(root/'scripts/validate-math.cjs'),str(root/'content/templates/national-reader.html')],input=encoded(formulas),capture_output=True,timeout=20)
 if result.returncode:raise ValueError('公式未通过KaTeX语法验证：'+result.stderr.decode()[:1200])

def build(root,paper,units):
 validate_math(root,units)
 d=compute(root,paper,units,markdown);datasets={paper['id']:d};dependencies={}
 def dependency(p):dependencies[str(p.relative_to(root))]=digest(p.read_bytes())
 for p in sorted((root/'private/national').glob('*/试卷难度分析.html')):
  if p.parent.name==paper['id']:continue
  dependency(p);datasets[p.parent.name]=legacy_dataset(p)
 catalog=[]
 for pid,data in sorted(datasets.items()):
  qs=data['items'];s=statistics(qs);valid=[q for q in qs if not q.get('optional') and q.get('D') is not None];highest=max(valid,key=lambda q:q['D']) if valid else None
  catalog.append(dict(id=pid,name=data['paper_name'],url=pid+'/试卷难度分析.html',stats=s,main_questions=len(set(q['n'] for q in qs if not q.get('optional'))),breakthroughs=sum(q.get('B',0) is not None and q.get('B',0)>=2 for q in valid),highest=highest['id'] if highest else '—',modules=list(dict.fromkeys(q['module'] for q in qs))[:5],pending=[q['id'] for q in qs if q.get('pending')],units=[{k:q.get(k) for k in ['id','D','B','band','pending','optional']} for q in qs]))
 allq=[q for data in datasets.values() for q in data['items']];summary=dict(papers=len(catalog),total=len(allq),valid=sum(q['D'] is not None for q in allq),pending=sum(q['D'] is None for q in allq))
 index_path=root/'private/search/index.json';dependency(index_path);index=load(index_path)
 by_id={q['id']:q for q in d['items']}
 for record in index['records']:
  if record.get('paper_id')!='national-'+paper['id']:continue
  q=by_id[record['unit']];record.update(D=q['D'],B=q['B'],status='待复核' if q['pending'] else ('需关注' if q.get('review_flag') else '报告已定分'),version=q['version'],module=q['module'],topics=[q['module']],summary=plain(q['question'])[:260],search_text=plain(q['question'])+' '+plain(q['B_evidence'])+' '+' '.join(x['action'] for x in q['steps']),methods=list(dict.fromkeys(x['action'] for x in q['steps'])))
 if sum(x.get('paper_id')=='national-'+paper['id'] for x in index['records'])!=len(units):raise ValueError('索引缺少迁移题目')
 pending_note='；'.join(f'{p["name"]}第{"、".join(p["pending"])}问待核' for p in catalog if p['pending'])
 overview=(root/'content/templates/national-overview.html').read_text().replace('@@PAPERS@@',js(catalog)).replace('@@PENDING_NOTE@@',html.escape(pending_note))
 table='| 试卷 | 已评分/必答 | 平均D | 待核 |\n|---|---:|---:|---:|\n'+'\n'.join(f'| {p["name"]} | {p["stats"]["valid"]}/{p["stats"]["total"]} | {p["stats"]["mean"]} | {p["stats"]["pending"]} |' for p in catalog)
 artifacts={'national/'+paper['id']+'/试卷难度分析.html':reader(root,d,paper).encode(),'national/'+paper['id']+'/分析数据.json':encoded(d),'national/试卷总览.html':overview.encode(),'national/试卷总报告.md':(root/'content/templates/national-report.md').read_text().replace('@@TABLE@@',table).encode(),'collection.json':encoded(summary),'catalog.json':encoded(catalog),'search.json':encoded(index)}
 for field in [u['content'] for u in units.values()]:
  for value in field.values():
   for name in re.findall('/national/assets/([0-9a-f]{64}\\.(?:png|jpg|jpeg))',value):
    p=root/'content/assets'/name;raw=p.read_bytes()
    if digest(raw)!=name.split('.')[0]:raise ValueError('题图哈希不匹配')
    artifacts['national/assets/'+name]=raw
 return artifacts,dependencies

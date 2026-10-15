#!/usr/bin/env python3
"""Build a private, repeatable midterm reader release. Never edits source papers.

--preview validates and renders into a temporary directory without publishing.
--apply publishes an immutable content-addressed release and atomically switches
private/midterms/current.json. Requires Python markdown-it-py and local Node/KaTeX.
"""
import argparse
import csv
import hashlib
import html
import io
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from html.parser import HTMLParser
from urllib.parse import unquote, urlsplit
from markdown_it import MarkdownIt

SITE = Path(__file__).resolve().parents[1]
UI = Path(__file__).with_name('midterms-assets')
SCHOOLS = [('jianping', '建平'), ('jincai', '进才'), ('huaer', '华二'),
           ('gezhi', '格致'), ('datong', '大同'), ('xiangming', '向明')]
YEARS = ['2023-2024', '2024-2025', '2025-2026']
GROUPS = {'jianping': ['jianping', 'jincai', 'huaer'], 'gezhi': ['gezhi', 'datong', 'xiangming']}
IMAGE_TYPES = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'}
ID = re.compile(r'^[a-z0-9][a-z0-9-]{0,100}$')
ALGORITHM = 'HCT-rules-v1.1'


class PlainTable(HTMLParser):
    """Extract table cell text only; source HTML never executes in the reader."""
    def __init__(self):
        super().__init__(); self.rows=[]; self.row=[]; self.cell=None
    def handle_starttag(self, tag, attrs):
        if tag == 'tr': self.row=[]
        if tag in ('td','th'): self.cell=[]
        if tag == 'br' and self.cell is not None: self.cell.append(' / ')
    def handle_data(self, data):
        if self.cell is not None: self.cell.append(data)
    def handle_endtag(self, tag):
        if tag in ('td','th') and self.cell is not None:
            self.row.append(''.join(self.cell).strip().replace('|',r'\|').replace('\n',' ')); self.cell=None
        if tag == 'tr' and self.row: self.rows.append(self.row)


def plain_tables(text):
    def convert(match):
        parser=PlainTable();parser.feed(match.group())
        if not parser.rows: return match.group()
        width=max(map(len,parser.rows))
        rows=[row+['']*(width-len(row)) for row in parser.rows]
        return '\n\n'+'\n'.join('| '+' | '.join(row)+' |' for row in [rows[0],['---']*width,*rows[1:]])+'\n\n'
    return re.sub(r'<table\b[^>]*>[\s\S]*?</table>',convert,text,flags=re.I)


def dumps(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, allow_nan=False, separators=(',', ':'))


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def clean(value):
    """Reader products retain source names, never private machine paths."""
    value = str(value or '')
    value = re.sub(r'/Users/[^\s<>\]\)\"，。；]+', '〔本地来源〕', value)
    value = re.sub(r'[A-Za-z]:[\\/][^\s<>\]\)\"，。；]+', '〔本地来源〕', value)
    return value


def load_json(path, default=None):
    return json.loads(path.read_text(encoding='utf-8-sig')) if path.exists() else default


def unique(items, key, label):
    result = {}
    for item in items:
        ident = str(key(item) or '')
        if not ident:
            raise ValueError(f'{label}: missing id')
        if ident in result and result[ident] != item:
            raise ValueError(f'{label}: conflicting duplicate {ident}')
        result[ident] = item
    return result


def stats(units, total_points=None):
    valid = [q for q in units if q['computed'] is not None]
    points = [q['points'] for q in units]
    all_points = bool(units) and all(number(p) and p > 0 for p in points)
    known_points = sum(p for p in points if number(p) and p > 0)
    valid_points = sum(q['points'] for q in valid if number(q['points']) and q['points'] > 0)
    declared = total_points if number(total_points) and total_points > 0 else None
    denominator = declared if declared is not None else known_points if all_points else None
    ds = [q['computed']['D'] for q in valid]
    mean = sum(ds) / len(ds) if ds else None
    weighted = (sum(q['points'] * q['computed']['D'] for q in valid) / valid_points
                if all_points and valid_points else None)
    bins = [sum(d < 35 for d in ds), sum(35 <= d < 65 for d in ds), sum(d >= 65 for d in ds)]
    return {'total': len(units), 'valid': len(valid), 'pending': len(units)-len(valid),
            'question_coverage': len(valid)/len(units) if units else None,
            'known_points': known_points, 'valid_points': valid_points,
            'point_denominator': denominator,
            'point_coverage': valid_points/denominator if denominator else None,
            'all_points_known': all_points, 'mean_D': mean, 'weighted_D': weighted,
            'median_D': sorted(ds)[len(ds)//2] if len(ds)%2 else
            (sum(sorted(ds)[len(ds)//2-1:len(ds)//2+1])/2 if ds else None),
            'max_D': max(ds) if ds else None,
            'std_D': (sum((d-mean)**2 for d in ds)/len(ds))**.5 if ds else None,
            'bands': bins,
            'HCT': {k: sum(q['computed'][k] for q in valid)/len(valid) if valid else None for k in ['H','C','T']}}


def normalize_paper(meta, directory, warnings):
    ident = meta['id']
    analysis = load_json(directory/'analysis-input.json', {})
    delivery_dir = meta.get('delivery_dir', 'delivery')
    if not re.fullmatch(r'delivery(?:-v[1-9][0-9]*)?', delivery_dir):
        raise ValueError(f'{ident}: invalid delivery directory')
    detail = load_json(directory/delivery_dir/'评分明细.json', {})
    if detail and detail.get('algorithm') != ALGORITHM:
        raise ValueError(f'{ident}: unsupported scoring algorithm')
    if detail.get('paper_id') not in (None, ident):
        raise ValueError(f'{ident}: scoring paper_id mismatch')
    aq = unique(analysis.get('questions', []), lambda q:q.get('id'), f'{ident} analysis')
    delivered = unique(detail.get('questions', []), lambda q:q.get('evidence', {}).get('id') or q.get('computed', {}).get('id'), f'{ident} delivery')
    raw = unique(meta.get('units', []), lambda q:q.get('id'), f'{ident} units')
    order = list(raw)
    for qid in analysis.get('expected_question_ids', []) + list(aq):
        if qid not in order:
            order.append(qid)
    if set(delivered)-set(order):
        raise ValueError(f'{ident}: scoring contains unknown question ids')
    units = []
    for qid in order:
        combined = {**aq.get(qid, {}), **raw.get(qid, {})}
        record = delivered.get(qid, {})
        evidence = record.get('evidence', {})
        computed = record.get('computed')
        if computed is not None and computed.get('id') != qid:
            raise ValueError(f'{ident}: computed id mismatch {qid}')
        pending = bool(combined.get('pending')) or bool(evidence.get('pending'))
        verified = evidence.get('verification_status') == '已核验'
        if combined.get('verification_status') not in (None, '', '已核验'):
            verified = False
        scored = (not pending and verified and isinstance(computed, dict)
                  and not computed.get('pending') and all(number(computed.get(k)) for k in ['H','C','T','D']))
        if scored and any(not 0 <= computed[k] <= 100 for k in ['H','C','T','D']):
            raise ValueError(f'{ident}:{qid}: score outside 0..100')
        value = {k: computed[k] for k in ['H','C','T','D']} if scored else None
        if value is not None:
            value.update(peak=computed.get('peak') if isinstance(computed.get('peak'), dict) else None,
                         E=computed.get('E') if number(computed.get('E')) else None,
                         B=computed.get('B') if number(computed.get('B')) else None,
                         band=clean(computed.get('band')),
                         branches=computed.get('branches', evidence.get('branches')),
                         review_flag=('规则分可能低估，需教师复核' if computed.get('review_flag') is True else clean(computed.get('review_flag'))))
        points = combined.get('points', combined.get('score', evidence.get('score')))
        if points is not None and (not number(points) or points <= 0):
            raise ValueError(f'{ident}:{qid}: invalid points')
        tags = {}
        for field in ['topics', 'methods', 'atoms']:
            labels = combined.get(field) or []
            if isinstance(labels, str):
                labels = [labels]
            tags[field] = list(dict.fromkeys(clean(t) for t in labels if str(t).strip()))
        units.append({'id':str(qid), 'n':combined.get('n'), 'sub':clean(combined.get('sub')),
                      'kind':clean(combined.get('kind')) or '待分类', 'points':points,
                      'module':clean(combined.get('module')) or '待分类', **tags,
                      'question':clean(combined.get('question')),
                      'answer':clean(combined.get('answer')), 'solution':clean(combined.get('solution')),
                      'figure_paths':combined.get('figure_paths') or [],
                      'verification_status':'已核验' if scored else clean(combined.get('verification_status')) or '待核验',
                      'pending':not scored, 'issue':clean(combined.get('issue') or evidence.get('issue')),
                      'source_ref':clean(evidence.get('source_ref') or combined.get('source_ref')),
                      'computed':value, 'evidence':evidence if scored else {},
                      'calculation':{k:computed.get(k) for k in ['path','step_scores','E']} if scored else {}})
    total_points = meta.get('total_points')
    stat = stats(units, total_points)
    if number(total_points) and stat['known_points'] > total_points + .001:
        raise ValueError(f'{ident}: subquestion points exceed total_points (possible duplicated shared points)')
    markdown = directory/'转录.md'
    report = directory/'教师报告.md'
    signature = {k:detail.get(k, analysis.get(k)) for k in ['algorithm','parameter_version','parameters','dictionary_version']}
    signature['dictionary'] = analysis.get('step_types', load_json(directory/delivery_dir/'步骤类型词典.json', {}))
    return {**{k:clean(meta.get(k)) for k in ['id','school','school_key','school_year','title','grade','term','exam']},
            'total_points':total_points if number(total_points) else None,
            'duration':meta.get('duration_minutes', meta.get('duration')) if number(meta.get('duration_minutes', meta.get('duration'))) else None,
            'exam_scope':clean('、'.join(meta.get('exam_scope', [])) if isinstance(meta.get('exam_scope'), list) else meta.get('exam_scope')),
            'units':units, 'statistics':stat,
            'source_names':list(dict.fromkeys(clean(p.get('name') or Path(p.get('path','')).name) for p in meta.get('pdfs', []))),
            'has_transcript':markdown.exists(), 'has_report':report.exists(),
            'source_school_year':clean(meta.get('source_school_year')),
            'year_conflict':bool(meta.get('year_conflict')),
            'comparison_eligible':meta.get('comparison_eligible') is not False and not meta.get('year_conflict'),
            'status':'来源学年冲突' if meta.get('year_conflict') else '已核验评分' if units and stat['valid']==stat['total'] else '部分评分' if stat['valid'] else '待核验 / 尚未评分' if units else '转录待校' if markdown.exists() else '已收录原卷',
            'rules_fingerprint':hashlib.sha256(dumps(signature).encode()).hexdigest() if detail else None,
            '_directory':directory, '_markdown':markdown, '_report':report}


class Renderer:
    def __init__(self, out, base, warnings):
        self.out, self.base, self.warnings = out, base, warnings
        self.math = []
        self.paper_links = {}
        self.markdown = MarkdownIt('commonmark', {'html':False}).enable('table')
        self.markdown.renderer.rules['image'] = self.image
        self.markdown.renderer.rules['link_open'] = self.link
        self.context = out

    def asset(self, url):
        parsed = urlsplit(unquote(str(url)))
        if parsed.scheme or parsed.netloc or parsed.query:
            self.warnings.append('外部或非本地题图未发布')
            return None
        try:
            target = (self.context/parsed.path).resolve()
            target.relative_to(self.context.resolve())
        except ValueError:
            self.warnings.append('题图路径越界，未发布')
            return None
        if not target.is_file() or target.suffix.lower() not in IMAGE_TYPES:
            self.warnings.append('题图缺失或格式不支持')
            return None
        data = target.read_bytes()
        name = hashlib.sha256(data).hexdigest()+target.suffix.lower()
        dest = self.out/'assets'/'figures'/name
        dest.parent.mkdir(parents=True, exist_ok=True)
        if not dest.exists():
            dest.write_bytes(data)
        return self.base+'assets/figures/'+name

    def image(self, tokens, idx, options, env):
        token = tokens[idx]
        url = self.asset(token.attrGet('src'))
        return f'<figure><img loading="lazy" src="{html.escape(url,quote=True)}" alt="{html.escape(token.content,quote=True)}"></figure>' if url else '<p class="notice">题图待补齐，请暂缓使用相关条件。</p>'

    def link(self, tokens, idx, options, env):
        token = tokens[idx]
        href = token.attrGet('href') or ''
        if href.startswith('paper:'):
            token.attrSet('href', self.paper_links.get(href, '#sources'))
        elif not href.startswith('#'):
            token.attrSet('href', '#sources')
        return self.markdown.renderer.renderToken(tokens, idx, options, env)

    def render(self, text, context):
        self.context = context
        text = plain_tables(clean(text)).replace('\\[', '$$').replace('\\]', '$$').replace('\\(', '$').replace('\\)', '$')
        def mask(match):
            raw = match.group(0)
            display = raw.startswith('$$')
            tex = raw[2:-2] if display else raw[1:-1]
            idx = len(self.math)
            self.math.append({'tex':tex.strip(), 'display':display, 'origin':context.name})
            return f' MIDTERMSMATH{idx}PLACEHOLDER '
        # Do not remove multiline math before Markdown; placeholders survive table/list parsing.
        text = re.sub(r'\$\$[\s\S]+?\$\$|(?<!\\)\$(?!\$)(?:\\.|[^$\n])+?(?<!\\)\$', mask, text)
        html = self.markdown.render(text)
        # Wide prose tables must scroll inside their own container, never widen the page.
        return re.sub(r'<table(\s[^>]*)?>', lambda m: '<div class="table-scroll"><table'+(m.group(1) or '')+'>', html).replace('</table>', '</table></div>')

    def finish(self):
        result = subprocess.run(['node', str(UI/'render-math.cjs'), str(SITE/'public/vendor/katex/katex.min.js')],
                                input=dumps(self.math), capture_output=True, text=True, check=True)
        rendered = json.loads(result.stdout)
        self.warnings.extend('公式待校（'+self.math[i]['origin']+'）：'+clean(x['error'])[:100] for i,x in enumerate(rendered) if x.get('error'))
        for page in self.out.rglob('*.html'):
            body = page.read_text()
            body = re.sub(r'MIDTERMSMATH(\d+)PLACEHOLDER', lambda m:rendered[int(m[1])]['html'], body)
            page.write_text(body, encoding='utf-8')
        return {'total':len(self.math), 'errors':sum(bool(x.get('error')) for x in rendered)}


def frame(title, body, base, data=None, extra=''):
    payload = '<script id="midterms-data" type="application/json">'+dumps(data).replace('<','\\u003c').replace('&','\\u0026')+'</script>' if data is not None else ''
    return f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{html.escape(title)} · 数学难度研究室</title><link rel="stylesheet" href="{base}assets/katex/katex.min.css"><link rel="stylesheet" href="{base}assets/midterms.css"><script defer src="{base}assets/midterms.js"></script></head><body>{payload}<header class="site-nav"><a class="brand" href="/">∑ <span>数学难度研究室</span></a><nav><a href="/midterms">期中考情</a><a href="/workbench">试卷处理台</a><form action="/api/logout" method="post"><button>退出登录</button></form></nav></header>{body}<footer>六校期中 · 原题与证据相连<span>结构规则分 ≠ 学生失分率</span></footer>{extra}</body></html>'''


def esc(value):
    return html.escape(str(value if value is not None else ''), quote=True)


def table_for_path(values):
    return '<div class="table-scroll"><table><thead><tr><th>步骤</th><th>s</th><th>重复 r</th><th>深度 d</th><th>有效负荷 e</th></tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+esc(step.get(k))+'</td>' for k in ['id','s','r','d','e'])+'</tr>' for step in values)+'</tbody></table></div>'


def risk_prose(evidence):
    values = evidence.get('T_evidence', [])
    if isinstance(values, list):
        return '\n\n'.join(f'**t{v.get("item", i+1)} = {v.get("value", "—")}**：{v.get("evidence", "")}'
                            if isinstance(v, dict) else str(v) for i,v in enumerate(values))
    if isinstance(values, dict):
        return '\n\n'.join(f'**{k}**：{v}' for k,v in values.items())
    return str(values)


def reader_exploration(paper, renderer=None):
    units=paper['units'];valid=[q for q in units if q['computed']]
    render=lambda text:renderer.render(text,paper['_directory']) if renderer else '<p>'+esc(text)+'</p>'
    modules=sorted(set(q['module'] for q in units))
    methods=sorted(set(m for q in units for m in q['methods']))
    fmt=lambda n:'—' if n is None else f'{n:.1f}'
    rows=[]
    for m in modules:
        allq=[q for q in units if q['module']==m];vq=[q for q in allq if q['computed']]
        average=lambda k:sum(q['computed'][k] for q in vq)/len(vq) if vq else None
        peak=max(vq,key=lambda q:q['computed']['D']) if vq else None
        known_b=[q for q in vq if number(q['computed'].get('B'))]
        peak_link=f'<a href="#unit-{units.index(peak)+1}" data-reader-point="{units.index(peak)+1}">{esc(peak["id"])} ↗</a>' if peak else '待核'
        rows.append('<tr><th scope="row"><button class="reader-module-pick" data-reader-module="'+esc(m)+'">'+esc(m)+'</button></th>'
            +f'<td>{len(allq)} / {len(vq)}</td><td>{fmt(average("D"))} / {fmt(peak["computed"]["D"] if peak else None)}</td>'
            +f'<td>{fmt(average("C"))} / {fmt(average("T"))}</td><td>{sum(q["computed"]["B"]>=2 for q in known_b)} / {len(known_b)}</td><td>{peak_link}</td></tr>')
    html='<section id="paper-explore" class="reader-panel reader-section"><p class="eyebrow">INVESTIGATE / 从分布追问原因</p><h2>题量、难点与思维负担</h2><p class="caption">先比较模块题量与难点位置，再用 C / T 区分连续推进和搜索风险；选择小问查看真实步骤与证据。</p><div class="table-scroll"><table id="reader-module-matrix"><thead><tr><th>主模块 · 点选筛选</th><th>全部 / 已定分问</th><th>平均 D / 最高 D</th><th>平均 C / T</th><th>B≥2 / B已知</th><th>D最高小问</th></tr></thead><tbody>'+''.join(rows)+'</tbody></table></div><p class="caption">模块矩阵是全卷统计；均值只含已定分小问。小样本模块同时查看题数与具体题目，B不加入D。</p>'
    if valid:
        cmax=max(valid,key=lambda q:q['computed']['C']);tmax=max(valid,key=lambda q:q['computed']['T'])
        if cmax['id']==tmax['id']:
            facts=[('连续推进与风险的共同高点',cmax,f'C={cmax["computed"]["C"]} · T={cmax["computed"]["T"]}')]
        else:facts=[('连续推进负担最高',cmax,f'C={cmax["computed"]["C"]}'),('搜索与遗漏风险最高',tmax,f'T={tmax["computed"]["T"]}')]
        html+='<div class="reader-comparison-picks">'+''.join(f'<a href="#unit-{units.index(q)+1}" data-reader-point="{units.index(q)+1}"><small>{esc(label)}</small><b>{esc(q["id"])}</b><span>{esc(value)}</span></a>' for label,q,value in facts)+'</div>'
    html+='<div class="reader-explore-controls"><label>主模块<select id="reader-explore-module"><option value="">全部模块</option>'+''.join(f'<option>{esc(m)}</option>' for m in modules)+'</select></label><label>方法<select id="reader-explore-method"><option value="">全部方法</option>'+''.join(f'<option>{esc(m)}</option>' for m in methods)+'</select></label><label>难度<select id="reader-explore-band"><option value="">全部（含待核）</option><option value="0">基础 D＜35</option><option value="1">中档 35≤D＜65</option><option value="2">难题 D≥65</option><option value="pending">待核 / 未评分</option></select></label><button id="reader-explore-reset">重置</button></div><p class="caption" id="reader-explore-summary" aria-live="polite">筛选仅作用于下方散点与证据卡，正文与全卷统计完整保留。</p>'
    W,H,L,R,T,B=520,320,46,18,18,48
    x=lambda v:L+(W-L-R)*v/100
    y=lambda v:H-B-(H-T-B)*v/100
    svg=''.join(f'<line x1="{x(v)}" y1="{T}" x2="{x(v)}" y2="{H-B}" class="grid-line"/><line x1="{L}" y1="{y(v)}" x2="{W-R}" y2="{y(v)}" class="grid-line"/><text x="{x(v)}" y="{H-B+17}" text-anchor="middle">{v}</text><text x="{L-8}" y="{y(v)+4}" text-anchor="end">{v}</text>' for v in [0,25,50,75,100])
    svg+=f'<text x="{(L+W-R)/2}" y="{H-8}" text-anchor="middle">C · 正确路线的连续推进负担</text><text x="12" y="{(T+H-B)/2}" transform="rotate(-90 12 {(T+H-B)/2})" text-anchor="middle">T · 搜索、遗漏与返工风险</text>'
    for i,q in enumerate(units):
        if not q['computed']:continue
        c=q['computed'];r=4+(c['B'] or 0)*1.4;color=['#829c79','#bd9e66','#ae6144'][0 if c['D']<35 else 1 if c['D']<65 else 2]
        svg+=f'<a href="#unit-{i+1}" data-reader-point="{i+1}" class="reader-risk-point" aria-label="{esc(q["id"])}，C {c["C"]}，T {c["T"]}，D {c["D"]}"><circle cx="{x(c["C"])}" cy="{y(c["T"])}" r="{r}" fill="{color}" fill-opacity=".8" stroke="white" stroke-width="1.3"/><title>{esc(q["id"])} · C={c["C"]} / T={c["T"]} / D={c["D"]} / B={c["B"]}</title></a>'
    html+='<div class="reader-explore-grid"><div><svg class="reader-risk-chart" viewBox="0 0 520 320" role="img" aria-label="连续推进负担与搜索风险散点图">'+svg+'</svg><p class="caption">颜色：基础 / 中档 / 难题；圆越大，关键突破B越高。待核不绘点。重合点可用右侧小问选择器逐个查看。</p></div><div id="reader-diagnosis"><label class="reader-diagnosis-pick">查看小问<select id="reader-diagnosis-pick"></select></label><p id="reader-explore-empty" class="empty" hidden>当前组合没有匹配小问，请调整或重置筛选。</p>'
    default=max(valid,key=lambda q:(q['computed']['D'],q['computed']['T'])) if valid else units[0] if units else None
    payload=[]
    for i,q in enumerate(units):
        payload.append(dict(index=i+1,id=q['id'],module=q['module'],methods=q['methods'],computed=q['computed']))
        c=q['computed'];e=q['evidence']
        html+=f'<article data-reader-diagnosis="{i+1}"'+(' hidden' if q is not default else '')+f'><h3>{esc(q["id"])} <small>{esc(q["module"])}</small></h3>'
        if c:
            html+='<div class="score-strip">'+''.join(f'<span>{k}<b>{esc(c.get(k))}</b></span>' for k in ['H','C','T','D','B'])+'</div><h4>入口与关键突破</h4><div class="prose">'+render(str(e.get('B_evidence') or '关键突破证据待补。'))+'</div>'
            scores=[s for s in (q['calculation'].get('step_scores') or []) if number(s.get('s'))]
            if scores:
                step=max(scores,key=lambda s:s['s']);evidence_step=next((s for s in e.get('steps',[]) if s['id']==step['id']),None)
                if evidence_step:html+='<h4>峰值步骤 '+esc(step['id'])+'</h4><div class="prose">'+render(str(evidence_step.get('action',''))+'\n\n**得到**：'+str(evidence_step.get('output','')))+'</div>'
            html+='<details><summary>T 五项风险依据</summary><div class="prose">'+render(risk_prose(e))+'</div></details>'
        else:html+='<p class="notice">待核 / 未评分：'+esc(q['issue'] or '没有可用评分。')+'</p>'
        html+=f'<a class="download" href="#unit-{i+1}">进入完整题目与解析 ↗</a></article>'
    html+='</div></div><div class="reader-compare-toolbar"><button id="reader-compare-toggle">固定当前题为对照</button><span id="reader-compare-note" class="caption">固定一题，再选另一题，并看步骤与风险依据。</span></div><section id="reader-pair" hidden><h3>两题并看 · 从分数回到解题动作</h3><div id="reader-pair-cards"></div></section><script id="reader-explore-data" type="application/json">'+dumps(payload).replace('<','\\u003c').replace('&','\\u0026')+'</script></section>'
    return html


def reader_visuals(paper, renderer=None):
    """Render the audited paper statistics and real question anchors without OCR."""
    units=paper['units'];valid=[q for q in units if q['computed']]
    colors=['#254d43','#b45b35','#7384a6','#b69a54','#857482','#57818a']
    modules=sorted(set(q['module'] for q in units),key=lambda m:(-sum(q['module']==m for q in units),m))
    link=lambda q:f'<a href="#unit-{units.index(q)+1}" class="unit-chip">{esc(q["id"])}</a>'
    module_rows=[]
    for i,m in enumerate(modules):
        matches=[q for q in units if q['module']==m]
        module_rows.append(f'<div class="reader-module-row"><strong>{esc(m)}</strong><div class="reader-module-track"><i style="width:{100*len(matches)/len(units):.3f}%;background:{colors[i%len(colors)]}"></i></div><span>{len(matches)}/{len(units)} 问</span><div class="reader-module-links">'+''.join(map(link,matches))+'</div></div>')
    st=paper['statistics'];mean=st['mean_D'];bands=st['bands']
    big=len(set(q.get('n') if q.get('n') is not None else q['id'] for q in units))
    summary='<section id="paper-overview" class="reader-dashboard"><p class="eyebrow">PAPER PORTRAIT / 全卷画像</p><h2>先看这一卷的落点</h2><div class="reader-kpis">'+''.join(
        f'<div><b>{value}</b><span>{label}</span></div>' for value,label in [
            (f'{big}<small> / {len(units)}</small>','大题 / 分析小问'),
            (f'{len(valid)}<small> / {len(units)}</small>','有效评分 / 全部小问'),
            (f'{mean:.1f}' if mean is not None else '—','小问等权 D'),
            (str(len(modules)),'唯一主模块')])+'</div>'
    summary+='<p class="caption">模块与考点按全部已整理小问统计，待核仍列入内容分布；难度只统计已定分小问。未知配分不均摊。</p>'
    summary+='<div class="reader-visual-grid"><article class="reader-panel"><h3>考查内容分布</h3>'+(''.join(module_rows) or '<p class="empty">小问内容待整理。</p>')+'</article>'
    distribution=''.join(f'<span class="band-{i}" style="width:{100*n/len(valid):.3f}%" title="{["基础","中档","难题"][i]} {n}问">{n if n else ""}</span>' for i,n in enumerate(bands)) if valid else ''
    summary+='<article class="reader-panel"><h3>难度构成</h3><div class="stack" id="reader-difficulty">'+distribution+'</div><ul class="reader-band-legend">'+''.join(f'<li><i class="band-{i}"></i>{["基础 D＜35","中档 35≤D＜65","难题 D≥65"][i]}<b>{n}问</b></li>' for i,n in enumerate(bands))+'</ul><p class="caption">分母 '+str(len(valid))+' 个有效小问；待核 / 未评分 '+str(len(units)-len(valid))+' 问。</p><h3>H / C / T 画像</h3>'
    for k,label in [('H','最难单步'),('C','关键路径负担'),('T','搜索与遗漏风险')]:
        value=sum(q['computed'][k] for q in valid)/len(valid) if valid else None
        summary+=f'<div class="reader-hct"><span>{k} · {label}</span><div class="reader-module-track"><i style="width:{value or 0:.3f}%"></i></div><b>{f"{value:.1f}" if value is not None else "—"}</b></div>'
    summary+='</article></div></section>'
    # Each SVG mark links to a real article; pending is a cross, never a zero bar.
    W,H,L,R,T,B=900,215,36,12,16,65
    x=lambda i:L+(W-L-R)*(i+.5)/max(len(units),1)
    y=lambda v:H-B-(H-T-B)*v/100
    barwidth=min(25,(W-L-R)/max(len(units),1)*.65)
    svg=''.join(f'<line x1="{L}" y1="{y(v)}" x2="{W-R}" y2="{y(v)}" class="grid-line"/><text x="{L-8}" y="{y(v)+4}" text-anchor="end">{v}</text>' for v in [0,35,65,100])
    for i,q in enumerate(units):
        d=q['computed']['D'] if q['computed'] else None
        mark=(f'<rect x="{x(i)-barwidth/2}" y="{y(d)}" width="{barwidth}" height="{y(0)-y(d)}" fill="{["#829c79","#bd9e66","#ae6144"][0 if d<35 else 1 if d<65 else 2]}"/>' if d is not None else f'<text x="{x(i)}" y="{y(0)-6}" text-anchor="middle" class="pending-dot">×</text>')
        svg+=f'<a href="#unit-{i+1}" aria-label="{esc(q["id"])}，'+(f'D {d}' if d is not None else '待核，尚未定分')+f'"><title>{esc(q["id"])} · {esc(q["module"])} · '+(f'D={d}' if d is not None else '待核')+f'</title>{mark}<text transform="translate({x(i)},{H-B+15}) rotate(45)" text-anchor="start">{esc(q["id"])}</text></a>'
    summary+='<section id="paper-burden" class="reader-panel reader-section"><div class="section-title"><h2>沿题序看难度</h2><span>点击柱或题号，直达原题</span></div><div class="reader-sequence"><svg viewBox="0 0 900 215" role="img" aria-label="本卷逐小问结构难度">'+svg+'</svg></div><p class="caption">按原卷小问顺序；× 为待核 / 未评分。D 为结构规则分，不对应失分率或作答时间。</p></section>'
    knowledge='<section id="paper-knowledge" class="reader-panel reader-section"><div class="section-title"><h2>考点总览</h2><span>同问去重 · 点击题号定位</span></div><div class="reader-knowledge-tools"><div class="tag-tabs" role="group" aria-label="本卷标签层级"><button data-reader-tag="topics" aria-pressed="true">知识点</button><button data-reader-tag="methods" aria-pressed="false">解题方法</button></div><label>查找 <input type="search" id="reader-tag-search" placeholder="输入考点或方法" aria-label="查找本卷考点或方法"></label></div>'
    for field in ['topics','methods']:
        labels=sorted(set(label for q in units for label in q[field]),key=lambda v:(-sum(v in q[field] for q in units),v))
        knowledge+=f'<div data-reader-table="{field}"'+(' hidden' if field!='topics' else '')+'><div class="table-scroll"><table><thead><tr><th>考点 / 方法</th><th>涉及小问 / 全部</th><th>其中已定分 / 未定分</th><th>原题导航</th></tr></thead><tbody>'
        for label in labels:
            matches=[q for q in units if label in q[field]];scored=sum(q['computed'] is not None for q in matches)
            knowledge+=f'<tr data-reader-label="{esc(label)}"><th scope="row">{esc(label)}</th><td>{len(matches)}/{len(units)}<small>{100*len(matches)/len(units):.1f}%</small></td><td>{scored} / {len(matches)-scored}</td><td class="reader-tag-links">'+''.join(map(link,matches))+'</td></tr>'
        knowledge+='</tbody></table></div><p class="reader-no-tags empty" hidden>没有匹配的标签。</p></div>'
    knowledge+='<p class="caption">多标签可以重叠，各行比例不能相加为100%。原标签按字面统计，不自动合并近义标签。本表检索仅筛选标签行，全卷画像保持全卷口径。</p></section>'
    sections=[('paper-overview','全卷画像'),('paper-burden','题序难度'),('paper-knowledge','考点总览'),('paper-explore','负担探索'),('paper-questions','逐题阅读')]
    if paper['has_report']:sections.append(('teacher-report','教师分析'))
    sections += [('transcript','完整转录'),('sources','来源核验')]
    outline='<aside class="reader-sidebar"><details id="reader-outline" open><summary>本卷大纲 <span>目录与题目跳转</span></summary><nav aria-label="本卷阅读大纲"><div class="reader-section-links">'+''.join(f'<a href="#{key}">{label}</a>' for key,label in sections)+'</div><label class="reader-outline-search">定位题目<input type="search" id="reader-outline-search" placeholder="题号、模块或考点" aria-label="在大纲中查找题目"></label><div class="reader-outline-questions">'
    for i,q in enumerate(units):
        query=' '.join([q['id'],q['module'],*q['topics'],*q['methods']])
        outline+=f'<a href="#unit-{i+1}" data-outline-query="{esc(query)}"><span>{esc(q["id"])}</span><small>{esc(q["module"])}</small><b>'+('D '+str(q['computed']['D']) if q['computed'] else '待核')+'</b></a>'
    outline+='</div><p id="reader-outline-empty" class="caption" hidden>没有匹配题目。</p></nav></details></aside>'
    return summary+knowledge+reader_exploration(paper,renderer),outline


def make_reader(paper, renderer, out, base):
    ident, directory = paper['id'], paper['_directory']
    rendered_units = []
    toc = []
    for i,q in enumerate(paper['units']):
        anchor = 'unit-'+str(i+1)
        q['url'] = base+'papers/'+ident+'/index.html#'+anchor
        title = q['id']
        toc.append(f'<a href="#{anchor}" class="{"scored" if q["computed"] else "pending"}">{esc(title)}</a>')
        content = renderer.render(q['question'] or '本小问题干尚待整理；请查看下方完整转录。', directory)
        for path in q['figure_paths']:
            # Embedded figures are already rendered above; avoid duplicate images.
            if str(path) not in q['question']:
                url = renderer.asset(path)
                content += f'<figure><img loading="lazy" src="{esc(url)}" alt="{esc(title)} 题图"></figure>' if url else '<p class="notice">题图待补齐</p>'
        score = q['computed']
        score_html = '<span class="status pending">尚未定分</span>'
        if score:
            score_html = '<div class="score-strip">'+''.join(f'<span>{k}<b>{score[k]:.1f}</b></span>' for k in ['H','C','T','D'])+f'<span>B<b>{score["B"] if score["B"] is not None else "—"}</b></span><span>必做分支<b>{esc(score["branches"] if score["branches"] is not None else "—")}</b></span></div>'
        details = ''
        evidence = q['evidence']
        if evidence:
            steps = ''.join('<tr><td>'+esc(s.get('id'))+'<small>前提 '+esc(', '.join(s.get('dependencies', [])) or '题干条件')+'</small></td><td>'+renderer.render(s.get('action', ''), directory)+'</td><td>'+renderer.render(s.get('output',''), directory)+'</td><td>'+esc(' · '.join(f'{k}={v}' for k,v in s.get('dimensions', {}).items()))+'</td><td>'+renderer.render('\n\n'.join(f'**{k}**：{v}' for k,v in s.get('dimension_evidence', {}).items()),directory)+'</td></tr>' for s in evidence.get('steps', []))
            path = ''
            # Preserve only audited calculation evidence, never raw input paths.
            path_values = q.get('calculation', {}).get('path', [])
            if path_values:
                path = '<p>关键路径：'+esc(' → '.join(str(s.get('id')) for s in path_values))+'</p>'+table_for_path(path_values)
            details = '<details class="evidence"><summary>查看逐步评分依据</summary><div class="prose">'+renderer.render(evidence.get('solution_basis',''),directory)+'</div><div class="table-scroll"><table><thead><tr><th>步骤 / 依赖</th><th>数学动作</th><th>结论</th><th>六维 0—2</th><th>六维依据</th></tr></thead><tbody>'+steps+'</tbody></table></div>'+path+'<div class="prose">'+renderer.render('**T 五项评分**\n\n'+dumps(evidence.get('t', []))+'\n\n**T 风险依据**\n\n'+risk_prose(evidence)+'\n\n**B 入口依据**\n\n'+str(evidence.get('B_evidence','')),directory)+'</div></details>'
        labels = ' · '.join([q['kind'],q['module']]+q['methods'])
        rendered_units.append(f'<article class="question-block" id="{anchor}"><div class="question-head"><h2>{esc(title)}</h2><span>{esc(labels)}</span><span>{q["points"] if q["points"] is not None else "配分待核"}{" 分" if q["points"] is not None else ""}</span></div>{score_html}<div class="prose question-stem">{content}</div>'+(' <p class="notice">'+esc(q['issue'])+'</p>' if q['issue'] else '')+'<details class="solution"><summary>答案与完整解析</summary><div class="prose">'+renderer.render(('**答案**\n\n'+q['answer']+'\n\n' if q['answer'] else '')+(q['solution'] or '本小问解析尚待整理；已有原解析见下方完整转录。'),directory)+'</div></details>'+details+'</article>')
    transcript = renderer.render(paper['_markdown'].read_text(encoding='utf-8-sig'), directory) if paper['has_transcript'] else '<p class="notice">完整转录尚未收录。</p>'
    report = '<section class="paper-report" id="teacher-report"><h2>教师阅读报告</h2><div class="prose">'+renderer.render(paper['_report'].read_text(encoding='utf-8-sig'),directory)+'</div></section>' if paper['has_report'] else ''
    stat = paper['statistics']
    conflict_note = ('<p class="notice">来源学年冲突：文件名标为 '+esc(paper['school_year'])+'，卷首标为 '+esc(paper['source_school_year'])+'；作为参考材料保留，不计入该学年主比较。</p>') if paper['year_conflict'] else ''
    visuals,outline=reader_visuals(paper,renderer)
    body=(f'<main class="reader reader-with-overview"><a class="back" href="{base}index.html">← 回到考情比较</a>'
          f'<header class="reader-heading"><p class="eyebrow">{esc(paper["school_year"])} · 高二上期中</p>'
          f'<h1>{esc(paper["school"])}</h1><p>{esc(paper["status"])} · {stat["valid"]}/{stat["total"]} 个已整理小问有评分</p>'
          f'<a class="download" href="{base}papers/{ident}/units.csv">下载逐小问 CSV ↓</a></header>'
          +conflict_note+'<p class="notice">D 为 HCT-rules-v1.1 结构规则分；未定分小问保留为空。分值不明时不推算权重。</p>'
          +'<div class="reader-layout">'+outline+'<div class="reader-content">'+visuals
          +'<section id="paper-questions" class="reader-section"><div class="section-title"><h2>逐题阅读</h2><span>完整题干、题图与核验依据</span></div>'
          +'<nav class="question-nav" aria-label="小问导航">'+''.join(toc)+'</nav>'+''.join(rendered_units)+'</section>'
          +report+'<details class="full-transcript" id="transcript"'+(' open' if not paper['units'] else '')
          +'><summary>完整转录 · 原题与原解析</summary><div class="prose">'+transcript+'</div></details>'
          +'<section id="sources" class="source-note"><h2>来源与核验</h2><p>'
          +esc('；'.join(paper['source_names']) or paper['title'])
          +'</p><p>完整转录保留原文及待核标记。只有经核验且有正式评分依据的小问计入难度统计。</p></section></div></div></main>')
    dest = out/'papers'/ident
    dest.mkdir(parents=True, exist_ok=True)
    if paper.get('_demo'):
        body = body.replace('<main class="reader reader-with-overview">', '<main class="reader reader-with-overview"><p class="notice" role="note">原创演示数据；不代表真实学校试卷或学生表现。</p>')
    (dest/'index.html').write_text(frame(paper['title'],body,base,extra=f'<script defer src="{base}assets/reader.js"></script>'),encoding='utf-8')
    stream = io.StringIO(newline='')
    fields = ['paper_id','school','school_year','id','kind','points','module','topics','methods','atoms','verification_status','issue','H','C','T','D','B','branches']
    writer = csv.DictWriter(stream, fieldnames=fields)
    writer.writeheader()
    for q in paper['units']:
        row = {**q,**(q['computed'] or {}),'paper_id':ident,'school':paper['school'],'school_year':paper['school_year']}
        for field in ['topics','methods','atoms']:
            row[field] = '；'.join(q[field])
        # Excel should treat source prose as text, never as a formula.
        writer.writerow({k:("'"+str(row[k]) if isinstance(row.get(k),str) and row[k].startswith(('=','+','-','@','\t','\r')) else row.get(k,'')) for k in fields})
    (dest/'units.csv').write_text('\ufeff'+stream.getvalue(),encoding='utf-8')


def curriculum_statistics(papers, schools=None):
    """Observed exam coverage, not an inferred classroom calendar or forecast."""
    school_names = dict(schools or SCHOOLS)
    slots = [(key, year, '中心校纵向') for key in ['jianping', 'gezhi'] for year in YEARS]
    slots += [(key, YEARS[-1], '同年横向') for key in ['jincai', 'huaer', 'datong', 'xiangming']]
    targets, progress, frequency = [], [], []
    def eligible(key, year):
        return next((p for p in papers if p['school_key'] == key and p['school_year'] == year
                     and p.get('comparison_eligible') is not False and not p.get('year_conflict')), None)
    for key, year, role in slots:
        p = eligible(key, year)
        targets.append(dict(paper_id=key+'-'+year, school=school_names[key], school_year=year,
                            role=role, available=p is not None, url=p['url'] if p else None,
                            units=len(p['units']) if p else None,
                            valid=sum(q['computed'] is not None for q in p['units']) if p else None))
    for key in ['jianping', 'gezhi']:
        seq = [eligible(key, year) for year in YEARS]
        available = sum(p is not None for p in seq)
        for year, p in zip(YEARS, seq):
            units = p['units'] if p else []
            modules = sorted(set(q['module'] for q in units))
            progress.append(dict(school_key=key, school=school_names[key], school_year=year,
                available=p is not None, total=len(units) if p else None,
                valid=sum(q['computed'] is not None for q in units) if p else None,
                scope=p.get('exam_scope', '') if p else '',
                classroom_schedule=None,
                modules=[dict(label=m, count=sum(q['module'] == m for q in units)) for m in modules],
                url=p['url'] if p else None))
        for field, kind in [('module', '主模块'), ('topics', '原考点标签')]:
            labels = sorted(set(label for p in seq if p for q in p['units']
                                for label in ([q[field]] if field == 'module' else q[field])))
            for label in labels:
                years = []
                for year, p in zip(YEARS, seq):
                    matches = [] if not p else [q for q in p['units'] if
                        (q['module'] == label if field == 'module' else label in q['topics'])]
                    years.append(dict(school_year=year,
                        count=sum(q['computed'] is not None for q in matches) if p else None,
                        pending=sum(q['computed'] is None for q in matches) if p else None,
                        denominator=sum(q['computed'] is not None for q in p['units']) if p else None,
                        questions=[dict(id=q['id'],url=q['url'],pending=q['computed'] is None) for q in matches]))
                frequency.append(dict(school_key=key,school=school_names[key],kind=kind,label=label,
                    observed_years=sum(y['count'] is not None and y['count'] > 0 for y in years),
                    available_years=available,expected_years=len(YEARS),years=years))
    frequency.sort(key=lambda r:(r['school_key'],r['kind'],-r['observed_years'],
                                 -sum(y['count'] or 0 for y in r['years']),r['label']))
    return dict(targets=targets,progress=progress,frequency=frequency)


def make_overview(papers, renderer, source, out, base):
    summaries = []
    for paper in papers:
        summary = {k:v for k,v in paper.items() if not k.startswith('_') and k!='units'}
        summary['url'] = base+'papers/'+paper['id']+'/index.html'
        summary['units'] = [{k:v for k,v in q.items() if k not in ['question','answer','solution','figure_paths','evidence','calculation']}
                            | {'steps': [{'id':s.get('id'),'action':clean(s.get('action')),'output':clean(s.get('output')),
                                          'dimensions':s.get('dimensions') or {}} for s in q.get('evidence',{}).get('steps',[])],
                               'solution_basis': clean(q.get('evidence',{}).get('solution_basis','')),
                               'T_evidence': q.get('evidence',{}).get('T_evidence'),
                               'B_evidence': clean(q.get('evidence',{}).get('B_evidence','')),
                               'peak': (q.get('computed') or {}).get('peak'),
                               'E': (q.get('computed') or {}).get('E')} for q in paper['units']]
        summaries.append(summary)
    inventory = load_json(source/'inventory.json', {})
    labels = inventory.get('school_labels') or {}
    if not isinstance(labels, dict) or set(labels)-set(dict(SCHOOLS)) or any(not isinstance(v,str) or not v.strip() for v in labels.values()):
        raise ValueError('school_labels must map known school keys to non-empty labels')
    schools = [(key, clean(labels.get(key, name))) for key, name in SCHOOLS]
    curriculum = curriculum_statistics(summaries, schools)
    report = source/'跨卷分析.md'
    report_html = renderer.render(report.read_text(encoding='utf-8-sig'),source) if report.exists() else '<p class="empty">教研结论将随已核验题目逐步补齐。先从覆盖情况与具体题目查证。</p>'
    narrative = source/'四章叙事.md'
    acts = ['']*4
    if narrative.exists():
        chunks = [c for c in re.split(r'(?=<h2>)', renderer.render(narrative.read_text(encoding='utf-8-sig'),source)) if c.lstrip().startswith('<h2>')]
        for i,chunk in enumerate(chunks[:4]):
            acts[i] = re.sub(r'<h2>.*?</h2>','',chunk,count=1,flags=re.S).strip()
    body = '''<main class="overview"><section class="masthead"><div><p class="eyebrow">MIDTERM ATLAS / 高二上期中</p><h1>同一学段，<br><em>六校的不同落点。</em></h1><p class="lead">以建平、格致为中心，横看同年三校，纵看三年变化。<br>每一个判断，都可以回到原题。</p></div><aside class="atlas-seal"><span>2023 — 2026</span><strong>6 × 3</strong><p>六所学校 · 三个学年</p><small id="coverage-summary">正在读取覆盖情况</small></aside></section>
<section class="coverage-section"><div class="section-title"><h2>先看材料覆盖</h2><span>点选已有试卷，进入完整阅读</span></div><div id="target-coverage"></div><div id="coverage-matrix" class="table-scroll"></div><p class="caption">“未提供”保留空格；已收录、转录待校与已评分分别标记。题目与答案版本合并为同一套卷。</p></section>
<section class="act" id="act-0"><div class="section-title"><h2>数据背后的答案 · AI 如何读懂一场考试</h2><span>先说明分数是怎么来的，再看分数</span></div><div class="prose act-prose">''' + acts[0] + '''</div><div id="pipeline"></div><div id="anatomy"></div></section>
<section class="act" id="act-1"><div class="section-title"><h2>单点分析 · 一张试卷的“微雕”</h2><span>把一卷拆到每一个小问</span></div><div class="prose act-prose">''' + acts[1] + '''</div><div class="filter-line"><label>中心卷 <select id="microscope-paper"></select></label><span id="microscope-note" aria-live="polite"></span></div><div id="microscope-chart"></div><div id="microscope-table" class="table-scroll"></div></section>
<section class="act" id="act-2"><div class="section-title"><h2>综合分析 · 一场考试的“对齐”</h2><span>同年三校，考的是不是同一件事</span></div><div class="prose act-prose">''' + acts[2] + '''</div><div class="view-tabs" role="group" aria-label="横向组别"><button data-align="jianping" aria-pressed="true">建平组 · 建平 / 进才 / 华二</button><button data-align="gezhi" aria-pressed="false">格致组 · 格致 / 大同 / 向明</button></div><div id="alignment-chart"></div><div id="alignment-table" class="table-scroll"></div><p class="caption">对齐度只看主模块、方法与考点的重合，不表示谁更难。缺卷保留空缺，不用其他学年替代。</p></section>
<section class="act" id="act-3"><div class="section-title"><h2>趋势分析 · 一次命题的“预测”</h2><span>两个中心校的三年轨迹</span></div><div class="prose act-prose">''' + acts[3] + '''</div><div id="trend-chart"></div><div id="trend-table" class="table-scroll"></div><p class="caption">三年只是所提供三份卷之间的变化描述，不含学校整体命题水平的长期外推。</p>
<div class="section-title"><h3>教学进度 · 卷面覆盖的内容</h3><span>两个中心校，逐年对照</span></div><p class="caption">这里用试卷出现的知识模块描述期中考查范围；不能据此确认课堂先后顺序、授课周次或未考内容是否已教。实际教学日历尚未提供。</p><div id="curriculum-progress" class="table-scroll"></div>
<div class="section-title"><h3>三年考频 · 从知识点回到原题</h3></div><div class="filter-line"><label>中心校 <select id="frequency-school"><option value="jianping">建平</option><option value="gezhi">格致</option></select></label><label>统计层级 <select id="frequency-kind"><option>主模块</option><option>原考点标签</option></select></label><label>查找 <input id="frequency-search" type="search" placeholder="输入知识点" aria-label="查找考频知识点"></label><span id="frequency-summary" aria-live="polite"></span></div><div id="curriculum-frequency" class="table-scroll"></div><p class="caption">出现学年数 / 已提供且学年可配对卷数，与小问数分开。仅计已核验评分小问；待核标签单列。同一小问的同名标签只计一次，多个标签可以重叠。原考点标签按原文精确匹配，近义标签未自动合并，跨年优先比较主模块。三年考频不等于下一年出现概率。该表独立于下方工作台筛选。</p><p class="download"><a href="''' + base + '''targets.csv">目标10卷覆盖 CSV ↓</a> · <a href="''' + base + '''progress.csv">教学内容范围 CSV ↓</a> · <a href="''' + base + '''frequency.csv">完整三年考频 CSV ↓</a></p></section>
<section class="compare-section"><div class="section-title"><h2>完整图表工作台</h2><span>横向固定 2025—2026 · 纵向固定中心学校</span></div><div class="view-tabs" role="group" aria-label="比较视角"><button data-view="jianping-horizontal" aria-pressed="true">建平组 · 横向三校</button><button data-view="gezhi-horizontal" aria-pressed="false">格致组 · 横向三校</button><button data-view="jianping-vertical" aria-pressed="false">建平 · 纵向三年</button><button data-view="gezhi-vertical" aria-pressed="false">格致 · 纵向三年</button><button data-view="all" aria-pressed="false">全部已收录</button></div><p id="selection-note" class="notice" aria-live="polite"></p><p id="scope-note" class="caption"></p><p class="download"><a href="''' + base + '''summary.csv">下载全部逐卷统计 CSV ↓</a> · <a href="''' + base + '''units.csv">下载全部小问评分 CSV ↓</a></p><div id="paper-cards" class="paper-cards"></div><div class="filter-line"><label>主模块 <select id="module-filter"><option value="">全部模块</option></select></label><label>筛选方法 <select id="method-filter"><option value="">全部方法</option></select></label><button id="clear-filters">清除筛选</button><span id="filter-status" aria-live="polite"></span></div></section>
<section class="chart-grid"><article class="chart-panel wide"><div class="section-title"><h2>模块落点</h2><select id="module-metric" aria-label="模块统计口径"><option value="count">小问数量占比</option><option value="points">已知配分占比</option></select></div><div id="module-heatmap" class="table-scroll"></div><p class="caption">分值仅按唯一主模块累计；未分类和缺配分单列。未知配分不均摊。</p></article><article class="chart-panel"><h2>结构难度分布</h2><label>统计口径 <select id="difficulty-metric"><option value="count">有效小问数量比例</option><option value="points">有效已知分值比例</option></select></label><div id="difficulty-chart"></div><p class="caption">基础 D&lt;35，中档 35≤D&lt;65，难题 D≥65；分母仅为有效评分小问，待核另列。</p></article><article class="chart-panel"><h2>H / C / T 画像</h2><div id="hct-chart"></div><p class="caption">有效小问等权均值。H：峰值负荷；C：关键路径连续负担；T：搜索、遗漏与返工风险。</p></article><article class="chart-panel wide"><div class="section-title"><h2>沿题序看负担</h2><select id="sequence-metric" aria-label="题序指标"><option>D</option><option>H</option><option>C</option><option>T</option></select></div><div id="sequence-chart"></div><p class="caption">按原卷小问顺序；空值断点保留。各卷题数不同，不能按同一横坐标认定同一考点。</p></article><article class="chart-panel"><h2>题型结构</h2><div id="kind-chart" class="table-scroll"></div><p class="caption">按分析小问计数，解答题每小问分别计入；不是大题数量。点击题型可回到题目索引。</p></article><article class="chart-panel"><h2>突破门槛构成</h2><div id="b-chart" class="table-scroll"></div><p class="caption">B=0—3，仅统计已定分且B有证据的小问；不加入D。</p></article><article class="chart-panel wide"><h2>方法与关键题素</h2><div class="tag-tabs" role="group" aria-label="标签统计口径"><button data-tag="methods" aria-pressed="true">方法</button><button data-tag="atoms" aria-pressed="false">关键题素</button><button data-tag="topics" aria-pressed="false">核心考点</button></div><div id="method-heatmap" class="table-scroll"></div><p class="caption">同一小问内去重；多标签可重叠。每格显示涉及小问数 / 已整理小问数，不代表分值占比。</p></article><article class="chart-panel wide"><h2>突破门槛与必做分支</h2><div id="breakthrough-table" class="table-scroll"></div><p class="caption">B 独立于 D；必做分支多可能带来单条关键路径 C 未覆盖的工作量。点击题目查看具体依据。</p></article></section>
<section class="question-index"><div class="section-title"><h2>从图表回到题目</h2><span id="question-count"></span></div><div id="question-table" class="table-scroll"></div></section><section class="research"><p class="eyebrow">TEACHER NOTES / 教研阅读</p><h2>差异如何变成备课判断</h2><div class="prose">'''+report_html+'''</div></section><details class="methodology"><summary>统计口径与阅读边界</summary><div class="prose"><p>算法：HCT-rules-v1.1。D 未经学生作答数据校准；一两分差异不作实质难度判断。本页不据此给学校排名或推算学生失分率、完成率。</p><p>小问等权与分值加权分开。只有全部小问配分明确时才显示加权指数；有待核单元时称已分析部分指数。题量、标签与难度图各自显示分母，筛选后同步重算。</p><p>不同考试范围、时长和题型结构会影响比较。当前纵向只描述所提供三卷；缺卷不连线，不外推长期命题趋势。图表均可定位原题，教师结论应以题目和步骤为证据。</p></div></details></main>'''
    for key, old_name in SCHOOLS:
        body = body.replace(old_name, esc(dict(schools)[key]))
    if inventory.get('demo'):
        body = body.replace('<main class="overview">', '<main class="overview"><p class="notice" role="note">原创演示数据：学校、题目、配分与评分输入仅用于体验功能，不代表任何真实学校或考试。</p>')
    data = {'schema_version':1,'algorithm':ALGORITHM,'years':YEARS,'schools':[{'key':k,'name':v} for k,v in schools],'demo':bool(inventory.get('demo')),'groups':GROUPS,'papers':summaries,'curriculum':curriculum}
    (out/'index.html').write_text(frame('六校期中考情',body,base,data),encoding='utf-8')
    (out/'data.json').write_text(dumps(data)+'\n',encoding='utf-8')
    write_csv(out/'targets.csv',['paper_id','school','school_year','role','available','units','valid'],curriculum['targets'])
    write_csv(out/'progress.csv',['school','school_year','available','total','valid','scope','module','count','classroom_schedule'],
              [dict(**{k:p[k] for k in ['school','school_year','available','total','valid','scope','classroom_schedule']},
                    module=m['label'],count=m['count']) for p in curriculum['progress']
               for m in (p['modules'] or [dict(label=None,count=None)])])
    write_csv(out/'frequency.csv',['school','kind','label','school_year','count','pending','denominator','observed_years','available_years','expected_years','question_ids'],
              [dict(**{k:r[k] for k in ['school','kind','label','observed_years','available_years','expected_years']},
                    **{k:y[k] for k in ['school_year','count','pending','denominator']},
                    question_ids='；'.join(q['id']+('〔待核〕' if q['pending'] else '') for q in y['questions']))
               for r in curriculum['frequency'] for y in r['years']])
    write_csv(out/'summary.csv', ['paper_id','school','school_year','total_points','duration_minutes','units','valid','pending','question_coverage','known_points','valid_points','point_coverage','mean_D','weighted_D','basic','middle','hard','exam_scope'],
        [dict(paper_id=p['id'],school=p['school'],school_year=p['school_year'],total_points=p['total_points'],duration_minutes=p['duration'],units=p['statistics']['total'],valid=p['statistics']['valid'],pending=p['statistics']['pending'],question_coverage=p['statistics']['question_coverage'],known_points=p['statistics']['known_points'],valid_points=p['statistics']['valid_points'],point_coverage=p['statistics']['point_coverage'],mean_D=p['statistics']['mean_D'],weighted_D=p['statistics']['weighted_D'],basic=p['statistics']['bands'][0],middle=p['statistics']['bands'][1],hard=p['statistics']['bands'][2],exam_scope=p['exam_scope']) for p in papers])
    fields=['paper_id','school','school_year','id','kind','points','module','verification_status','issue','H','C','T','D','B','branches']
    write_csv(out/'units.csv',fields,[dict(paper_id=p['id'],school=p['school'],school_year=p['school_year'],**{k:q.get(k) for k in ['id','kind','points','module','verification_status','issue']},**(q['computed'] or {})) for p in papers for q in p['units']])


def write_csv(path, fields, rows):
    with path.open('w',encoding='utf-8-sig',newline='') as stream:
        writer=csv.DictWriter(stream,fieldnames=fields,extrasaction='ignore')
        writer.writeheader()
        for row in rows:
            writer.writerow({k:("'"+v if isinstance(v,str) and v.startswith(('=','+','-','@','\t','\r')) else v) for k,v in row.items()})


def input_digest(source):
    """Hash source inputs and local resources; detect concurrent edits before publish."""
    files = [Path(__file__),source/'inventory.json',source/'跨卷分析.md',source/'四章叙事.md']
    files.extend(p for p in UI.rglob('*') if p.is_file())
    files.extend(p for p in (SITE/'public/vendor/katex').rglob('*') if p.is_file())
    # Figures may be referenced from any local subdirectory, including Markdown
    # narratives. A figure-only revision must receive a new immutable release ID.
    files.extend(p for p in source.rglob('*') if p.is_file() and p.suffix.lower() in IMAGE_TYPES)
    for directory in sorted((source/'papers').glob('*')):
        if not directory.is_dir():
            continue
        files.extend(directory/name for name in ['paper.json','analysis-input.json','转录.md','教师报告.md',
                     'delivery/评分明细.json','delivery/步骤类型词典.json'])
        for delivery in directory.glob('delivery-v*'):
            files.extend(delivery/name for name in ['评分明细.json','步骤类型词典.json'])
        files.extend(p for p in (directory/'assets').rglob('*') if p.is_file())
    digest = hashlib.sha256()
    for file in sorted(set(files)):
        if file.is_file():
            name = 'source/'+file.relative_to(source).as_posix() if file.is_relative_to(source) else 'site/'+file.relative_to(SITE).as_posix()
            digest.update(name.encode())
            digest.update(file.read_bytes())
    return digest.hexdigest()


def build(source, target=None, apply=False):
    source = Path(source).resolve()
    katex = SITE/'public/vendor/katex'
    if not all((katex/name).is_file() for name in ['katex.min.js','katex.min.css']) or not (katex/'fonts').is_dir():
        raise ValueError('KaTeX assets missing; run npm run content:init first')
    release_id = input_digest(source)
    inventory = load_json(source/'inventory.json')
    if not isinstance(inventory, dict) or not isinstance(inventory.get('papers'), list):
        raise ValueError('inventory.json papers array required')
    listed = unique(inventory['papers'], lambda p:p.get('id'), 'inventory')
    for file in sorted((source/'papers').glob('*/paper.json')):
        paper = load_json(file)
        if paper['id'] != file.parent.name:
            raise ValueError('paper directory/id mismatch')
        listed[paper['id']] = paper
    identities = set()
    warnings, papers = [], []
    for ident, meta in sorted(listed.items()):
        if not ID.fullmatch(ident) or meta.get('school_key') not in dict(SCHOOLS) or meta.get('school_year') not in YEARS:
            raise ValueError(f'invalid paper identity: {ident}')
        identity = (meta['school_key'],meta['school_year'],meta.get('grade'),meta.get('term'),meta.get('exam'))
        if identity in identities:
            raise ValueError(f'duplicate school/year exam: {ident}')
        identities.add(identity)
        normalized = normalize_paper(meta,source/'papers'/ident,warnings)
        normalized['_demo'] = bool(inventory.get('demo'))
        papers.append(normalized)
    base = '/midterms/releases/'+release_id+'/'
    with tempfile.TemporaryDirectory(prefix='studio-midterms-') as temp:
        out = Path(temp)
        (out/'assets').mkdir()
        for name in ['midterms.css','midterms.js','reader.js']:
            shutil.copyfile(UI/name,out/'assets'/name)
        shutil.copytree(SITE/'public/vendor/katex',out/'assets'/'katex')
        renderer = Renderer(out,base,warnings)
        for paper in papers:
            make_reader(paper,renderer,out,base)
        renderer.paper_links = {'paper:'+p['id']+'#'+q['id']:q['url'] for p in papers for q in p['units']}
        make_overview(papers,renderer,source,out,base)
        formulas = renderer.finish()
        if input_digest(source) != release_id:
            raise ValueError('source changed during rendering; retry import after the current edit completes')
        manifest = {'schema_version':1,'releaseId':release_id,'algorithm':ALGORITHM,
                    'papers':len(papers),'units':sum(p['statistics']['total'] for p in papers),
                    'valid':sum(p['statistics']['valid'] for p in papers), 'formulas':formulas,
                    'artifacts':[]}
        for file in sorted(out.rglob('*')):
            if file.is_file():
                manifest['artifacts'].append({'path':file.relative_to(out).as_posix(), 'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'bytes':file.stat().st_size})
        (out/'manifest.json').write_text(dumps(manifest)+'\n',encoding='utf-8')
        if apply:
            target = Path(target or SITE/'private'/'midterms')
            releases = target/'releases'
            releases.mkdir(parents=True, exist_ok=True)
            destination = releases/release_id
            if destination.exists():
                existing = load_json(destination/'manifest.json')
                if existing != manifest or any(not (destination/a['path']).is_file() or hashlib.sha256((destination/a['path']).read_bytes()).hexdigest()!=a['sha256'] for a in manifest['artifacts']):
                    raise ValueError('existing immutable release differs; refusing overwrite')
            else:
                staging = Path(tempfile.mkdtemp(prefix='.publishing-',dir=releases))
                try:
                    shutil.copytree(out,staging,dirs_exist_ok=True)
                    os.replace(staging,destination)
                finally:
                    if staging.exists():
                        shutil.rmtree(staging)
            pointer = dumps({'schema_version':1,'releaseId':release_id})+'\n'
            fd, tmp = tempfile.mkstemp(prefix='.current-',dir=target)
            with os.fdopen(fd,'w',encoding='utf-8') as stream:
                stream.write(pointer)
            os.replace(tmp,target/'current.json')
    return {**{k:manifest[k] for k in ['releaseId','papers','units','valid','formulas']},
            'mode':'apply' if apply else 'preview','warnings':dict((w,warnings.count(w)) for w in sorted(set(warnings)))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--preview',action='store_true')
    mode.add_argument('--apply',action='store_true')
    parser.add_argument('--target',type=Path,help='private release directory (default private/midterms)')
    args = parser.parse_args()
    try:
        print(json.dumps(build(args.source,args.target,args.apply),ensure_ascii=False,indent=2))
    except (OSError,ValueError,TypeError,KeyError,subprocess.CalledProcessError) as error:
        parser.exit(2,'期中资料导入失败：'+str(error)+'\n')


if __name__ == '__main__':
    main()

/* Private, offline reader interactions. All scored values come from the release. */
(() => {
  'use strict';
  const dataNode = document.getElementById('midterms-data');
  if (!dataNode) return;
  const data = JSON.parse(dataNode.textContent);
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const esc_inline = escape;
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const fmt = (n, digits=1) => finite(n) ? n.toFixed(digits) : '—';
  const pct = (n, d) => d > 0 ? (100*n/d).toFixed(0)+'%' : '—';
  const colors = ['#254d43','#b45b35','#7384a6','#b69a54','#857482','#57818a'];
  const state = {view:'jianping-horizontal',module:'',method:'',tag:'methods',metric:'count',sequence:'D',difficulty:'count',
                 scope:'jianping-2025-2026',anatomy:'',align:'jianping'};
  const DIMENSIONS = [['K','知识'],['R','条件转换'],['A','运算量'],['V','表征'],['P','参数禁值'],['I','交汇']];
  const bandOf = d => d < 35 ? 0 : d < 65 ? 1 : 2;
  const bandName = ['基础','中档','难题'];
  const bandColor = ['#829c79','#bd9e66','#ae6144'];
  const schoolName = key => data.schools.find(s=>s.key===key)?.name || key;
  const empty = text => '<p class="empty">'+escape(text)+'</p>';
  function selected() {
    let ids;
    if (state.view.endsWith('-horizontal')) {
      const key = state.view.split('-')[0];
      ids = data.groups[key].map(s=>s+'-2025-2026');
    } else if (state.view.endsWith('-vertical')) {
      ids = data.years.map(y=>state.view.split('-')[0]+'-'+y);
    } else ids = data.papers.map(p=>p.id);
    return ids.map(id=>data.papers.find(p=>p.id===id)).filter(p=>p && (state.view==='all'||p.comparison_eligible!==false));
  }
  const filtered = paper => paper.units.filter(q=>(!state.module || q.module===state.module) && (!state.method || q.methods.includes(state.method)));
  function table(headers,rows) {
    return '<table><thead><tr>'+headers.map(h=>'<th scope="col">'+h+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map((cell,i)=>'<'+(i?'td':'th scope="row"')+'>'+cell+'</'+(i?'td':'th')+'>').join('')+'</tr>').join('')+'</tbody></table>';
  }
  function localStats(units) {
    const valid = units.filter(q=>q.computed);
    const known = units.filter(q=>finite(q.points));
    const points = known.reduce((n,q)=>n+q.points,0);
    const validPoints = valid.reduce((n,q)=>n+(q.points||0),0);
    return {total:units.length, valid:valid.length, pending:units.length-valid.length,
      mean:valid.length ? valid.reduce((n,q)=>n+q.computed.D,0)/valid.length : null,
      weighted:known.length===units.length && validPoints>0 ? valid.reduce((n,q)=>n+q.points*q.computed.D,0)/validPoints : null,
      known:known.length,points,validPoints,
      hct:Object.fromEntries(['H','C','T'].map(k=>[k,valid.length?valid.reduce((n,q)=>n+q.computed[k],0)/valid.length:null]))};
  }
  function coverage() {
    const targets=data.curriculum.targets;
    const available=targets.filter(p=>p.available);
    const targetIds=new Set(targets.map(p=>p.paper_id));
    $('target-coverage').innerHTML='<p class="notice">目标 10 套：'+available.length+'/10 已收录；'
      +targets.filter(p=>!p.available).map(p=>escape(p.school+' '+p.school_year)+' 未提供').join('；')
      +'。另有 '+data.papers.filter(p=>!targetIds.has(p.id)).length+' 套历史参考材料。</p>'
      +'<details><summary>目标卷清单与缺卷位置</summary><div class="table-scroll">'
      +table(['学校','学年','比较用途','状态'],targets.map(p=>[escape(p.school),escape(p.school_year),escape(p.role),
        p.available?'<a href="'+escape(p.url)+'">'+p.valid+'/'+p.units+' 问有评分 ↗</a>':'<span class="status pending">未提供，待补</span>']))+'</div></details>';
    const rows = data.schools.map(s=>[escape(s.name),...data.years.map(year=> {
      const p = data.papers.find(p=>p.school_key===s.key && p.school_year===year);
      if (!p) return '<span class="coverage-cell missing">未提供</span>';
      const st = p.statistics;
      return '<a class="coverage-cell '+(st.valid&&!p.year_conflict?'scored':'pending')+'" href="'+escape(p.url)+'"><strong>'+escape(p.status)+'</strong><small>'+(p.year_conflict?'卷首 '+escape(p.source_school_year)+'；暂不参与本格比较':st.total?st.valid+'/'+st.total+' 问有评分':p.has_transcript?'可读转录':'题目待整理')+'</small></a>';
    })]);
    $('coverage-matrix').innerHTML = table(['学校',...data.years.map(y=>escape(y))],rows);
    $('coverage-summary').textContent = data.papers.length+' 套材料已收录 · '+data.papers.filter(p=>!p.year_conflict).length+'/18 格可配对 · '+data.papers.reduce((n,p)=>n+p.statistics.valid,0)+' 问有评分';
  }
  function updateFilters(papers) {
    const units = papers.flatMap(p=>p.units);
    for (const [id,field,label,current] of [['module-filter','module','全部模块',state.module],['method-filter','methods','全部方法',state.method]]) {
      const values = [...new Set(units.flatMap(q=>Array.isArray(q[field])?q[field]:[q[field]]))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
      $(id).innerHTML='<option value="">'+label+'</option>'+values.map(v=>'<option value="'+escape(v)+'">'+escape(v)+'</option>').join('');
      $(id).value = values.includes(current)?current:'';
      state[field==='module'?'module':'method']=$(id).value;
    }
  }
  function paperCards(papers) {
    $('paper-cards').innerHTML=papers.map((p,i)=> {
      const st = localStats(filtered(p));
      const partial=st.pending||(!state.module&&!state.method&&finite(p.statistics.point_denominator)&&st.validPoints<p.statistics.point_denominator);
      return '<article class="paper-card" style="--paper-color:'+colors[i%colors.length]+'"><div class="paper-card-title"><div><p class="eyebrow">'+escape(p.school_year)+'</p><a href="'+escape(p.url)+'"><h3>'+escape(p.school)+'</h3></a></div><span class="status '+(st.valid?'scored':'pending')+'">'+escape(p.status)+'</span></div><div class="paper-numbers"><div><b>'+fmt(st.mean)+'</b><span>小问等权 D</span></div><div><b>'+st.valid+'<small>/'+st.total+'</small></b><span>有效评分 / 整理小问</span></div></div><p class="paper-meta">'+(p.total_points?escape(p.total_points)+' 分':'总分待核')+' · '+(p.duration?escape(p.duration)+' 分钟':'时长待核')+'</p><p class="caption">小问覆盖 '+pct(st.valid,st.total)+' · 已知配分 '+st.known+'/'+st.total+' 问<br>分值加权 D '+fmt(st.weighted)+' · 有效分值 '+(st.known?fmt(st.validPoints,0):'—')+' / '+(state.module||state.method?fmt(st.points,0):fmt(p.statistics.point_denominator,0))+' 分'+(partial?'（已分析部分）':'')+'</p><details class="caption"><summary>本卷内容范围</summary>'+escape(p.exam_scope||'尚待逐题归纳')+'</details><div class="paper-card-links"><a href="'+escape(p.url)+'">原题与依据 ↗</a><a href="'+escape(p.url.replace('index.html','units.csv'))+'">CSV ↓</a></div></article>';
    }).join('') || empty('当前视角尚无材料。');
  }
  function modules(papers) {
    const names=[...new Set(papers.flatMap(p=>filtered(p).map(q=>q.module)))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
    if (!names.length) { $('module-heatmap').innerHTML=empty('小问题目尚待整理，模块分布暂为空。'); return; }
    const rows=names.map(name=>[escape(name),...papers.map(p=> {
      const units=filtered(p), matches=units.filter(q=>q.module===name);
      const total=state.metric==='count'?units.length:units.reduce((n,q)=>n+(q.points||0),0);
      const value=state.metric==='count'?matches.length:matches.reduce((n,q)=>n+(q.points||0),0);
      const ratio=total?value/total:0;
      if (state.metric==='points' && !total) return '<button class="heat-cell" data-module="'+escape(name)+'" style="--heat:0"><strong>—</strong><small>配分未知</small></button>';
      return '<button class="heat-cell" data-module="'+escape(name)+'" style="--heat:'+ratio+'"><strong>'+pct(value,total)+'</strong><small>'+fmt(value,0)+'/'+fmt(total,0)+(state.metric==='count'?' 问':' 已知分')+'</small></button>';
    })]);
    $('module-heatmap').innerHTML=table(['唯一主模块',...papers.map(p=>escape(p.school)+'<small>'+escape(p.school_year)+'</small>')],rows);
    if (state.metric==='points') $('module-heatmap').insertAdjacentHTML('beforeend','<p class="caption">配分未知小问：'+papers.map(p=>escape(p.school)+' '+filtered(p).filter(q=>!finite(q.points)).length+' 问').join('；')+'。当前分母为已知配分之和，不是完整卷面总分。</p>');
  }
  function comparable(papers) {
    const fingerprints=new Set(papers.filter(p=>filtered(p).some(q=>q.computed)).map(p=>p.rules_fingerprint));
    return fingerprints.size<=1;
  }
  function distributions(papers, compatible) {
    if (!compatible) { $('difficulty-chart').innerHTML=empty('评分参数或词典口径不同，暂停跨卷难度比较。请分别阅读试卷。'); $('hct-chart').innerHTML=empty('评分口径待统一。'); return; }
    $('difficulty-chart').innerHTML=papers.map((p,i)=> {
      const units=filtered(p),valid=units.filter(q=>q.computed),weighted=state.difficulty==='points';
      const eligible=weighted?valid.filter(q=>finite(q.points)):valid;
      const weight=q=>weighted?q.points:1, denominator=eligible.reduce((s,q)=>s+weight(q),0);
      const counts=[0,0,0];for(const q of eligible)counts[q.computed.D<35?0:q.computed.D<65?1:2]+=weight(q);
      return '<div class="distribution"><div class="chart-label"><a href="'+escape(p.url)+'">'+escape(p.school)+'<small>'+escape(p.school_year)+'</small></a><span>有效 '+valid.length+' / '+units.length+' 问</span></div>'+(denominator?'<div class="stack" aria-label="'+escape(p.school)+' '+counts.join('/')+'">'+counts.map((n,j)=>'<span class="band-'+j+'" style="width:'+(100*n/denominator)+'%" title="'+['基础','中档','难题'][j]+' '+n+(weighted?' 分':' 问')+'">'+(n?n:'')+'</span>').join('')+'</div>':empty(weighted?'有效小问无明确配分':'暂无有效评分'))+'<p class="caption">'+counts.map((n,j)=>['基础','中档','难题'][j]+' '+pct(n,denominator)).join(' · ')+' · 分母 '+denominator+(weighted?' 个有效已知分':' 个有效小问')+' · 待核/未评分 '+(units.length-valid.length)+' 问'+(weighted?' · 有效但缺配分 '+(valid.length-eligible.length)+' 问':'')+'</p></div>';
    }).join('');
    $('hct-chart').innerHTML=papers.map((p,i)=> {
      const st=localStats(filtered(p));
      return '<div class="hct-row"><div class="chart-label">'+escape(p.school)+'<small>'+escape(p.school_year)+' · n='+st.valid+'</small></div>'+['H','C','T'].map(k=>'<div class="metric-bar"><span>'+k+'</span><i style="--width:'+(st.hct[k]||0)+'%;--paper-color:'+colors[i%colors.length]+'"></i><b>'+fmt(st.hct[k])+'</b></div>').join('')+'</div>';
    }).join('');
  }
  function sequence(papers,compatible) {
    if (!compatible) {$('sequence-chart').innerHTML=empty('评分口径待统一，题序对比暂缓。');return;}
    $('sequence-chart').innerHTML=papers.map((p,index)=> {
      const units=filtered(p),W=1000,H=165,L=36,R=20,T=15,B=30;
      if (!units.length) return '<div class="sequence-row"><h3>'+escape(p.school)+' · '+escape(p.school_year)+'</h3>'+empty('无已整理小问。')+'</div>';
      const x=i=>L+(W-L-R)*(units.length===1?.5:i/(units.length-1));
      const y=v=>H-B-(H-T-B)*v/100;
      const grids=[0,35,65,100].map(v=>'<line x1="'+L+'" y1="'+y(v)+'" x2="'+(W-R)+'" y2="'+y(v)+'" class="grid-line"/><text x="'+(L-8)+'" y="'+(y(v)+4)+'" text-anchor="end">'+v+'</text>').join('');
      let paths=[],current=[];
      units.forEach((q,i)=> {if(q.computed)current.push([x(i),y(q.computed[state.sequence])]); else {if(current.length)paths.push(current);current=[];}});if(current.length)paths.push(current);
      const line=paths.map(points=>'<polyline points="'+points.map(p=>p.join(',')).join(' ')+'" fill="none" stroke="'+colors[index%colors.length]+'" stroke-width="2.5"/>').join('');
      const dots=units.map((q,i)=>q.computed?'<a href="'+escape(q.url)+'"><circle cx="'+x(i)+'" cy="'+y(q.computed[state.sequence])+'" r="4.5" fill="'+colors[index%colors.length]+'"><title>'+escape(q.id)+' '+state.sequence+'='+fmt(q.computed[state.sequence])+'</title></circle></a>':'<text class="pending-dot" x="'+x(i)+'" y="'+(H-B)+'" text-anchor="middle"><title>'+escape(q.id)+' 尚未定分</title>×</text>').join('');
      const labels=units.map((q,i)=>(units.length<18||i===0||i===units.length-1||i%3===0)?'<text x="'+x(i)+'" y="'+(H-8)+'" text-anchor="middle">'+escape(q.id)+'</text>':'').join('');
      return '<div class="sequence-row"><h3><a href="'+escape(p.url)+'">'+escape(p.school)+' · '+escape(p.school_year)+'</a><span>'+state.sequence+' / 100</span></h3><svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+escape(p.school)+' '+state.sequence+'题序图">'+grids+line+dots+labels+'</svg></div>';
    }).join('');
  }
  function tags(papers) {
    const all=papers.flatMap(p=>filtered(p));
    const names=[...new Set(all.flatMap(q=>q[state.tag]))].sort((a,b)=>all.filter(q=>q[state.tag].includes(b)).length-all.filter(q=>q[state.tag].includes(a)).length||a.localeCompare(b,'zh-CN'));
    if (!names.length) {$('method-heatmap').innerHTML=empty('本视角尚无已整理标签。');return;}
    $('method-heatmap').innerHTML=table([{'methods':'方法','atoms':'关键题素','topics':'核心考点'}[state.tag],...papers.map(p=>escape(p.school)+'<small>'+escape(p.school_year)+'</small>')],names.map(name=>[escape(name),...papers.map(p=> {
      const units=filtered(p),n=units.filter(q=>q[state.tag].includes(name)).length;
      const content='<strong>'+n+'/'+units.length+'</strong><small>'+pct(n,units.length)+'</small>';
      return state.tag==='methods'?'<button class="heat-cell" data-method="'+escape(name)+'" style="--heat:'+(units.length?n/units.length:0)+'">'+content+'</button>':'<div class="heat-cell" style="--heat:'+(units.length?n/units.length:0)+'">'+content+'</div>';
    })]));
  }
  function breakthrough(papers) {
    const rows=[];
    for(const p of papers)for(const q of filtered(p))if(q.computed&&(q.computed.B>=2||q.computed.branches>1||q.computed.review_flag))rows.push([p,q]);
    rows.sort((a,b)=>(b[1].computed.B||0)-(a[1].computed.B||0));
    $('breakthrough-table').innerHTML=rows.length?table(['试卷 / 小问','D','B','必做分支','复核提示'],rows.map(([p,q])=>['<a href="'+escape(q.url)+'">'+escape(p.school)+' '+escape(p.school_year)+' · '+escape(q.id)+'</a>',fmt(q.computed.D),fmt(q.computed.B,0),q.computed.branches??'—',escape(q.computed.review_flag)||'查看原题与评分依据'])):empty('尚无已评分的 B≥2、分支较多或带复核提示的小问。');
  }
  function composition(papers) {
    const kinds=[...new Set(papers.flatMap(p=>filtered(p).map(q=>q.kind)))];
    $('kind-chart').innerHTML=table(['题型',...papers.map(p=>escape(p.school)+'<small>'+escape(p.school_year)+'</small>')],kinds.map(kind=>[escape(kind),...papers.map(p=>{const u=filtered(p);const n=u.filter(q=>q.kind===kind).length;return n+'/'+u.length+' 问 · '+pct(n,u.length);})]));
    $('b-chart').innerHTML=table(['突破门槛',...papers.map(p=>escape(p.school)+'<small>'+escape(p.school_year)+'</small>')],[0,1,2,3].map(b=>['B='+b,...papers.map(p=>{const u=filtered(p).filter(q=>q.computed&&finite(q.computed.B));const n=u.filter(q=>q.computed.B===b).length;return n+'/'+u.length+' · '+pct(n,u.length);})]));
  }
  function questions(papers) {
    const rows=[];
    for(const p of papers)for(const q of filtered(p))rows.push([p,q]);
    $('question-count').textContent=rows.length+' 个已整理小问 · '+rows.filter(([,q])=>q.computed).length+' 个有效评分';
    $('question-table').innerHTML=rows.length?table(['学校 / 学年','小问','主模块 / 方法','分值','D','B','核验状态'],rows.map(([p,q])=>[escape(p.school)+'<small>'+escape(p.school_year)+'</small>','<a href="'+escape(q.url)+'">'+escape(q.id)+' ↗</a>',escape(q.module)+'<small>'+escape(q.methods.join(' · '))+'</small>',fmt(q.points,0),fmt(q.computed?.D),fmt(q.computed?.B,0),'<span class="status '+(q.computed?'scored':'pending')+'">'+escape(q.computed?'已核验评分':q.verification_status)+'</span>'])):empty('小问题目尚待整理；可从上方材料覆盖矩阵阅读已有完整转录。');
  }
  /* ---- 第零章：数据背后的答案 ---- */
  function pipeline() {
    const papers=data.papers;
    const units=papers.reduce((n,p)=>n+p.units.length,0);
    const valid=papers.reduce((n,p)=>n+p.units.filter(q=>q.computed).length,0);
    const steps=papers.reduce((n,p)=>n+p.units.reduce((m,q)=>m+(q.steps||[]).length,0),0);
    const scored=papers.reduce((n,p)=>n+p.units.filter(q=>q.computed&&(q.steps||[]).length).length,0);
    const nodes=[['原卷 PDF',papers.length+' 套','扫描件、解析版、公众号版；同卷不重复计数'],
      ['转录与逐页校订',papers.filter(p=>p.has_transcript).length+' 卷','题干、选项、题图、原答案与解析逐字保留'],
      ['切到小问',units+' 个','一题多问分别成行，题号不等同小问数'],
      ['拆成步骤',steps+' 步','一步＝一个有意义的中间结论，含依赖关系'],
      ['六维证据 K R A V P I',scored+' 问有步骤','每步逐维给 0—2 分并写数学依据，不按题号套模板'],
      ['合成 H / C / T','H 峰值 · C 关键路径 · T 风险','C 取关键路径，T 记搜索、遗漏与返工'],
      ['结构难度 D 0—100',valid+' / '+units+' 问','三档：基础 <35，中档 35—65，难题 ≥65']];
    const flow=nodes.map((n,i)=>'<li class="pipe-node"><span class="pipe-step">'+(i+1)+'</span><strong>'+escape(n[0])+'</strong><b>'+escape(n[1])+'</b><small>'+escape(n[2])+'</small></li>').join('');
    $('pipeline').innerHTML='<ol class="pipeline">'+flow+'</ol>'
      +'<div class="dim-legend"><h3>六维在读什么</h3><dl>'+DIMENSIONS.map(([k,name])=>'<div><dt>'+k+'</dt><dd>'+name+'</dd></div>').join('')+'</dl>'
      +'<p class="caption">B（关键突破门槛 0—3）单独标记“这个想法有多难自己想到”，不并入 D。待核小问保留空值，不当作 0，也不均分大题配分。</p></div>';
  }
  function anatomy() {
    const paper=data.papers.find(p=>p.id===state.scope);
    if(!paper){$('anatomy').innerHTML=empty('尚未选择中心卷。');return;}
    const scored=paper.units.filter(q=>q.computed&&(q.steps||[]).length);
    if(!scored.length){$('anatomy').innerHTML=empty('该卷暂无带步骤证据的已评分小问。');return;}
    const options=scored.map(q=>'<option value="'+escape(q.id)+'"'+(q.id===state.anatomy?' selected':'')+'>'+escape(q.id)+' · '+escape(q.module)+' · D '+fmt(q.computed.D)+'</option>').join('');
    if(!scored.some(q=>q.id===state.anatomy))state.anatomy=scored.slice().sort((a,b)=>b.computed.D-a.computed.D)[0].id;
    const q=scored.find(x=>x.id===state.anatomy)||scored[0];
    const c=q.computed, peak=q.peak||{};
    const rows=(q.steps||[]).map(s=>'<tr><th scope="row">'+esc_inline(s.id)+'</th><td>'+esc_inline(s.action)+'</td><td>'+esc_inline(s.output)+'</td><td>'+DIMENSIONS.map(([k])=>k+'='+(s.dimensions?.[k]??'—')).join(' ')+'</td></tr>').join('');
    $('anatomy').innerHTML='<div class="anatomy-head"><div><p class="eyebrow">一个小问的完整证据</p><h3><a href="'+escape(q.url)+'">'+escape(paper.school)+' '+escape(paper.school_year)+' · '+escape(q.id)+' ↗</a></h3>'
      +'<p class="caption">'+escape(q.kind)+' · 主模块 '+escape(q.module)+' · 方法 '+escape(q.methods.join(' / ')||'—')+' · 配分 '+(finite(q.points)?q.points+' 分':'待核')+'</p></div>'
      +'<label>换一个小问 <select id="anatomy-pick">'+options+'</select></label></div>'
      +'<div class="score-strip"><span>H<b>'+fmt(c.H)+'</b></span><span>C<b>'+fmt(c.C)+'</b></span><span>T<b>'+fmt(c.T)+'</b></span><span>D<b>'+fmt(c.D)+'</b></span><span>B<b>'+(finite(c.B)?fmt(c.B,0):'—')+'</b></span><span>必做分支<b>'+(c.branches??'—')+'</b></span><span>档位<b>'+escape(c.band||'—')+'</b></span></div>'
      +'<div class="peak-row">'+DIMENSIONS.map(([k,name])=>'<span class="peak-chip">'+k+' '+name+'<b>'+(peak[k]??'—')+'</b></span>').join('')+'<span class="peak-chip">综合负荷 E<b>'+fmt(q.E)+'</b></span></div>'
      +(rows?'<div class="table-scroll"><table><thead><tr><th>步骤</th><th>数学动作</th><th>得到的结论</th><th>六维 0—2</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'')
      +(q.solution_basis?'<details class="evidence"><summary>整体判断依据</summary><div class="prose">'+esc_inline(q.solution_basis)+'</div></details>':'')
      +(q.B_evidence?'<p class="caption"><strong>B 依据</strong>：'+esc_inline(q.B_evidence)+'</p>':'')
      +'<p class="caption">完整题干、题图、答案与解析在<a href="'+escape(q.url)+'">该卷阅读页</a>。分数来自上面这些步骤证据，不是题号或题型推断。</p>';
    const pick=$('anatomy-pick');
    if(pick)pick.addEventListener('change',e=>{state.anatomy=e.target.value;anatomy();});
  }
  /* ---- 第一章：一张试卷的微雕 ---- */
  function microscope() {
    const select=$('microscope-paper');
    if(select && !select.options.length){
      const centers=data.papers.filter(p=>['jianping','gezhi'].includes(p.school_key)&&p.school_year==='2025-2026');
      const list=centers.length?centers:data.papers;
      select.innerHTML=list.map(p=>'<option value="'+escape(p.id)+'">'+escape(p.school)+' · '+escape(p.school_year)+'</option>').join('');
      if(!list.some(p=>p.id===state.scope))state.scope=list[0].id;
      select.value=state.scope;
    }
    const paper=data.papers.find(p=>p.id===state.scope);
    if(!paper){$('microscope-chart').innerHTML=empty('尚未选择中心卷。');return;}
    const units=paper.units;
    const W=Math.max(720,units.length*30),H=210,L=34,R=16,T=14,B=54;
    const x=i=>L+(W-L-R)*(units.length===1?.5:i/(units.length-1));
    const y=v=>H-B-(H-T-B)*v/100;
    const grids=[0,35,65,100].map(v=>'<line x1="'+L+'" y1="'+y(v)+'" x2="'+(W-R)+'" y2="'+y(v)+'" class="grid-line"/><text x="'+(L-8)+'" y="'+(y(v)+4)+'" text-anchor="end">'+v+'</text>').join('');
    const bars=units.map((q,i)=>q.computed?'<a href="'+escape(q.url)+'"><rect x="'+(x(i)-9)+'" y="'+y(q.computed.D)+'" width="18" height="'+(H-B-y(q.computed.D))+'" fill="'+bandColor[bandOf(q.computed.D)]+'"><title>'+escape(q.id)+' D='+fmt(q.computed.D)+' '+escape(q.module)+'</title></rect>'
      +(finite(q.computed.B)&&q.computed.B>=2?'<text x="'+x(i)+'" y="'+(y(q.computed.D)-6)+'" text-anchor="middle" class="b-flag">B'+fmt(q.computed.B,0)+'</text>':'')
      +(q.computed.branches>1?'<text x="'+x(i)+'" y="'+(H-B+14)+'" text-anchor="middle" class="branch-flag">'+q.computed.branches+'支</text>':'')+'</a>'
      :'<text x="'+x(i)+'" y="'+(H-B+14)+'" text-anchor="middle" class="pending-dot" fill="#a95434">×</text>').join('');
    const labels=units.map((q,i)=>'<text x="'+x(i)+'" y="'+(H-B+30)+'" text-anchor="middle">'+escape(q.id)+'</text>').join('');
    const valid=units.filter(q=>q.computed);
    const mean=valid.length?valid.reduce((n,q)=>n+q.computed.D,0)/valid.length:null;
    const mid=valid.length?'<line x1="'+L+'" y1="'+y(mean)+'" x2="'+(W-R)+'" y2="'+y(mean)+'" stroke="#284f43" stroke-dasharray="6 5"/><text x="'+(W-R)+'" y="'+(y(mean)-6)+'" text-anchor="end" fill="#284f43">等权 D 均值 '+fmt(mean)+'</text>':'';
    $('microscope-chart').innerHTML='<div class="sequence-row"><svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+escape(paper.school)+' 逐小问 D">'+grids+mid+bars+labels+'</svg></div>'
      +'<p class="legend-line">'+bandName.map((n,i)=>'<span><i style="background:'+bandColor[i]+'"></i>'+n+'</span>').join('')+'<span><i class="dash"></i>等权均值</span><span class="muted">× 为待核小问，不计入均值</span></p>';
    $('microscope-table').innerHTML=table(['小问','主模块','题型','配分','步骤','D','H','C','T','B','分支','状态'],
      units.map(q=>['<a href="'+escape(q.url)+'">'+escape(q.id)+' ↗</a>',escape(q.module),escape(q.kind),
        finite(q.points)?q.points:'待核',(q.steps||[]).length||'—',fmt(q.computed?.D),fmt(q.computed?.H),fmt(q.computed?.C),fmt(q.computed?.T),
        finite(q.computed?.B)?fmt(q.computed.B,0):'—',q.computed?.branches??'—',
        '<span class="status '+(q.computed?'scored':'pending')+'">'+escape(q.computed?'已核验':'待核')+'</span>']));
    const steps=units.reduce((n,q)=>n+(q.steps||[]).length,0);
    $('microscope-note').textContent=units.length+' 个小问 · '+valid.length+' 个有效评分 · '+steps+' 个评分步骤 · 待核 '+(units.length-valid.length)+' 问'+(paper.total_points?' · 满分 '+paper.total_points+' 分':' · 满分未知');
  }
  /* ---- 第二章：一场考试的对齐 ---- */
  function groupPapers(key) {
    return (data.groups[key]||[]).map(s=>data.papers.find(p=>p.school_key===s&&p.school_year==='2025-2026')).filter(Boolean);
  }
  function overlap(setA,setB){const a=new Set(setA),b=new Set(setB);if(!(a.size+b.size))return null;let n=0;for(const v of a)if(b.has(v))n++;return n/(a.size+b.size-n);}
  function alignment() {
    const key=state.align,papers=groupPapers(key);
    const present=papers.filter(p=>p.units.length);
    const missing=(data.groups[key]||[]).filter(s=>!papers.find(p=>p.school_key===s));
    const mods=[...new Set(present.flatMap(p=>p.units.map(q=>q.module)))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
    const counts=mods.map(m=>present.map(p=>p.units.filter(q=>q.module===m).length));
    const shared=mods.map((m,i)=>present.length>=2&&counts[i].filter(n=>n>0).length===present.length);
    const shared2=mods.map((m,i)=>counts[i].filter(n=>n>0).length>=2);
    const common=mods.filter((m,i)=>shared[i]);
    const common2=mods.filter((m,i)=>shared2[i]);
    const sharedUnits=present.map((p,i)=>p.units.filter(q=>common2.includes(q.module)).length);
    const rows=[];
    for(let i=0;i<present.length;i++)for(let j=i+1;j<present.length;j++){
      const a=present[i],b=present[j];
      const ma=new Set(a.units.map(q=>q.module)),mb=new Set(b.units.map(q=>q.module));
      const inter=[...ma].filter(m=>mb.has(m));
      const na=a.units.filter(q=>inter.includes(q.module)).length,nb=b.units.filter(q=>inter.includes(q.module)).length;
      rows.push(['<a href="'+escape(a.url)+'">'+escape(a.school)+'</a> ↔ <a href="'+escape(b.url)+'">'+escape(b.school)+'</a>',
        inter.length,escape(inter.join('、')||'（无共同主模块）'),
        (na/a.units.length*100).toFixed(0)+'% / '+(nb/b.units.length*100).toFixed(0)+'%',
        fmt(100*overlap(a.units.flatMap(q=>q.methods),b.units.flatMap(q=>q.methods)),0),
        fmt(100*overlap(a.units.flatMap(q=>q.topics),b.units.flatMap(q=>q.topics)),0)]);
    }
    const width=present.length?Math.max(300,present.length*150):300;
    const stack=present.map((p,i)=>{const total=p.units.length||1;let acc=0;
      const seg=mods.map((m,j)=>{const n=counts[j][i];const w=n/total*100;const s='<rect x="'+acc+'" y="0" width="'+w+'" height="26" fill="'+(shared2[j]?colors[j%colors.length]:'#d8dbd0')+'"><title>'+escape(m)+' '+n+'/'+total+'</title></rect>';acc+=w;return s;}).join('');
      return '<div class="align-row"><span class="align-label"><a href="'+escape(p.url)+'">'+escape(p.school)+'</a><small>'+p.units.length+' 问</small></span><svg viewBox="0 0 100 26" preserveAspectRatio="none" class="align-bar" role="img" aria-label="'+escape(p.school)+' 模块构成">'+seg+'</svg>'
        +'<span class="align-num">'+(sharedUnits[i]/total*100).toFixed(0)+'%<small>落在≥2校共有模块</small></span></div>';}).join('');
    $('alignment-chart').innerHTML=stack
      +'<p class="legend-line">'+mods.map((m,i)=>'<span><i style="background:'+(shared2[i]?colors[i%colors.length]:'#d8dbd0')+'"></i>'+escape(m)+(shared[i]?'（'+present.length+'校共有）':shared2[i]?'（两校共有）':'')+'</span>').join('')+'</p>'
      +(common.length?'<p class="caption">现有'+present.length+'校共同主模块：'+escape(common.join('、'))+'。</p>':'<p class="caption">现有卷没有全部学校共同的唯一主模块，灰段为仅一校出现的模块；两两共同模块见下表。</p>')
      +(missing.length?'<p class="notice">'+missing.map(s=>escape(schoolName(s))).join('、')+' 2025—2026 卷尚未提供，本组横向为 '+present.length+'/3 校；不以其他学年或月考替代。</p>':'');
    $('alignment-table').innerHTML=rows.length?table(['对照','共同主模块数','共同主模块','共同模块小问占比（各自分母）','方法重合 %','考点重合 %'],rows)
      :empty('本组暂无可两两对照的已整理试卷。');
  }
  /* ---- 第三章：一次命题的预测 ---- */
  function curriculum() {
    $('curriculum-progress').innerHTML=table(['中心校','学年','卷面主模块 / 小问数','核验覆盖','实际教学日历'],
      data.curriculum.progress.map(p=>[escape(p.school),escape(p.school_year),
        p.available?'<a href="'+escape(p.url)+'">'+p.modules.map(m=>escape(m.label)+' '+m.count+'问').join(' · ')+'</a>':'未提供',
        p.available?p.valid+'/'+p.total+' 问':'—','待补，不能从试卷确定']));
    frequency();
  }
  function frequency() {
    const key=$('frequency-school').value,kind=$('frequency-kind').value,search=$('frequency-search').value.trim();
    const rows=data.curriculum.frequency.filter(r=>r.school_key===key&&r.kind===kind&&r.label.includes(search));
    $('frequency-summary').textContent=rows.length+' 项 · 已核验小问口径';
    $('curriculum-frequency').innerHTML=rows.length?table(['知识点 / 模块','出现学年 / 可用卷',...data.years,'原题依据'],rows.map(r=>[
      escape(r.label),r.observed_years+'/'+r.available_years+' 卷<small>目标 '+r.expected_years+' 卷</small>',
      ...r.years.map(y=>y.count===null?'未提供':'<span class="heat-cell" style="--heat:'+(y.denominator?y.count/y.denominator:0)+'"><strong>'+y.count+'/'+y.denominator+' 问</strong>'
        +'<small>待核另有 '+y.pending+' 问</small></span>'),
      '<details><summary>查看题号</summary>'+r.years.map(y=>'<p>'+escape(y.school_year)+'：'+(y.count===null?'未提供':y.questions.length?y.questions.map(q=>'<a href="'+escape(q.url)+'">'+escape(q.id)+(q.pending?'〔待核〕':'')+'</a>').join(' · '):'未出现')+'</p>').join('')+'</details>'
    ])):empty('没有匹配的知识点。');
  }
  function trend() {
    const centers=['jianping','gezhi'];
    const rows=[];
    const blocks=centers.map(key=> {
      const seq=data.years.map(y=>data.papers.find(p=>p.school_key===key&&p.school_year===y&&p.comparison_eligible!==false));
      const got=seq.filter(Boolean);
      if(!got.length)return '<div class="trend-block"><h3>'+escape(schoolName(key))+'</h3>'+empty('暂无该中心校材料。')+'</div>';
      const W=560,H=170,L=36,R=18,T=14,B=34;
      const x=i=>L+(W-L-R)*(data.years.length===1?.5:i/(data.years.length-1));
      const y=v=>H-B-(H-T-B)*v/70;
      const segments=[];let segment=[];
      seq.forEach((p,i)=>{if(p&&finite(p.statistics.mean_D))segment.push(x(i)+','+y(p.statistics.mean_D));
        else{if(segment.length)segments.push(segment);segment=[];}});
      if(segment.length)segments.push(segment);
      const line=segments.filter(s=>s.length>1).map(s=>'<polyline points="'+s.join(' ')+'" fill="none" stroke="#284f43" stroke-width="2.5"/>').join('');
      const dots=seq.map((p,i)=>{
        const vx=x(i),has=p&&finite(p.statistics.mean_D);
        const anchor=i===0?'start':i===seq.length-1?'end':'middle';
        const lx=i===0?vx+4:i===seq.length-1?vx-4:vx;
        return (has?'<circle cx="'+vx+'" cy="'+y(p.statistics.mean_D)+'" r="5" fill="#284f43"><title>'+escape(p.school_year)+' 等权 D '+fmt(p.statistics.mean_D)+'</title></circle>'
        +'<text x="'+lx+'" y="'+(y(p.statistics.mean_D)-10)+'" text-anchor="'+anchor+'">'+fmt(p.statistics.mean_D)+'</text>':'<text x="'+vx+'" y="'+(H-B-8)+'" text-anchor="middle">未定分 / 缺卷</text>')
        +'<text x="'+vx+'" y="'+(H-12)+'" text-anchor="middle">'+escape(data.years[i])+'</text>';}).join('');
      const grid=[0,20,40,60].map(v=>'<line x1="'+L+'" y1="'+y(v)+'" x2="'+(W-R)+'" y2="'+y(v)+'" class="grid-line"/><text x="'+(L-8)+'" y="'+(y(v)+4)+'" text-anchor="end">'+v+'</text>').join('');
      for(let i=0;i<seq.length;i++){
        const p=seq[i],prev=i?seq[i-1]:null;
        const mods=p?[...new Set(p.units.map(q=>q.module))]:[];
        const prevMods=prev?[...new Set(prev.units.map(q=>q.module))]:[];
        rows.push([escape(schoolName(key)),escape(data.years[i]),
          p?(p.statistics.valid+'<small>/'+p.statistics.total+'</small>'):'<span class="status pending">未提供</span>',
          p?fmt(p.statistics.mean_D):'—',
          p&&prev&&finite(p.statistics.mean_D)&&finite(prev.statistics.mean_D)?((p.statistics.mean_D-prev.statistics.mean_D)>=0?'+':'')+fmt(p.statistics.mean_D-prev.statistics.mean_D):'—',
          p?p.statistics.bands.join(' / '):'—',
          mods.length,
          prev?escape(mods.filter(m=>!prevMods.includes(m)).join('、')||'—'):'—',
          prev?escape(prevMods.filter(m=>!mods.includes(m)).join('、')||'—'):'—',
          p&&prev?fmt(100*overlap(mods,prevMods),0)+'%':'—']);
      }
      const missing=seq.filter(p=>!p).length;
      return '<div class="trend-block"><h3><a href="'+escape(got[0].url)+'">'+escape(schoolName(key))+' · 纵向三年 ↗</a></h3>'
        +'<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+escape(schoolName(key))+' 三年等权 D">'+grid+line+dots+'</svg>'
        +(missing?'<p class="caption">该中心校有 '+missing+' 个学年未提供，缺卷保留学年位置，折线不跨缺口连线。</p>':'')+'</div>';
    }).join('');
    $('trend-chart').innerHTML='<div class="trend-grid">'+blocks+'</div>';
    $('trend-table').innerHTML=table(['中心校','学年','有效 / 整理','等权 D','Δ D','基础/中档/难题','主模块数','新增模块','退场模块','与上年模块重合 %'],rows);
  }
  function render(reset=false) {
    const papers=selected();
    if(reset)updateFilters(papers);
    const horizontal=state.view.endsWith('horizontal'),vertical=state.view.endsWith('vertical');
    const expected=horizontal||vertical?3:data.papers.length;
    const missing=expected-papers.length;
    const valid=papers.reduce((n,p)=>n+filtered(p).filter(q=>q.computed).length,0);
    $('selection-note').textContent=(horizontal?'同年三校：'+papers.map(p=>p.school).join('、'):vertical?'中心学校三年：'+papers.map(p=>p.school_year).join('、'):'全部已收录试卷')+'。材料覆盖 '+papers.length+'/'+expected+' 套'+(missing?'；缺 '+missing+' 套，保留空缺':'')+'；当前 '+valid+' 个有效评分小问。';
    const common=papers.length&&papers.every(p=>p.units.length)?[...new Set(papers[0].units.map(q=>q.module))].filter(m=>papers.every(p=>p.units.some(q=>q.module===m))):[];
    $('scope-note').textContent='各卷均含的主模块：'+(common.join('、')||'暂无可确认共同模块')+'。可用主模块筛选比较相同内容；其他模块保留为范围差异，时长或配分未知时不作等时、等分值判断。';
    $('filter-status').textContent=state.module||state.method?'图表已按筛选同步重算':'当前为所选试卷全部已整理小问';
    paperCards(papers);modules(papers);const compatible=comparable(papers);distributions(papers,compatible);sequence(papers,compatible);tags(papers);breakthrough(papers);composition(papers);questions(papers);
  }
  document.addEventListener('click',event=> {
    const view=event.target.closest('[data-view]');
    if(view){state.view=view.dataset.view;state.module='';state.method='';document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===view)));render(true);}
    const tag=event.target.closest('[data-tag]');
    if(tag){state.tag=tag.dataset.tag;document.querySelectorAll('[data-tag]').forEach(b=>b.setAttribute('aria-pressed',String(b===tag)));tags(selected());}
    const module=event.target.closest('[data-module]');if(module){state.module=module.dataset.module;$('module-filter').value=state.module;render();}
    const method=event.target.closest('[data-method]');if(method){state.method=method.dataset.method;$('method-filter').value=state.method;render();}
    const align=event.target.closest('[data-align]');
    if(align){state.align=align.dataset.align;document.querySelectorAll('[data-align]').forEach(b=>b.setAttribute('aria-pressed',String(b===align)));alignment();}
  });
  $('module-filter').addEventListener('change',e=>{state.module=e.target.value;render();});
  $('method-filter').addEventListener('change',e=>{state.method=e.target.value;render();});
  $('module-metric').addEventListener('change',e=>{state.metric=e.target.value;modules(selected());});
  $('sequence-metric').addEventListener('change',e=>{state.sequence=e.target.value;sequence(selected(),comparable(selected()));});
  $('difficulty-metric').addEventListener('change',e=>{state.difficulty=e.target.value;distributions(selected(),comparable(selected()));});
  $('clear-filters').addEventListener('click',()=>{state.module='';state.method='';render(true);});
  const scope=$('microscope-paper');
  if(scope)scope.addEventListener('change',e=>{state.scope=e.target.value;state.anatomy='';anatomy();microscope();});
  for(const id of ['frequency-school','frequency-kind'])$(id).addEventListener('change',frequency);
  $('frequency-search').addEventListener('input',frequency);
  coverage();pipeline();anatomy();microscope();alignment();trend();curriculum();render(true);
})();

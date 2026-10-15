/* Enhances the server-rendered paper overview; statistics remain available without JS. */
(() => {
  'use strict';
  const outline=document.getElementById('reader-outline');
  if(!outline)return;
  const narrow=matchMedia('(max-width: 1000px)');
  const adapt=()=>{outline.open=!narrow.matches;};adapt();narrow.addEventListener('change',adapt);
  const navLinks=[...outline.querySelectorAll('a[href^="#"]')];
  const mark=id=>navLinks.forEach(a=>{
    if(a.hash==='#'+id)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');
  });
  const targets=navLinks.map(a=>document.getElementById(a.hash.slice(1))).filter(Boolean);
  const units=JSON.parse(document.getElementById('reader-explore-data').textContent);
  const modulePick=document.getElementById('reader-explore-module');
  const methodPick=document.getElementById('reader-explore-method');
  const bandPick=document.getElementById('reader-explore-band');
  const questionPick=document.getElementById('reader-diagnosis-pick');
  let picked=Number(document.querySelector('[data-reader-diagnosis]:not([hidden])')?.dataset.readerDiagnosis)||null;
  let pinned=null;
  function matches(q){
    const band=q.computed?(q.computed.D<35?'0':q.computed.D<65?'1':'2'):'pending';
    return (!modulePick.value||q.module===modulePick.value)&&(!methodPick.value||q.methods.includes(methodPick.value))&&(!bandPick.value||band===bandPick.value);
  }
  function explore(){
    const visible=units.filter(matches),ids=new Set(visible.map(q=>q.index));
    if(!ids.has(picked))picked=visible.slice().sort((a,b)=>(b.computed?.D??-1)-(a.computed?.D??-1))[0]?.index??null;
    questionPick.replaceChildren(...visible.map(q=>{const option=document.createElement('option');option.value=q.index;option.textContent=q.id+' · '+q.module+' · '+(q.computed?'D '+q.computed.D:'待核');return option;}));
    questionPick.value=String(picked??'');questionPick.disabled=!visible.length;
    document.querySelectorAll('[data-reader-diagnosis]').forEach(card=>{card.hidden=Number(card.dataset.readerDiagnosis)!==picked;});
    document.querySelectorAll('.reader-risk-point').forEach(dot=>{
      const index=Number(dot.dataset.readerPoint);dot.toggleAttribute('hidden',!ids.has(index));
      dot.classList.toggle('is-selected',index===picked);
      if(index===picked)dot.setAttribute('aria-current','true');else dot.removeAttribute('aria-current');
    });
    document.getElementById('reader-explore-empty').hidden=visible.length>0;
    const valid=visible.filter(q=>q.computed);
    document.getElementById('reader-explore-summary').textContent='当前 '+visible.length+' 问 · '+valid.length+' 问已定分 · '+(visible.length-valid.length)+' 问待核 / 未评分'+(valid.length?' · 等权 D '+(valid.reduce((s,q)=>s+q.computed.D,0)/valid.length).toFixed(1):'')+'。筛选仅作用于散点与证据卡，正文与全卷统计完整保留。';
    const toggle=document.getElementById('reader-compare-toggle');toggle.disabled=picked===null;
    toggle.textContent=pinned===picked&&picked!==null?'取消固定':pinned===null?'固定当前题为对照':'用当前题替换对照';
    const pinnedUnit=units.find(q=>q.index===pinned);
    document.getElementById('reader-compare-note').textContent=pinnedUnit?'已固定 '+pinnedUnit.id+'；再选另一题，并看步骤与风险依据。':'固定一题，再选另一题，并看步骤与风险依据。';
    const pair=document.getElementById('reader-pair'),cards=document.getElementById('reader-pair-cards');
    pair.hidden=pinned===null||picked===null||pinned===picked;cards.replaceChildren();
    if(!pair.hidden){for(const index of [pinned,picked]){const clone=document.querySelector('[data-reader-diagnosis="'+index+'"]').cloneNode(true);
      clone.removeAttribute('data-reader-diagnosis');clone.hidden=false;cards.append(clone);}}
  }
  for(const control of [modulePick,methodPick,bandPick])control.addEventListener('change',explore);
  questionPick.addEventListener('change',()=>{picked=Number(questionPick.value);explore();});
  document.getElementById('reader-explore-reset').addEventListener('click',()=>{modulePick.value='';methodPick.value='';bandPick.value='';pinned=null;explore();});
  document.getElementById('reader-compare-toggle').addEventListener('click',()=>{pinned=pinned===picked?null:picked;explore();});
  explore();
  const seen=new Set();
  const observer=new IntersectionObserver(entries=>{
    entries.forEach(e=>e.isIntersecting?seen.add(e.target):seen.delete(e.target));
    const current=[...seen].sort((a,b)=>Math.abs(a.getBoundingClientRect().top)-Math.abs(b.getBoundingClientRect().top))[0];
    if(current)mark(current.id);
  },{rootMargin:'-8% 0px -70% 0px',threshold:0});
  targets.forEach(t=>observer.observe(t));
  document.addEventListener('click',e=>{
    const point=e.target.closest('[data-reader-point]');
    if(point){e.preventDefault();picked=Number(point.dataset.readerPoint);const q=units.find(q=>q.index===picked);
      if(q&&!matches(q)){modulePick.value=q.module;methodPick.value='';bandPick.value='';}explore();return;}
    const moduleButton=e.target.closest('[data-reader-module]');
    if(moduleButton){modulePick.value=moduleButton.dataset.readerModule;explore();return;}
    const link=e.target.closest('a[href^="#"]');
    if(link){const target=document.getElementById(link.hash.slice(1));
      if(target?.tagName==='DETAILS')target.open=true;
      if(target)mark(target.id);
      if(narrow.matches&&outline.contains(link))outline.open=false;
    }
    const tab=e.target.closest('[data-reader-tag]');
    if(tab){document.querySelectorAll('[data-reader-tag]').forEach(b=>b.setAttribute('aria-pressed',String(b===tab)));
      document.querySelectorAll('[data-reader-table]').forEach(t=>{t.hidden=t.dataset.readerTable!==tab.dataset.readerTag;});filterTags();}
  });
  const tagSearch=document.getElementById('reader-tag-search');
  function filterTags(){const query=tagSearch.value.trim().toLocaleLowerCase();
    document.querySelectorAll('[data-reader-table]').forEach(table=>{
      const rows=[...table.querySelectorAll('[data-reader-label]')];
      rows.forEach(r=>{r.hidden=!r.dataset.readerLabel.toLocaleLowerCase().includes(query);});
      table.querySelector('.reader-no-tags').hidden=rows.some(r=>!r.hidden);
    });
  }
  tagSearch.addEventListener('input',filterTags);filterTags();
  document.getElementById('reader-outline-search').addEventListener('input',e=>{
    const query=e.target.value.trim().toLocaleLowerCase();
    const items=[...outline.querySelectorAll('[data-outline-query]')];
    items.forEach(a=>{a.hidden=!a.dataset.outlineQuery.toLocaleLowerCase().includes(query);});
    document.getElementById('reader-outline-empty').hidden=items.some(a=>!a.hidden);
  });
  // A direct transcript deep link should reveal the collapsed transcript as well.
  if(location.hash){const target=document.getElementById(location.hash.slice(1));
    if(target?.tagName==='DETAILS'){target.open=true;target.scrollIntoView();}mark(location.hash.slice(1));}
})();

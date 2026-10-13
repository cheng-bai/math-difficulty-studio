'use client';
import {useMemo,useState} from 'react';
const empty={query:'',collection:'',type:'',status:'',module:'',band:''};
export default function Search({data}){
 const [filter,setFilter]=useState(empty);const [limit,setLimit]=useState(40);
 const update=(name,value)=>{setFilter({...filter,[name]:value});setLimit(40)};
 const collections=[...new Set(data.records.map(r=>r.collection))];
 const modules=[...new Set(data.records.filter(r=>r.type==='question').map(r=>r.module))].sort();
 const results=useMemo(()=>data.records.filter(r=>{
  const tokens=filter.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const haystack=[r.id,r.title,r.module,r.summary,r.source,r.rule,r.status,r.search_text,...r.topics,...r.methods].join(' ').toLowerCase();
  return tokens.every(t=>haystack.includes(t))&&(!filter.collection||r.collection===filter.collection)&&(!filter.type||r.type===filter.type)&&(!filter.status||r.status===filter.status)&&(!filter.module||r.module===filter.module)&&(!filter.band||(filter.band==='pending'?r.status==='待复核':filter.band==='b2'?r.B!==null&&r.B>=2:filter.band==='high'?r.D!==null&&r.D>=60:r.D!==null&&r.D<60));
 }),[data,filter]);
 return <section aria-label="全站检索"><div className="index-controls"><label>关键词<input type="search" placeholder="例如：代数；待复核；demo" value={filter.query} onChange={e=>update('query',e.target.value)}/></label><div className="index-filters">
 {[
 ['collection','资料集合',collections],['type','记录类型',[['question','结构化小问'],['resource','专题资料']]],['status','审核状态',['报告已定分','待复核','需关注','沿用原稿标记']],['module','知识模块',modules],['band','难度筛选',[['high','D ≥ 60'],['other','D < 60'],['b2','突破 B ≥ 2'],['pending','待复核']]]
 ].map(([name,label,values])=><label key={name}>{label}<select aria-label={label} value={filter[name]} onChange={e=>update(name,e.target.value)}><option value="">全部</option>{values.map(v=>{const [value,text]=Array.isArray(v)?v:[v,v];return <option key={value} value={value}>{text}</option>})}</select></label>)}<button onClick={()=>{setFilter(empty);setLimit(40)}}>清空筛选</button></div></div>
 <p className="index-note">知识点与方法取自原报告字段和解题步骤，尚未统一人工标注。D 为结构规则分；查看评分版本和选做范围后再比较。专题资料保留原稿标记，尚未拆成逐题记录。</p><p role="status" data-testid="result-count">找到 {results.length} 条记录</p><div className="index-results">{results.slice(0,limit).map(r=><article className="index-result" key={r.id} data-record-id={r.id}><div className="index-kicker"><span>{r.collection} · {r.type==='question'?'小问':'专题资料'}</span><span>{r.status}{r.optional?' · 选做':''}</span></div><h2><a href={r.url}>{r.title} ↗</a></h2><p className="index-meta">{r.module}{r.type==='question'?` · D ${r.D??'待核'} / B ${r.B??'待核'}`:''} · {r.rule} · {r.version}</p>{r.type==='resource'&&<p className="index-summary">{r.summary}</p>}{r.methods.length>0&&!r.methods.slice(0,2).some(t=>/[\\$]/.test(t))&&<p className="index-method">方法线索：{r.methods.slice(0,2).join('；')}</p>}<details><summary>编号与来源依据</summary><p className="index-meta">稳定编号：{r.id}<br/>来源：{r.source}</p>{r.alternate_url&&<a href={r.alternate_url}>原专题报告中的同一小问 ↗</a>}</details></article>)}</div>{!results.length&&<p className="index-empty">没有匹配记录。可以减少关键词或清空筛选。</p>}{results.length>limit&&<button className="index-more" onClick={()=>setLimit(limit+40)}>再显示 40 条</button>}</section>;
}

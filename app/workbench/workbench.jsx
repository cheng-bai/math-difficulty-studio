'use client';
import {useState} from 'react';
const workflows={
 difficulty:{title:'难度分析',description:'核对解答，逐问分析难点，生成有依据的教师报告。',outputs:['原题与完整解答','逐小问难度与关键突破','六维评分依据、风险与待核项'],skills:['question-difficulty-analysis','audit-shanghai-math-markdown']},
 evidence:{title:'教参课标依据',description:'对照你提供的教参与课标原文，说明题目考什么、为什么教。',outputs:['教参章节与课标条文依据','题目与教学要求的对应解释','原文出处、页码与待核引用'],skills:['教参与课标证据解读（待建立）']}
};
const accepted=['pdf','doc','docx','md','txt','png','jpg','jpeg','webp'];
function validate(file){return file&&!accepted.includes(file.name.split('.').pop().toLowerCase())?'请选择 PDF、Word、Markdown 或试卷图片。':''}
export default function Workbench(){
 const [paper,setPaper]=useState(null),[references,setReferences]=useState([]),[choices,setChoices]=useState({difficulty:true,evidence:false}),[notes,setNotes]=useState(''),[task,setTask]=useState(null),[error,setError]=useState('');
 const change=()=>setTask(null);
 function selectPaper(e){const file=e.target.files?.[0]||null;const problem=validate(file);setError(problem);setPaper(problem?null:file);change()}
 function generate(){
  if(!paper){setError('请先选择一份原始试卷。');return}
  if(!Object.values(choices).some(Boolean)){setError('请至少选择一种处理结果。');return}
  const selected=Object.keys(choices).filter(k=>choices[k]);
  const stages=['保留原件与来源，识别题干、图片和小问，核对缺页与 OCR 歧义'];
  if(choices.difficulty)stages.push('核验题意、答案和关键推导，保留原解与补解','建立步骤依赖与六维、T、B 证据，按 HCT-rules-v1.1 复算','独立复核并形成教师报告；待核小问不作确定评分');
  if(choices.evidence)stages.push('登记教参与课标版本、课程范围、章节与页码','逐题对应原文依据，分开原文、解释与教学建议；无原文时标记待补依据');
  stages.push('生成适合网站阅读的报告，并验证公式与题图显示');
  setTask({schema:'paper-task-draft-v1',status:'draft_not_submitted',paper:{name:paper.name,bytes:paper.size},references:references.map(f=>({name:f.name,bytes:f.size})),requested_outputs:selected.map(k=>workflows[k].title),skills:[...new Set(['原卷转录（按文件类型选择）',...selected.flatMap(k=>workflows[k].skills),'math-rendering-policy'])],stages,notes,limitations:['仅包含文件名与任务配置；文件内容未上传','未调用 AI、OCR 或评分程序；未产生分析结论']});setError('')
 }
 function download(){const text=['# 试卷处理任务（待执行）','',`原始试卷：${task.paper.name}`,`处理目标：${task.requested_outputs.join('、')}`,'','## 按以下流程执行',...task.stages.map((s,i)=>`${i+1}. ${s}`),'','## 参考资料',...(task.references.length?task.references.map(f=>'- '+f.name):['尚未提供教参与课标原文。']),'','## 补充要求',task.notes||'无','', '## 工作流与限制',...task.skills.map(s=>'- '+s),...task.limitations.map(s=>'- '+s),'','本文件是任务方案，实际执行时仍需同时提供上述原件与参考资料。'].join('\n');const url=URL.createObjectURL(new Blob([text],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='试卷处理任务.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 return <div className="bench-layout"><section className="bench-form" aria-label="试卷处理设置"><section className="bench-step"><div className="bench-step-title"><span>01</span><h2>选择原始试卷</h2></div><label className={'bench-drop'+(paper?' has-file':'')}><span className="bench-file-icon">↥</span><strong>{paper?paper.name:'点击选择一份试卷'}</strong><span>{paper?`${(paper.size/1024/1024).toFixed(2)} MB · 可点击重新选择`:'PDF · Word · Markdown · 试卷图片'}</span><input type="file" aria-label="原始试卷" accept=".pdf,.doc,.docx,.md,.txt,.png,.jpg,.jpeg,.webp" onChange={selectPaper}/></label><p className="bench-hint">本版仅在当前页面选择文件，不会上传。刷新页面后需重新选择。</p></section>
 <section className="bench-step"><div className="bench-step-title"><span>02</span><h2>希望 AI 帮你做什么？</h2></div><div className="bench-options">{Object.entries(workflows).map(([key,w])=><label className={'bench-option'+(choices[key]?' selected':'')} key={key}><div><input type="checkbox" checked={choices[key]} onChange={e=>{setChoices({...choices,[key]:e.target.checked});change()}}/><strong>{w.title}</strong><span>可组合</span></div><p>{w.description}</p><ul>{w.outputs.map(o=><li key={o}>{o}</li>)}</ul></label>)}</div></section>
 {choices.evidence&&<section className="bench-step bench-references"><h3>添加教参 / 课标原文 <small>可稍后补充</small></h3><label>参考资料<input aria-label="教参课标参考资料" type="file" multiple accept=".pdf,.doc,.docx,.md,.txt,.png,.jpg,.jpeg,.webp" onChange={e=>{const files=Array.from(e.target.files||[]);const problem=files.map(validate).find(Boolean);setError(problem||'');setReferences(problem?[]:files);change()}}/></label>{references.length>0&&<ul>{references.map((f,i)=><li key={i}>{f.name}</li>)}</ul>}<p className="bench-hint">需要原文、版本和页码才能给出可靠依据。没有参考资料时，任务会保留“待补依据”，不会虚构条文。</p></section>}
 <section className="bench-step"><div className="bench-step-title"><span>03</span><h2>补充要求 <small>选填</small></h2></div><textarea aria-label="补充要求" placeholder="例如：上海高二；保留原题和原解析；重点说明每个小问的关键突破。" value={notes} onChange={e=>{setNotes(e.target.value);change()}} rows={3}/></section>
 {error&&<p className="bench-error" role="alert">{error}</p>}<div className="bench-actions"><button className="bench-primary" onClick={generate}>生成处理方案 <span>→</span></button><p>先确认输入和处理步骤，再接入真正的 AI 执行。</p></div></section>
 <aside className="bench-output" aria-live="polite"><p className="eyebrow">OUTPUT / 处理方案</p><h2>{task?'这份试卷，将这样处理。':'你的结果，从这里开始。'}</h2>{task?<><p className="bench-task-status">方案已生成 · 尚未上传或运行 AI</p><h3>{task.paper.name}</h3><div className="bench-tags">{task.requested_outputs.map(t=><span key={t}>{t}</span>)}</div><ol>{task.stages.map(s=><li key={s}>{s}</li>)}</ol><details><summary>查看使用的 skills / 规范</summary><ul>{task.skills.map(s=><li key={s}>{s}</li>)}</ul></details><button className="bench-download" onClick={download}>下载处理任务 ↗</button><p className="bench-hint">下载文件只有任务说明。交给 Codex 执行时，还需提供原始试卷及参考资料。</p></>:<><div className="bench-empty-art" aria-hidden="true"><i/><i/><i/><span>原始试卷 → 规范处理 → 教研报告</span></div><p>选择试卷和处理目标后，这里会列出处理步骤与预期产物。</p><div className="bench-report-list"><span>完整题干与图形</span><span>难度与推理依据</span><span>教参课标对照</span></div></>}<div className="bench-service"><strong>AI 自动执行：待接入</strong><p>目前不会自动转录、解题或生成评分。下一步将把这份方案连接到后台任务服务。</p></div></aside></div>;
}

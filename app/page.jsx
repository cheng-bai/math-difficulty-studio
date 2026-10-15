import Link from 'next/link';
import {redirect} from 'next/navigation';
import {currentUser} from '../lib/session.mjs';
import {currentRelease} from '../lib/content-release.mjs';
export const dynamic='force-dynamic';
export default async function Home(){
 const user=await currentUser();if(!user)redirect('/login');
 const release=await currentRelease();const summary=await release.json('collection.json');
 return <main className="workspace" data-content-release={release.releaseId}>
 <header className="topbar"><Link className="brand" href="/"><span className="brandmark">∑</span><span>数学难度研究室<small>OPEN SOURCE / MATH DIFFICULTY STUDIO</small></span></Link><div className="account"><span>{user.name}</span><form method="post" action="/api/logout"><button className="text-button">退出登录 ↗</button></form></div></header>
 <section className="intro"><div><p className="eyebrow">LOCAL FIRST / 从题目出发</p><h1>看见难度背后的<br/><em>数学思考。</em></h1><p className="lead">原题、解析与评分证据，放在同一个阅读空间。<br/>开源版使用原创示例，你可以接入自己的授权资料。</p></div><div className="notation" aria-hidden="true"><span>K · R · A · V · P · I</span><strong>D = f(H, C, T)</strong><p>确定性评分 · 可追溯内容版本</p><div className="mini-bars">{[24,37,30,59,44,68,52,82,62,95,75,110].map((h,i)=><i key={i} style={{height:h}}/>)}</div><small>结构规则分 ≠ 学生失分率</small></div></section>
 <section><div className="section-title"><h2>内容阅读与维护</h2><span>{summary.papers} 组原创演示</span></div><Link href="/national/试卷总览.html" className="collection-card"><div><p className="eyebrow">DEMO / 题目、解答与评分</p><h3>修改一份输入，同步各处结果。</h3><p>{summary.total} 个分析单元 · {summary.valid} 个已定分 · {summary.pending} 个待核。<br/>查看原题、解析、六维依据与风险，下载同版本数据。</p></div><span className="collection-action">打开示例 ↗</span></Link></section>
 <section><div className="section-title"><h2>本地试卷处理台</h2><span>可选 MinerU OCR</span></div><Link href="/workbench" className="collection-card"><div><p className="eyebrow">WORKBENCH / 从原始文件开始</p><h3>归档原件，识别题目与公式。</h3><p>本地持久任务、进度恢复与识别文件整包下载。<br/>自动解题、评分证据生成和后台 AI 执行仍待接入。</p></div><span className="collection-action">进入处理台 ↗</span></Link></section>
 <section><div className="section-title"><h2>期中考情 · 多卷比较</h2><span>原创数据演示 / 支持私有导入</span></div><Link prefetch={false} href="/midterms" className="collection-card"><div><p className="eyebrow">MIDTERMS / 从图表回到原题</p><h3>横向对齐，纵向看变化。</h3><p>覆盖矩阵、考点与方法、题序难度和C/T负担。<br/>逐卷可检索大纲与两题证据对照；原创示例保留缺卷、待核与缺配分。</p></div><span className="collection-action">打开期中看板 ↗</span></Link></section>
 <footer className="footer"><Link href="/search">检索题目</Link><Link href="/modules">功能与架构</Link><a href="https://github.com/cheng-bai/math-difficulty-studio">GitHub ↗</a></footer>
 </main>;
}

import Link from 'next/link';
import {redirect} from 'next/navigation';
import {currentUser} from '../../lib/session.mjs';
import Workbench from './workbench.jsx';
import LocalOcr from './local-ocr.jsx';
import {localRuntime} from '../../lib/local-runtime.mjs';
export const dynamic='force-dynamic';
export default async function Page(){
 if(!await currentUser())redirect('/login');
 const local=localRuntime();
 return <main className="workspace workbench"><header className="topbar"><Link className="brand" href="/">∑ 数学难度研究室</Link><div className="account"><Link href="/">查看已有试卷 ↗</Link>{local?<span>本机工作空间</span>:<form method="post" action="/api/logout"><button className="text-button">退出登录</button></form>}</div></header><section className="bench-heading"><p className="eyebrow">PAPER STUDIO / 试卷处理台</p><h1>放入一份试卷，<br/><em>选择你要的结果。</em></h1><p>从原始材料开始，让 AI 按你的教研规范完成处理。</p><span className="bench-preview">{local?'本地运行 · MinerU OCR 已接入 · 解题评分后台待接入':'交互预览 · AI 执行服务待接入'}</span></section>{local&&<LocalOcr/>}{local?<details className="ocr-planning"><summary>后续难度分析 / 教参课标任务方案（执行服务待接入）</summary><Workbench/></details>:<Workbench/>}</main>;
}

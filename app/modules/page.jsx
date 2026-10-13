import Link from 'next/link';
import {redirect} from 'next/navigation';
import {currentUser} from '../../lib/session.mjs';
import {modules} from '../../lib/modules.mjs';
export const dynamic='force-dynamic';
export default async function Page(){
 if(!await currentUser())redirect('/login');
 return <main className="workspace"><header className="topbar"><Link className="brand" href="/">← 返回研究室</Link><Link href="/workbench">进入试卷处理台 ↗</Link></header><section className="intro index-intro"><div><p className="eyebrow">STUDIO MAP / 功能与建设路线</p><h1>从读懂试卷，<br/><em>走向读懂教学。</em></h1><p className="lead">目标：输入一套试卷，输出有原题、有解答、有评分证据的完整报告，逐步连接教参与课标。</p></div></section><p className="index-note">当前开源版提供原创示例阅读、内容版本管理和本地 OCR 工作台。本地 OCR 可按需配置，后台 AI 解题、教参及课标自动对照尚未接入；下面明确区分已上线能力与建设方向。</p><div className="index-results">{modules.map(m=><article className="index-result" key={m.name}><div className="index-kicker"><span>{m.status}</span></div><h2>{m.name}</h2><p>{m.description}</p>{m.href&&<Link prefetch={false} href={m.href}>打开模块 ↗</Link>}</article>)}</div><section className="index-note"><h2>先贯通一套试卷，再批量扩展</h2><p>原件留存 → 题块与图片核对 → 数学核验 → 步骤与六维证据 → HCT 复算 → 独立复核 → 教师报告 → 归档检索。</p><p>难度计算器负责复算已有证据。教参与课标模块需要版本化的原文依据；不得把 AI 推测写成课标条文或教参原意。</p></section></main>;
}

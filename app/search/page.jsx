import {currentRelease} from '../../lib/content-release.mjs';
import Link from 'next/link';
import {redirect} from 'next/navigation';
import {currentUser} from '../../lib/session.mjs';
import Search from './search.jsx';
export const dynamic='force-dynamic';
export default async function Page(){
 if(!await currentUser())redirect('/login');
 const release=await currentRelease();
 const data=await release.json('search.json');
 return <main className="workspace" data-content-release={release.releaseId}><header className="topbar"><Link className="brand" href="/">← 返回研究室</Link><Link href="/modules">功能与建设路线</Link></header><section className="intro index-intro"><div><p className="eyebrow">QUESTION INDEX / 从教学需求出发</p><h1>跨过目录，<br/><em>找到这道题。</em></h1><p className="lead">{data.question_count} 个结构化小问 · {data.resource_count} 个专题阅读页面。<br/>示例条目来自当前内容快照，可按题号与模块检索。</p></div></section><Search data={data}/></main>;
}

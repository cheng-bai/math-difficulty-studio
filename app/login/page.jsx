import { redirect } from 'next/navigation';
import { currentUser } from '../../lib/session.mjs';
import { authReady } from '../../lib/auth.mjs';
import { authProvider, safeReturnPath } from '../../lib/auth-config.mjs';
import LoginForm from './login-form.jsx';
export const dynamic = 'force-dynamic';
export default async function Login({ searchParams }) {
  const next = safeReturnPath((await searchParams)?.next);
  if (await currentUser()) redirect(next);
  return <main className="login-shell"><section className="login-story"><div className="brand"><span className="brandmark">∑</span><span>数学难度研究室<small>MATH · RESEARCH STUDIO</small></span></div><div><p className="eyebrow">一题一问 · 有据可循</p><h1>不止知道答案。<br/><em>更理解为什么。</em></h1><p className="lead">阅读原题与解析，观察推理路径，<br/>让每一次难度判断都能被核对。</p><div className="dimension-row">{['方法 K','推理 R','计算 A','表征 V','边界 P','交汇 I'].map(x=><span key={x}>{x}</span>)}</div></div><p className="story-foot">Math Difficulty Studio · 开源示例</p></section><section className="login-panel"><div className="login-box"><p className="eyebrow">欢迎回到研究室</p><h2>账号登录</h2><p className="muted">使用受邀账号，进入你的试卷研究空间。</p><LoginForm ready={authReady()} provider={authProvider()} next={next}/><p className="login-note">本网站采用邀请制。需要账号或重置密码，<br/>请联系网站管理者。</p></div><span className="login-bottom">原题 · 原解 · 审校补充 · 评分依据</span></section></main>;
}

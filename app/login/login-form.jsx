'use client';
import { useState } from 'react';
export default function LoginForm({ ready, provider, next }) {
  const [busy,setBusy] = useState(false), [error,setError] = useState('');
  const supabase = provider === 'supabase';
  async function submit(event) {
    event.preventDefault(); if(busy) return;
    setBusy(true);setError('');
    try {
      const data = new FormData(event.currentTarget);
      const credentials = { password:data.get('password'), next };
      credentials[supabase ? 'email' : 'username'] = data.get('identifier');
      const response = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(credentials) });
      if(response.ok) { const result=await response.json(); window.location.assign(result.next || '/'); return; }
      setError(response.status===429?'尝试次数较多，请稍后再试。':response.status===503?'登录服务暂时不可用，请稍后重试。':supabase?'邮箱或密码不正确，或此账号尚未获邀。':'账号或密码不正确。');
    } catch { setError('网络连接失败，请重试。'); }
    setBusy(false);
  }
  return <form onSubmit={submit} className="login-form"><label htmlFor="username">{supabase?'邮箱':'账号'}</label><input id="username" name="identifier" type={supabase?'email':'text'} autoComplete="username" required maxLength={supabase?254:80} placeholder={supabase?'请输入受邀邮箱':'请输入受邀账号'} disabled={!ready}/><label htmlFor="password">密码</label><input id="password" name="password" type="password" autoComplete="current-password" required maxLength={256} placeholder="请输入密码" disabled={!ready}/><div className="form-error" role="alert">{!ready?'登录服务暂未配置，请联系管理者。':error}</div><button className="primary-button" disabled={!ready||busy}>{busy?'正在验证…':'进入研究室'}<span aria-hidden="true">↗</span></button></form>;
}

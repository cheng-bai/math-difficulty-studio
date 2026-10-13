# Supabase Auth 接入与切换

代码支持 Supabase 邮箱/密码登录、SSR Cookie 会话刷新、同源退出、登录后返回原页面，以及服务端阅读权限检查。首页、搜索、工作台和内容阅读附件均在服务端检查权限；公开第三方运行资源不含私有题目。

默认采用 `legacy` 账号模式；Supabase 为可选方案，仓库不提供真实项目或账号。切换前需先准备自己的 Supabase 项目和获准账号。

## 准备项目与账号

1. 在目标 Supabase 项目启用 Email/Password；关闭公开注册和匿名登录，保留现有邀请制。
2. 在 Auth Users 创建受邀教师的邮箱/密码账号并确认邮箱。本版采用管理员创建账号后交付密码的方式；没有注册、邀请邮件回调或邮件找回密码页面，不应直接发送 Dashboard 邀请邮件作为入站流程。
3. 使用 Auth Admin API 为获准阅读的用户设置 **`app_metadata.studio_access: true`**。普通 `user_metadata` 不授权；即使同项目中存在其他已登录用户，也不能读取本站资料。

管理员授权示例，仅在可信管理环境执行；不要在网页代码或公开变量中使用管理密钥：

```js
import { createClient } from '@supabase/supabase-js';
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ADMIN_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { error } = await admin.auth.admin.updateUserById('受邀用户的真实UUID', {
  app_metadata: { studio_access: true },
});
if (error) throw error;
```

撤销阅读权限时将该值改为 `false`。站点每次服务端校验调用 `getUser()`，从 Auth 服务重新读取管理员权限，避免等待旧 JWT 的权限声明过期。`user_metadata.name` 仅用作显示名称。

## 本地与 Vercel 配置

在 `.env.local` 或 Vercel 对应环境配置：

```dotenv
AUTH_PROVIDER=supabase
SUPABASE_URL=https://实际项目ID.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_实际项目公开密钥
```

本应用只通过服务器处理密码登录，浏览器不初始化 Supabase SDK。密钥变量无需 `NEXT_PUBLIC_` 前缀；应用配置明确拒绝 secret/service_role 密钥。服务端令牌 Cookie 使用 HttpOnly、SameSite=Lax 和生产环境 Secure；刷新或包含用户数据的响应禁止缓存。密码登录不需要 OAuth 回调 URL。

会话生命周期由 Supabase 的项目设置控制，不沿用 legacy 的固定 8 小时。退出清除当前浏览器会话并请求撤销其刷新令牌；已复制的访问令牌仍可能有效至 JWT 到期。撤销本站阅读权限请同时将 `app_metadata.studio_access` 改为 `false`，该权限每次读取都会重新检查。

修改本地配置后重启；修改 Vercel 环境后重新部署。先在 Preview 环境验证：匿名资料拦截、获准账号登录、图片/附件读取、撤销权限、退出后拒绝访问，再将同一配置用于生产。旧用户名账号不会自动变成 Supabase 邮箱账号，旧会话也不会在 Supabase 模式下被接受。

回退：设置 `AUTH_PROVIDER=legacy` 并重新部署，保留原有 `AUTH_SECRET` 与 `AUTH_USERS_JSON` 即可。不得通过“Supabase 登录失败自动接受旧会话”的方式回退。原有账号管理脚本只管理 legacy 账号；Supabase 账号在 Supabase 管理。

## 验证

```sh
npm test
npm run build
npm run test:browser
```

单元测试检查管理员授权、撤销与查询失败时拒绝访问、返回路径限制、禁止高权限密钥及同源保护。浏览器冒烟测试使用隔离的 legacy 合成账号验证阅读、下载与权限边界，不连接真实 Supabase 服务。

切换真实项目时另行验证密码登录、会话刷新、管理员权限撤销、匿名拒绝及退出。真实服务配置与联调不包含在默认测试结果中。

官方依据：[Next.js SSR 接入](https://supabase.com/docs/guides/auth/server-side/nextjs)、[会话与缓存](https://supabase.com/docs/guides/auth/server-side/advanced-guide)。锁定依赖见 `package-lock.json`。

# 安全与隐私边界

本地免登录及 OCR 只适用于自己电脑的回环服务，不能作为公网认证方案。默认OCR后端可能向第三方服务发送文件；必须确认拥有文件使用权并逐文件同意。MinerU服务本身的安全与数据处理遵循其条款。

内容 Markdown 禁止原始 HTML，图片仅允许受控资产；HTTP通过认证和资源白名单访问私有快照。模板脚本为项目可信代码，不接受用户上传的HTML或JavaScript。

不得提交环境文件、账号哈希、会话、模型/OCR密钥、Supabase密钥、本地任务或带个人信息的文件。`.gitignore` 和 `check:public` 是防误操作措施，不能替代人工审查与专门的秘密扫描工具。

报告漏洞请使用本仓库的 GitHub Private Vulnerability Reporting（Security → Report a vulnerability）。若入口不可用，先发不含攻击载荷、凭据与私人文件的 issue 请求私密联系渠道。请不要公开可利用细节或真实用户数据。

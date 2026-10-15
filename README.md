# Math Difficulty Studio · 数学难度研究室

本地优先的数学试卷工作台：将题目、解答、评分证据与内容版本分开维护，通过确定性计算生成可阅读、可检索、可下载的报告。

开源版提供原创演示题组，以及9套合成期中示例（27小问、26问定分、1问待核、1问缺配分，含模拟缺卷）。期中学校显示为甲至己，所有示例均不代表真实学校考试。现有线上站点中的试卷、教材、书架、学生资料和运营数据不包含在本仓库中。

## 已有能力

- 数学 Markdown / KaTeX 阅读、难度柱状图、六维依据与风险说明。
- H/C/T/D 规则复算；B 关键突破独立展示。输入证据由维护者提供，结构分未经真实作答数据校准。
- JSON Schema、变更草稿与预览、请求幂等、题目及发布版本冲突保护、原子快照和完整回退。
- 同一快照生成详情、总览、首页统计、搜索与 JSON 下载。
- 期中考情总览：覆盖矩阵、固定分组的同年横向/中心三年纵向、考点方法统计、题序难度与CSV下载。
- 逐卷可视化阅读：可搜索大纲、考点统计、C/T散点、三重筛选和两题评分证据对照，支持手机阅读。
- 独立期中内容包预览、不可变快照发布和回滚；与既有题组ChangeSet分开维护。
- 可选的本地 MinerU OCR、不可变原件、任务恢复与 Markdown/题图 ZIP 下载。
- 本机回环模式、受邀账号登录与可选 Supabase 授权。

自动解题、自动生成评分证据、数学审核和远程 AI 执行尚未接入。内容目前随应用包部署；文件仓库不是多实例共享数据库。

## 快速开始

需要 **Node.js 22、Python 3.10+、macOS 或 Linux**。Windows 请使用 WSL；内容版本库使用 Unix 文件锁。没有模型或 OCR 密钥也能运行原创示例。

```sh
git clone https://github.com/cheng-bai/math-difficulty-studio.git
cd math-difficulty-studio
npm ci
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements-content.txt
npm run content:init
npm run midterms:demo
npm run local
```

打开 <http://127.0.0.1:3102>。本地启动器只绑定回环地址，启动本地工作台和 OCR worker；未安装 OCR 时会显示未配置，不会上传文件或调用模型。演示题组入口是 `/national/demo/试卷难度分析.html`，`national` 为保留的路由命名。

`content:init` 不覆盖已经存在的内容版本与索引。`midterms:demo` 生成并导入原创合成期中包；已有非演示期中发布指针时拒绝自动覆盖。打开 `/midterms` 体验期中看板。`private/`、本地凭据、任务和生成资源均不进入 Git。KaTeX 浏览器资源由固定版本的 npm 包复制生成。

## 期中看板与文档导航

![原创演示期中看板](docs/images/midterms-overview.png)

先看资料覆盖与考试范围，再按共同模块、方法比较，最后点题号查原题与评分证据。待核不作零，缺配分不均摊；D为结构规则分，不能换算真实失分率或用时。

| 文档 | 内容 |
| --- | --- |
| [产品使用手册](docs/USER_GUIDE.md) | 教师首次使用、OCR到核验与评分、交互、下载、登录部署及故障排查 |
| [资源索引](docs/RESOURCES.md) | 原创演示、工具、规范、测试与更新办法 |
| [期中输入与发布规范](docs/midterms.md) | 完整源包字段、固定比较布局、统计口径与版本恢复 |
| [更新记录](CHANGELOG.md) | 本轮产品功能与资源变化 |

自己的期中包准备好后，在仓库根目录执行：

```sh
npm run midterms:preview -- --source /path/to/source
npm run midterms:import -- --source /path/to/source
npm run midterms:rollback -- <releaseId>
```

替换路径与目标发布号。预览不切换版本，导入完整成功后才切换，回滚要求目标快照已存在且通过核验。生成器 `python3 scripts/setup-midterms-demo.py --output /tmp/my-midterms-template` 可创建新结构模板，拒绝覆盖不同内容。期中布局当前仅支持既有六个学校键与2023—2026学年，演示通过显示名映射虚构学校；尚不支持任意比较布局。

## 修改题目

```sh
npm run content:inspect
python3 scripts/studio.py draft 2 --out /tmp/change.json --request demo-edit-001 --reason '说明修改依据'
# 编辑草稿中的 content 或 analysis_input；不得手填 H/C/T/D。
python3 scripts/studio.py preview /tmp/change.json
python3 scripts/studio.py apply /tmp/change.json
npm run content:check
```

当前权威输入位于 `private/studio/releases/<releaseId>/source/<paperId>/`；通过 ChangeSet 更新，禁止直接编辑快照。`content/migration/demo/` 仅作初次初始化。`preview` 不修改指针，`apply` 完整生成成功后才切换。

同一请求重试不会重复激活旧版本；返回的 `releaseId` 是该请求的历史结果，`currentReleaseId` 是当前生效版本。同一请求ID对应不同内容会拒绝。回退命令：

```sh
python3 scripts/studio.py rollback <目标releaseId> --expected-release <当前releaseId>
```

升级模板后用 `rebuild --expected-release <当前releaseId>` 重新生成。新增解法不应直接改变评分路径，只有被审核并选定的评分证据进入 `analysis_input`。程序校验不替代数学核验。

默认版本库只管理一份可编辑题组。增加或替换自己的题组需同步 `studio-project.json`、迁移种子与索引初始化；多份可编辑题组和后台编辑器属于后续扩展。仅导入你有权使用和分发的材料。

## 账号与部署

本地模式无需账号。要启用受邀登录：

```sh
node scripts/create-account.mjs admin
npm run dev
```

生成的密码保存在 `.local/` 下的账号文件中；环境变量写入 `.env.local` 和本地部署配置文件，均不会提交 Git。不要先复制 `.env.example` 再运行账号创建器，否则保护逻辑会拒绝覆盖。生产部署需在自己的平台配置 `AUTH_PROVIDER=legacy`、高熵 `AUTH_SECRET` 和带 scrypt 哈希的 `AUTH_USERS_JSON`，或按 [Supabase配置](SUPABASE_AUTH.md) 启用邮箱授权。

本机生成内容后运行 `npm run build`、`npm start` 可测试 Node.js 生产服务。Vercel需自行创建项目与配置账号，将生成的私有快照及 `public/vendor` 纳入部署包；Git部署需额外安排 Python依赖安装与 `content:init` 构建步骤。仓库不包含既有站点的项目ID、环境配置或部署关联。

**不要在公网启用本地免登录模式。** 云端 OCR 路由默认关闭；将工作台变成多用户上传服务需要单独的权限、任务执行和存储设计。

## 可选OCR

安装并配置 MinerU CLI后，在工作台提交文件。默认 `open-api` 后端会将当前文件发送给 MinerU，界面逐文件要求同意；`local-cli` 可连接自行安装的离线后端。MinerU本体不随仓库分发，遵循其自身许可证与服务条款。配置见 [LOCAL_OCR.md](LOCAL_OCR.md)。

## 开发与验证

```sh
npm test
npm run test:content
python3 -m unittest discover -s tests -p 'test_midterms*.py'
npm run content:check
npm run check:public
npm run build
```

浏览器冒烟测试：

```sh
python3 -m pip install -r requirements-dev.txt
python3 -m playwright install chromium
npm run test:browser
```

GitHub Actions运行测试、泄露边界检查、构建和浏览器验收。贡献约定见 [CONTRIBUTING.md](CONTRIBUTING.md)，安全边界见 [SECURITY.md](SECURITY.md)，模块关系见 [docs/architecture.md](docs/architecture.md)。

## 许可证与范围

项目原创代码、文档与演示数据使用 [MIT许可证](LICENSE)。第三方依赖遵循各自许可证，KaTeX归属见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。MIT授权不延伸到你另外导入的试卷、教材、图片或私人资料。

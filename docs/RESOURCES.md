# 资源索引与更新办法

本仓库公开代码、文档和原创演示。真实试卷、教材、题图、学生资料、运行快照与账号数据不随仓库分发。

## 使用与维护文档

| 资源 | 用途 |
| --- | --- |
| [README](../README.md) | 安装、快速开始、能力与许可边界 |
| [产品使用手册](USER_GUIDE.md) | 教师阅读、分析流程、版本与故障排查 |
| [期中输入与发布规范](midterms.md) | 源包字段、统计口径、预览与回滚 |
| [架构说明](architecture.md) | 模块与版本库关系 |
| [OCR配置](../LOCAL_OCR.md) | MinerU后端、逐文件同意、草稿与ZIP |
| [Supabase配置](../SUPABASE_AUTH.md) | 可选邮箱登录与授权 |
| [贡献约定](../CONTRIBUTING.md) | 开发与贡献方式 |
| [安全边界](../SECURITY.md) | 私有材料、凭据与访问保护 |
| [更新记录](../CHANGELOG.md) | 产品资源与功能变更 |

## 原创数据与本地资源

| 资源 | 生成或使用方式 |
| --- | --- |
| [既有演示种子](../content/migration/demo/) | `npm run content:init`；展示题组阅读与ChangeSet版本管理 |
| [期中原创生成器](../scripts/setup-midterms-demo.py) | `npm run midterms:demo`；9卷27小问，含待核、缺配分和模拟缺卷 |
| [期中导入器](../scripts/import-midterms.py) | `midterms:preview` / `midterms:import`；源结构见规范 |
| [确定性评分引擎](../modules/studio/scoring.py) | HCT-rules-v1.1复算，输入证据由人提供 |
| [题目JSON Schema](../schemas/unit.schema.json) | 既有ChangeSet题组的输入约束；期中包另按导入器规范 |
| [变更JSON Schema](../schemas/change.schema.json) | 既有题组ChangeSet约束 |
| [KaTeX初始化](../scripts/setup-demo.mjs) | 从npm固定版本复制本地脚本、样式和字体；不依赖CDN阅读 |
| [第三方归属](../THIRD_PARTY_NOTICES.md) | KaTeX等依赖与许可证说明 |

期中原创示例显示甲至己六个虚构校名。内部学校键仅用于适配当前固定分组，不能据此当成真实学校资料。演示中的待核为刻意保留评分空值，缺配分为刻意缺字段；题干与有效答案仍完整。

初始化产物保存在 `private/` 与 `public/vendor/`，Git忽略；OCR任务及凭据另保存在本地私有目录。代码升级不等于源材料、OCR任务或快照自动同步。不要把 `.env.local`、账号文件或自有资料提交到公开仓库。

## 验证资源

| 检查 | 命令 |
| --- | --- |
| Node模块与访问边界 | `npm test` |
| 既有内容版本库 | `npm run test:content` 与 `npm run content:check` |
| 期中统计与示例生成 | `python3 -m unittest discover -s tests -p 'test_midterms*.py'` |
| 公开仓库边界 | `npm run check:public` |
| 生产构建 | `npm run build` |
| 浏览器冒烟 | 安装 `requirements-dev.txt` 与Playwright Chromium、完成构建后运行 `npm run test:browser` |

测试源码：[期中测试](../tests/test_midterms.py)、[原创示例测试](../tests/test_midterms_demo.py)、[期中路由测试](../tests/midterms.test.mjs)、[评分复算测试](../tests/test_midterms_demo.py)、[浏览器入口](../tests/run-browser-smoke.mjs)。程序检查不替代数学核验与实际公式/题图视觉检查。

## 如何更新资源

1. **更新代码或文档：** 按贡献流程提交，保持原许可证、原创示例和公开资料边界；运行受影响检查。
2. **增加自有试卷：** 在私有源包补完整题目、来源、题图、答案解析与逐问证据。缺卷保留缺卷，不拿其他年份代替；同卷多个版本合并身份。
3. **修订评分：** 统一参数与词典，重新复算；保留旧正式导出目录，可用 `delivery_dir` 指向新版。不要手改最终规则分。
4. **更新网站内容：** `npm run midterms:preview -- --source /path/to/source`，确认后再 `midterms:import`；记录发布号，实际检查图表、跳转、手机、公式、题图与下载。
5. **恢复：** `npm run midterms:rollback -- <releaseId>` 切回已存在的核验快照；不编辑历史产物。示例生成器只接受全新目录或完全相同内容，不用于覆盖用户资料。

MIT许可仅涵盖本项目原创代码、文档和演示；另行导入的试卷与图片使用权由素材本身决定。官方仓库：[cheng-bai/math-difficulty-studio](https://github.com/cheng-bai/math-difficulty-studio)。

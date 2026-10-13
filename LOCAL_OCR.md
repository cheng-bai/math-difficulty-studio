# 本地工作台与 MinerU OCR

先按 README 安装依赖并初始化原创示例，再运行 `npm run local`，打开 <http://127.0.0.1:3102/workbench>。启动器仅绑定回环地址，并同时管理网页服务与独立 OCR worker。`STUDIO_PORT` 可修改端口；`STUDIO_PYTHON` 可指定 Python 可执行文件。

生产模式的本机预览使用 `npm run local:build`、`npm run local:start`，构建目录为 `.next-local`。不要将免登录的本地模式暴露到公网；检测到 Vercel 或 AWS Lambda 环境时会拒绝启用。

## 配置后端

MinerU 本体、模型与凭据不随仓库分发，请按所选工具的官方说明安装并配置。

- 默认 `MINERU_BACKEND=open-api`，查找已安装的 `mineru-open-api`，读取 `~/.mineru/config.yaml` 中的 token；也可通过 `MINERU_CLI` 指定可执行文件。该后端调用远程服务，上传当前文件。
- `MINERU_BACKEND=local-cli` 与 `MINERU_CLI` 可连接自行安装的 MinerU CLI。离线模型的安装与网络行为需要自行验证；本仓库测试不证明真实模型已可用。
- 不将凭据放入公开仓库、前端变量、issue 或日志。第三方许可证与服务条款独立适用。

本地网站运行不代表 OCR 离线。界面逐文件要求外发同意，服务端也校验；换文件后清除同意状态。重试沿用原任务授权，可能再次发送已被远端接收的文件。不要用私人材料测试远程连接。

## 文件与状态

单任务限一份 PDF、PNG、JPEG 或 WebP，最大 50 MB；验证上传流、文件头与所有者。多页散图需先合成 PDF。默认数据目录 `.local/ocr/`，可用 `STUDIO_DATA_DIR` 指向私有目录。

任务保留原件 SHA256、所有者、阶段、尝试与失败历史。状态为 `queued → running → succeeded / failed / interrupted`。任务元数据原子写入，并使用 Python/Unix `flock` 协调并发；锁文件无需手动删除。重启会保留排队任务，中断任务需手动重试，避免自动重复外发。

OCR 返回 Markdown、JSON 与题图，并提供保留相对目录的 ZIP 下载；下载检查所有者、文件清单、路径与符号链接。预览显示转义文本，不执行识别稿中的 HTML。`succeeded` 只表示得到草稿，`reviewStatus=ocr_draft_unreviewed`，仍需原图校对与独立数学复核。

## 扩展与验证

界面调用任务 API；`modules/ocr/store.mjs` 管理文件仓库，`modules/ocr/mineru.mjs` 适配解析命令，`scripts/ocr-worker.mjs` 独立执行任务。迁移多用户云端服务仍需建设共享存储、持久队列与权限，不能直接把本机 worker 当作云函数长任务。

`npm test` 覆盖认证、所有者隔离、同源、文件类型、重试、锁互斥及重启恢复；使用合成文件与假 CLI，不向真实 MinerU 发送文件。浏览器冒烟测试验证非本地环境关闭 OCR API。真实服务联调需自行安装配置后，用非私密样页逐项核对公式、图片与下载包。

# 期中内容包：输入、导入与恢复

教师阅读与安装步骤见 [产品使用手册](USER_GUIDE.md)；本页供整理内容包、维护评分与发布的人员使用。

`/midterms` 读取独立、不可变的内容快照，复用现有登录与本机访问规则。HTML、数据、图片、脚本、字体与 CSV 都通过受保护路由及 manifest 白名单读取，并核验资源摘要。它不使用已有原创题组的 ChangeSet 修改接口。

## 1. 原创演示与比较布局

```sh
npm run content:init
npm run midterms:demo
```

第一条初始化既有原创题组与 KaTeX 资源；第二条生成并导入 `private/midterms-demo-source/`。已有非演示期中发布指针时拒绝自动覆盖。只生成模板可用：

```sh
python3 scripts/setup-midterms-demo.py --output /tmp/my-midterms-template
```

示例是9卷27小问，26问有效评分、1问刻意待核、1问缺配分。所有题目、答案与SVG均为原创合成，不读取或复制真实试卷。学校显示为甲至己，内部 `school_key` 为兼容既有布局保留 `jianping/jincai/huaer/gezhi/datong/xiangming`。

当前布局固定：两个中心各三个学年，横向比较各三校的2025—2026，共10个唯一目标位置。示例提供9个位置，其中 `xiangming` 同年模拟缺卷。支持的学年是 `2023-2024/2024-2025/2025-2026`，分组为 `jianping/jincai/huaer` 与 `gezhi/datong/xiangming`；不支持任意学校键、学年或自定义比较布局。

`inventory.school_labels` 可覆盖已知键的显示名；`demo: true` 启用原创演示提示。不要将演示规则分解读成真实学校水平。

## 2. 最小目录结构

```text
source/
  inventory.json
  跨卷分析.md
  四章叙事.md                 # 可选
  papers/
    jianping-2025-2026/
      paper.json
      转录.md
      教师报告.md
      analysis-input.json
      figures/triangle.svg
      delivery/评分明细.json
```

`inventory.json` 必须是含 `papers` 数组的对象。每项应有唯一合法 `id`、已知 `school_key`、支持的 `school_year` 与年级/学期/考试身份。可增加 `school_labels` 字典与 `demo` 标记。示例中的 `missing` 用于记录模拟来源说明；页面覆盖由实际卷目与固定目标位置推导，不靠补一个虚假试卷记录填满。

`papers/<id>/paper.json` 的同 ID 元数据优先于 inventory；目录名必须等于其中的 `id`。同一学校、学年、年级、学期、考试类型不能使用不同卷 ID 重复导入。学生版、教师版、答案分册属于同卷多个来源。

### paper.json 字段

| 字段 | 作用 |
| --- | --- |
| `id school school_key school_year title grade term exam` | 唯一身份与读者显示信息 |
| `pdfs` | 来源数组；例如 `{ "name": "原创示例（无PDF）" }`，无需写私人机器路径 |
| `total_points` | 已知整卷总分或 `null` |
| `duration_minutes` | 已知考试时长或 `null` |
| `exam_scope` | 已核对的考试范围，字符串或数组 |
| `units` | 有序小问主稿，顺序即题序图与阅读顺序 |
| `delivery_dir` | 可选，默认 `delivery`；支持 `delivery-v2` 等正式评分目录 |
| `source_school_year year_conflict comparison_eligible` | 来源学年、冲突与主比较资格；冲突卷可读但不参加主比较 |

每个 `units` 项使用：

```text
id n sub kind points module topics methods atoms
question answer solution figure_paths
verification_status pending issue source_ref
```

`id` 在本卷唯一，`n/sub` 对应原大题号与小问号；题干、答案、解析采用数学 Markdown。`module` 唯一；`topics/methods/atoms` 为多标签数组。`points` 仅填明确小问配分，未知用 `null`，不得均摊大题总分。

`figure_paths` 为该卷目录内的相对图片路径。Markdown原始HTML不执行，不抓取外链图片；题图需要随包保存。保留完整转录，不能用题目摘要替代正文。`教师报告.md` 是经核验的教师阅读正文，无正文时明确待补，不自动生成教研结论。

## 3. 正式评分输入与明细

`analysis-input.json` 包含 `questions` 与可选 `expected_question_ids`，用于按 ID 补充主稿字段、完善预期小问清单。每个有效评分问包含：

- `id/module/question/score` 与来源、`verification_status: "已核验"`。
- 非空 `steps`；每步有 `id/input/action/output/type_id/dependencies`、K/R/A/V/P/I的0—2级值及各维 `dimension_evidence`。依赖无环，不引用不存在的步骤。
- 五项整数 `t` 与五项 `T_evidence`，均须逐项有证据；`B` 为0—3，附 `B_evidence`；`branches` 是非负整数。
- 需要重复折扣时附 `repeat_group/repeat_evidence`，由引擎计算路径负担。

无法核验时用 `pending: true`、明确 `issue`，不造出零值证据。源题、答案与评分可分别保留疑点说明。

`delivery/评分明细.json` 为 `{ "algorithm": "HCT-rules-v1.1", "questions": [{ "evidence": ..., "computed": ... }] }`，并带参数版本、参数与词典版本。`computed` 必须由 [评分引擎](../modules/studio/scoring.py) 复算得到，不能手填最终分数。原创生成器给出了完整可运行范例。

审核好人工输入后，可在仓库根目录用以下脚本生成一份新评分明细；替换卷目录。它保留输入中的版本参数，使用真实评分引擎，目标已存在时拒绝覆盖：

```sh
python3 - /path/to/source/papers/jianping-2025-2026 <<'PYTHON'
import json, sys
from pathlib import Path
from modules.studio.scoring import score_question
paper = Path(sys.argv[1])
analysis = json.loads((paper / 'analysis-input.json').read_text(encoding='utf-8'))
keys = ('algorithm', 'paper_id', 'parameter_version', 'parameters', 'dictionary_version', 'step_types')
detail = {key: analysis[key] for key in keys if key in analysis}
detail['questions'] = [{'evidence': q, 'computed': score_question(q)} for q in analysis['questions']]
output = paper / 'delivery' / '评分明细.json'
output.parent.mkdir(parents=True, exist_ok=True)
with output.open('x', encoding='utf-8') as stream:
    json.dump(detail, stream, ensure_ascii=False, indent=2, allow_nan=False)
PYTHON
```

需要保留已有正式明细时，改写上述 `output` 到新的 `delivery-v2` 目录，再在 `paper.json` 设置 `delivery_dir`，不要删除旧稿。

导入器读取正式明细，不替你进行数学核验或重新生成证据。只有 ID 匹配、规范版本支持、证据已核验、双方非 pending 且评分值合法时才计入确定评分。主稿的待核状态优先；没有正式结果的问显示空值，CSV不填0。

全卷及跨卷保持 `algorithm/parameter_version/parameters/dictionary_version/step_types` 一致。指纹不同会暂停相关难度图比较。评分细节与边界以 [评分引擎源码](../modules/studio/scoring.py) 和 [评分测试](../tests/test_midterms_demo.py) 为准；程序复算不证明维度及风险依据在教学上合理。

## 4. 预览、发布与回滚

```sh
npm run midterms:preview -- --source /path/to/source
npm run midterms:import -- --source /path/to/source
npm run midterms:rollback -- <releaseId>
```

替换示意路径和目标发布号。需要安装 `requirements-content.txt`、npm依赖并运行 `content:init`，以准备本地 KaTeX资源。也可直接运行 `python3 scripts/import-midterms.py --source /path/to/source --preview` 或 `--apply`。

预览在临时目录完整生成后清理，不修改发布指针。发布生成内容地址化目录 `private/midterms/releases/<releaseId>/`，成功后原子切换 `current.json`。来源渲染期间变化会拒绝发布。相同输入复用同一快照；修改导入器、模板、样式、脚本、导读或源资料都会影响内容摘要。

回滚只切换到已存在且核验通过的快照，不删除其他快照、不改写输入包。不要手动改快照或指针。`/midterms` 与稳定逐卷入口读取当前版本；含 `/releases/<releaseId>/` 的地址始终固定历史快照。

## 5. 统计、导读与下载口径

全卷统计按实际小问清单计算等权均值、HCT均值、D档次、模块和标签频次。待核从确定评分排除，小问覆盖率分母包含待核。只有全部配分明确时才显示加权指数；有待核时仅指已分析部分。未知总分或未知配分时不伪造完整分值覆盖率。

主模块承担题量与分值汇总，多标签只计涉及小问数，可重叠且不自动合并近义词。三年考频按已核验评分小问统计出现学年数，待核另列，缺卷年份为空。卷面内容范围不能推断课堂教学顺序、周次或未考内容是否已教；实际教学日历目前为空。D不推算真实失分率或作答时间，三年变化不构成下一年概率预测。

`跨卷分析.md` 与可选 `四章叙事.md` 都计入发布哈希；四章导读使用二级标题分章，不应把假设写成已证实结论。

产物包含 `data.json`、`summary.csv`、`units.csv`、`targets.csv`、`progress.csv`、`frequency.csv`。总览下载是本发布的全量文件，不随页面筛选变化。逐卷页展示完整题目、题图、答案解析、评分依据、教师报告与完整转录。

## 6. 发布前检查

```sh
npm test
python3 -m unittest discover -s tests -p 'test_midterms*.py'
npm run content:check
npm run check:public
npm run build
```

`content:check` 检查既有原创题组版本库，不是期中数学审校替代项。期中导入预览另行检查源包、身份与公式。浏览器应检查总览、两组横向、中心纵向、筛选、题目跳转、两题证据对照、手机大纲、公式/题图、CSV与未登录资源访问。真实资料继续保存在 Git忽略目录，仅同步代码、文档和有权公开的原创资源。

#!/usr/bin/env python3
"""Generate original, synthetic midterm fixtures; never reads actual exams.

The output is private, ignored runtime content. An identical existing package
is accepted; any changed, missing or additional file causes a refusal.
"""
import argparse
import json
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'modules'))
from studio.scoring import score_question

ALGORITHM = 'HCT-rules-v1.1'
PARAMETERS = {'H': 'max(step weighted load)*100', 'C': '100*(1-exp(-E/3))',
              'T': '10*sum(t)', 'D': {'H': .45, 'C': .35, 'T': .20},
              'dimension_weights': {'K': .20, 'R': .25, 'A': .15, 'V': .15, 'P': .15, 'I': .10}}
STEP_TYPES = {'sequence': '等差数列求和', 'coordinates': '坐标与面积',
              'quadratic': '受限定义域二次函数最值'}
SCHOOLS = {'jianping': '甲校', 'gezhi': '乙校', 'jincai': '丙校',
           'huaer': '丁校', 'datong': '戊校', 'xiangming': '己校'}
YEARS = ('2023-2024', '2024-2025', '2025-2026')
NOTICE = '原创合成演示：学校名称、学年与规则分仅用于功能体验，不代表任何实际学校试卷或学生表现。'


def serialized(value):
    return json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n'


def step(sid, type_id, input_text, action, output, dimensions, reasons, dependencies=()):
    return {'id': sid, 'type_id': type_id, 'input': input_text, 'action': action,
            'output': output, 'dimensions': dict(zip('KRAVPI', dimensions)),
            'dimension_evidence': dict(zip('KRAVPI', reasons)), 'dependencies': list(dependencies)}


def evidence(unit, steps, risk=(0, 0, 0, 0, 0), risk_reasons=None, breakthrough=0, breakthrough_reason=None, branches=0):
    risk_reasons = risk_reasons or ['题面直接提示所用公式或底高关系，入口无隐藏。', '给定数据与目标直接对应，无看似合理的无效入口。',
                                   '代入式可立即反算核对，错误无需推进至后续阶段才暴露。', '算术错误只需修正当前代入式，不改变方法与前置步骤。',
                                   '数据均为正数，项数固定、底高非零，无额外端点、等号或退化情形。']
    return {'id': unit['id'], 'module': unit['module'], 'question': unit['question'],
            'score': unit['points'], 'verification_status': '已核验',
            'source_ref': '原创演示生成器 / ' + unit['id'], 'steps': steps, 't': list(risk),
            'T_evidence': [{'item': i+1, 'value': value, 'evidence': reason}
                           for i, (value, reason) in enumerate(zip(risk, risk_reasons))],
            'B': breakthrough, 'B_evidence': breakthrough_reason or '回顾性入口分析：题面直接对应公式或底高关系，无独立关键转折。', 'branches': branches}


def coordinate_svg(base, height):
    # The figure and the solution use the same exact integer coordinates.
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260" viewBox="0 0 400 260" role="img" aria-label="原创演示三角形：A(0,0)、B({base},0)、P({base//2},{height})">
<rect width="400" height="260" fill="#fffdf7"/><path d="M50 210H365M50 225V25" stroke="#59655c" fill="none"/>
<path d="M50 210L330 210L190 55Z" fill="#e0e9dc" stroke="#375b43" stroke-width="3"/>
<path d="M190 55V210" stroke="#9c693c" stroke-dasharray="5 4"/>
<g font-family="sans-serif" font-size="16" fill="#24392a"><text x="25" y="240">A(0,0)</text><text x="290" y="240">B({base},0)</text><text x="175" y="40">P({base//2},{height})</text><text x="205" y="145">h={height}</text></g></svg>'''


def questions(variant):
    first, difference, n = 2 + variant, 2, 5 + variant % 3
    base, height, c = 4 + 2*(variant % 3), 3 + variant % 2, 1 + variant % 3
    last = first + (n-1)*difference
    total, area = n*(first+last)//2, base*height//2
    q1 = {'id': 'Q1', 'n': 1, 'sub': '', 'kind': '填空题', 'points': 5, 'module': '数列',
          'topics': ['等差数列', '前n项和'], 'methods': ['公式代入'], 'atoms': [],
          'question': f'【原创演示】等差数列 $a_n$ 的首项为 ${first}$，公差为 ${difference}$。求前 ${n}$ 项和 $S_{{{n}}}$。',
          'answer': f'$S_{{{n}}}={total}$。',
          'solution': f'末项 $a_{{{n}}}={first}+({n}-1)\\times {difference}={last}$。由等差数列求和公式，$S_{{{n}}}=\\frac{{{n}({first}+{last})}}{{2}}={total}$。', 'figure_paths': [], 'verification_status': '已核验'}
    e1 = evidence(q1, [step('s1', 'sequence', f'a1={first},d=2,n={n}', '由通项公式求末项。', f'$a_{{{n}}}={last}$',
          [0,0,0,0,0,0], ['首项、公差与项数直接对应通项公式。', '代入通项公式单步得到末项。', '一两步整数乘加属于常规运算。', '保持数列公式表示，无表征转换。', '项数固定，无参数分类或边界。', '仅使用等差数列单模块。']),
          step('s2', 'sequence', f'a1={first},an={last},n={n}', '使用首末项求和公式。', f'$S_{{{n}}}={total}$',
          [0,0,0,0,0,0], ['首末项和项数直接对应求和公式。', '代入上一步末项直接求和。', '一两步整数乘除属于常规运算。', '保持数列公式表示，无表征转换。', '没有额外参数或边界。', '仅使用等差数列单模块。'], ['s1'])])
    q2 = {'id': 'Q2', 'n': 2, 'sub': '', 'kind': '填空题', 'points': 5, 'module': '平面解析几何',
          'topics': ['平面直角坐标系', '三角形面积'], 'methods': ['底高法'], 'atoms': ['点到坐标轴距离'],
          'question': f'【原创演示】已知 $A(0,0)$、$B({base},0)$、$P({base//2},{height})$，求三角形 $ABP$ 的面积。图形为示意图。',
          'answer': f'${area}$。', 'solution': f'$AB={base}$，点 $P$ 到 $x$ 轴的距离为 $|{height}|={height}$，故面积为 $\\frac12\\times {base}\\times {height}={area}$。',
          'figure_paths': ['figures/triangle.svg'], 'verification_status': '已核验'}
    e2 = evidence(q2, [step('s1', 'coordinates', f'A(0,0),B({base},0),P({base//2},{height})', '以AB为底，由纵坐标识别高。', f'$AB={base},h={height}$',
          [0,0,0,1,0,1], ['AB在x轴上，坐标直接对应底长和高。', '由横纵坐标直接读出底长与高，无条件推理链。', '读出正整数，无复杂运算。', '一次由坐标表示转为几何底高。', '无参数，底高为正且无退化边界。', '平面坐标与三角形底高作两模块浅层配合。']),
          step('s2', 'coordinates', f'b={base},h={height}', '代入三角形面积公式。', f'$S={area}$', [0,0,0,0,0,0],
          ['已知底高直接对应三角形面积公式。', '单步公式代入即得面积。', '一两步整数乘除属于常规运算。', '沿用底高公式表示，无新表征转换。', '无额外参数或边界。', '本步只使用三角形面积单模块。'], ['s1'])])
    q3 = {'id': 'Q3', 'n': 3, 'sub': '', 'kind': '解答题', 'points': 10, 'module': '函数',
          'topics': ['二次函数', '含参不等式', '定义域'], 'methods': ['配方法', '分类讨论'], 'atoms': ['顶点与定义域位置'],
          'question': f'【原创演示】求所有实数 $a$，使 $x^2-2ax+{c*c}\\ge 0$ 对每个 $x\\ge0$ 都成立。',
          'answer': f'$a\\le {c}$。',
          'solution': f'配方得 $x^2-2ax+{c*c}=(x-a)^2+{c*c}-a^2$。若 $a\\le0$，则 $x\\ge0$ 时 $x^2-2ax+{c*c}\\ge {c*c}>0$，均成立。若 $a>0$，顶点 $x=a$ 在定义域内，最小值为 ${c*c}-a^2$，故须且只须 $0<a\\le {c}$。合并得 $a\\le {c}$。边界 $a={c}$ 时在 $x={c}$ 取等号；$a>{c}$ 时取 $x=a$ 即不成立。',
          'figure_paths': [], 'verification_status': '已核验'}
    e3 = evidence(q3, [step('s1', 'quadratic', f'f(x)=x²-2ax+{c*c},x≥0', '配方并判断顶点是否落在定义域。', f'$f(x)=(x-a)^2+{c*c}-a^2$；按 $a\\le0$ 与 $a>0$ 分支。',
          [1,1,0,0,2,0], ['需将受限定义域恒成立转为顶点位置与最值的标准变式。', '配方、定位顶点，再与x≥0比较，经过两三次常见转换。', '一次配平方属于常规运算。', '一般式与顶点式仍为代数公式表示，无跨表征转换。', '参数a决定顶点是否落在定义域，必须保留两个分支。', '二次函数的顶点、定义域与最值属于同一函数模块。']),
          step('s2', 'quadratic', 'a≤0，x≥0', '证明各项非负，最小值位于x=0。', f'$f(x)\\ge {c*c}>0$，此分支全部成立。',
          [0,1,0,0,1,0], ['本分支直接使用各项非负性。', '由a≤0与x≥0得-2ax≥0，再合并各项确定最小值。', '符号判断与常数比较属于常规运算。', '沿用函数代数式，无表征转换。', '处理a≤0这一参数分支并包含a=0边界。', '仅在函数最值模块内处理符号条件。'], ['s1']),
          step('s3', 'quadratic', 'a>0，顶点在定义域', '令顶点最小值非负。', f'${c*c}-a^2\\ge0$ 且 $a>0$，得到 $0<a\\le {c}$。',
          [0,1,0,0,1,0], ['顶点在定义域内时直接使用二次函数最小值。', '恒成立等价于最小值非负，再与a>0相交得到参数区间。', '简单平方不等式与区间相交属于一两步常规运算。', '沿用顶点公式表示，无表征转换。', '保留a>0分支前提与最小值等号边界。', '函数最值及其直接不等式条件作为同一模块，不另计交汇。'], ['s1']),
          step('s4', 'quadratic', f'a≤0 或 0<a≤{c}', '合并范围并验证上端点与反例。', f'$a\\le {c}$；端点取等号，越界取 $x=a$ 得负值。',
          [0,1,0,0,1,0], ['直接合并已得区间并代入验证。', '合并两个区间、验证等号，再用x=a说明越界不成立。', '区间合并与代入属于常规运算。', '保持代数与区间表示，无新表征转换。', f'复查上端点a={c}及分类衔接a=0。', '仍在函数参数范围内闭合证明，不额外计知识交汇。'], ['s2', 's3'])],
          risk=(0,1,1,1,1), risk_reasons=['二次函数与x≥0提示配方及顶点定位，正确入口无明显隐藏。',
          '直接套全实数上的判别式≤0看似合理，但会错误排除a<0；需改回受限定义域最值。',
          '忽略x≥0仍能算出貌似完整的区间，直到检查负a特例才暴露；须回查顶点位置。',
          '发现定义域误用后需退回s1补参数分类并重算区间；配方本身可保留，返工局部。',
          f'把最小值非负写为严格正会漏a={c}等号，分类若两边均取严格号会漏a=0；需在s4补查两个边界。'],
          breakthrough=1, breakthrough_reason='回顾性入口分析：题面x≥0与含参顶点提示常见方法组合；在s1按顶点位置分成a≤0/a>0，是唯一关键转折。', branches=2)
    return [q1, q2, q3], [e1, e2, e3], (base, height)


def package_files():
    files, inventory = {}, []
    identities = [(school, year) for school in ('jianping', 'gezhi') for year in YEARS]
    identities += [(school, YEARS[-1]) for school in ('jincai', 'huaer', 'datong')]
    for index, (school, year) in enumerate(identities):
        ident = school + '-' + year
        units, inputs, coords = questions(index)
        if ident == 'gezhi-2024-2025':
            units[1]['points'] = None
            inputs[1]['score'] = None
        if ident == 'huaer-2025-2026':
            units[2].update(pending=True, verification_status='待核验', issue='演示待核流程：题干与解答完整，刻意不发布本题评分。')
            inputs[2] = {'id': 'Q3', 'pending': True, 'issue': units[2]['issue'], 'score': 10,
                         'verification_status': '待核验', 'source_ref': '原创演示生成器 / Q3'}
        meta = {'id': ident, 'school': SCHOOLS[school] + '（演示）', 'school_key': school, 'school_year': year,
                'title': f'{SCHOOLS[school]} {year} 高二上期中功能演示卷（原创合成）', 'grade': '高二', 'term': '上', 'exam': '期中',
                'exam_scope': ['数列', '函数', '平面解析几何'], 'duration_minutes': None,
                'total_points': None if any(q['points'] is None for q in units) else 20,
                'pdfs': [{'name': '原创合成示例（无来源PDF）'}], 'demo': True, 'notice': NOTICE, 'units': units}
        signature = {'algorithm': ALGORITHM, 'parameter_version': 'demo-hct-v1.1', 'parameters': PARAMETERS,
                     'dictionary_version': 'demo-types-v1', 'step_types': STEP_TYPES}
        analysis = {**signature, 'paper_id': ident, 'expected_question_ids': ['Q1', 'Q2', 'Q3'], 'questions': inputs}
        delivery = {**signature, 'paper_id': ident, 'notice': NOTICE,
                    'questions': [{'evidence': q, 'computed': score_question(q)} for q in inputs]}
        prefix = 'papers/' + ident + '/'
        for name, value in [('paper.json', meta), ('analysis-input.json', analysis), ('delivery/评分明细.json', delivery)]:
            files[prefix + name] = serialized(value)
        files[prefix + 'figures/triangle.svg'] = coordinate_svg(*coords)
        files[prefix + '转录.md'] = '# ' + meta['title'] + '\n\n> ' + NOTICE + '\n\n' + '\n\n'.join(
            f'## {q["id"]}\n\n{q["question"]}' + ('\n\n![原创坐标题图](figures/triangle.svg)' if q['figure_paths'] else '') for q in units) + '\n'
        files[prefix + '教师报告.md'] = '# 原创演示教师报告\n\n> ' + NOTICE + '\n\n' + '\n\n'.join(
            f'## {q["id"]} · {q["module"]}\n\n{q["question"]}\n\n**答案**：{q["answer"]}\n\n**解析**：{q["solution"]}\n\n**教学观察**：' +
            ('先问顶点是否位于定义域，再讨论最小值，避免把全实数上的最值条件直接套用。' if q['id']=='Q3' else '要求学生说明所用公式中的每个量来自哪里。') +
            ('\n\n**待核演示**：本题刻意不定分，从确定难度统计排除。' if q.get('pending') else '') for q in units) + '\n'
        inventory.append({k: v for k, v in meta.items() if k != 'units'})
    files['inventory.json'] = serialized({'schema_version': 1, 'demo': True, 'notice': NOTICE,
        'school_labels': {k: v + '（演示）' for k,v in SCHOOLS.items()}, 'papers': inventory,
        'missing': [{'school_key': 'xiangming', 'school_year': '2025-2026', 'reason': '模拟缺卷，用于展示2/3覆盖；并非真实资料结论。'}]})
    files['跨卷分析.md'] = '# 原创合成演示：跨卷阅读\n\n> ' + NOTICE + '\n\n共9卷、27题；其中1题刻意待核，1题配分未给出。甲校与乙校各有三个学年，丙、丁、戊校仅有2025—2026示例，己校同年模拟缺卷。\n\n各卷均含等差数列求和、坐标三角形面积和受限定义域的含参二次函数。数值变动用于体验筛选与跳转，不支持实际学校比较。\n\n题量采用唯一主模块，知识点与方法允许多标签；待核值为空，缺配分不均摊。D仅为结构规则分。\n'
    files['四章叙事.md'] = '# 原创演示：四章阅读\n\n> ' + NOTICE + '\n\n## 一、先看覆盖\n\n两所中心演示学校各有三年；己校模拟缺卷。\n\n## 二、再看共同内容\n\n所有示例使用相同三个模块，可以直接体验共同范围比较。\n\n## 三、追问方法\n\nQ3的关键是顶点与定义域的位置关系；先判断a的符号，再求最小值。\n\n## 四、使用证据\n\n阅读六维、依赖和T/B依据并复算；待核题不当作零分，配分缺失时使用等权统计。不要由演示规则分推断真实教学结论。\n'
    return files


def generate(output):
    output = Path(output).absolute()
    files = package_files()
    if output.is_symlink():
        raise FileExistsError(f'拒绝写入符号链接目录：{output}')
    if output.exists():
        if not output.is_dir() or any(p.is_symlink() for p in output.rglob('*')):
            raise FileExistsError(f'拒绝覆盖非目录或含符号链接的资料：{output}')
        actual = {p.relative_to(output).as_posix() for p in output.rglob('*') if p.is_file() or p.is_symlink()}
        if output.is_symlink() or actual != set(files) or any((output/name).is_symlink() or (output/name).read_text(encoding='utf-8') != content for name,content in files.items()):
            raise FileExistsError(f'拒绝覆盖已有目录（内容不同、缺失或含额外文件）：{output}')
        return False
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.midterms-demo-', dir=output.parent) as temporary:
        staging = Path(temporary) / 'source'
        staging.mkdir()
        for name, content in files.items():
            path = staging/name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding='utf-8')
        # rename is atomic on this filesystem; an existing nonempty directory is not overwritten.
        staging.rename(output)
    return True


def main():
    parser = argparse.ArgumentParser(description='生成9套原创合成期中演示卷；不读取、不复制真实试卷。已有目录须逐文件完全一致，否则拒绝覆盖。')
    parser.add_argument('--output', type=Path, default=ROOT/'private/midterms-demo-source', help='输出目录（默认 private/midterms-demo-source/）')
    args = parser.parse_args()
    try:
        created = generate(args.output)
    except (FileExistsError, NotADirectoryError) as error:
        parser.exit(1, str(error)+'\n')
    print(('已生成' if created else '已校验相同内容，未改写') + f'：{args.output}；原创演示9卷27题，26题定分，1题待核。')


if __name__ == '__main__':
    main()

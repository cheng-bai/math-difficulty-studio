"""Engine invariants brought over from the single-question predecessor.

The cases use an original minimal question. They do not load external exam papers.
"""
import copy
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from modules.studio.scoring import ValidationError, rounded, score_paper, score_question


def load_script():
    spec = importlib.util.spec_from_file_location('score_evidence', ROOT / 'scripts' / 'score-evidence.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SCORE = load_script()


def question():
    data = json.loads((ROOT / 'tests/fixtures/minimal-question.json').read_text(encoding='utf-8'))
    return data['questions'][0]


def evidence(dimensions, t=(0, 0, 0, 0, 1)):
    steps = []
    for index, dims in enumerate(dimensions):
        steps.append({
            'id': f's{index + 1}', 'type_id': 'T', 'input': '示例条件', 'action': '示例动作',
            'output': '示例结论', 'dependencies': [f's{index}'] if index else [],
            'dimensions': dict(zip('KRAVPI', dims)),
            'dimension_evidence': {key: '示例依据，说明该维取值。' for key in 'KRAVPI'},
        })
    return {
        'id': 'worked', 'score': 4, 'pending': False, 'steps': steps, 't': list(t),
        'T_evidence': [{'item': i + 1, 'value': value, 'evidence': '示例风险依据。'} for i, value in enumerate(t)],
        'B': 0, 'B_evidence': '示例突破依据。', 'branches': 0,
    }


class Rules(unittest.TestCase):
    def test_round_half_up_and_float_boundary(self):
        self.assertEqual(rounded(2.5), 3)
        self.assertEqual(rounded(0.5), 1)
        # 100 * 0.575 is not exactly representable in binary; half-up must still yield 58.
        trapped = score_question(evidence([(2, 2, 1, 0, 0, 1)]))
        self.assertEqual(trapped['step_scores'][0]['s'], 0.575)
        self.assertEqual(trapped['H'], 58)

    def test_exact_half_load(self):
        scored = score_question(evidence([(0, 0, 1, 0, 0, 0)]))
        self.assertEqual(scored['H'], 8)

    def test_published_two_step_example(self):
        scored = score_question(evidence([(1, 1, 1, 0, 0, 0), (1, 1, 0, 0, 0, 0)]))
        self.assertEqual((scored['H'], scored['C'], scored['T'], scored['D'], scored['band']), (30, 17, 10, 21, '基础'))
        self.assertEqual(scored['E'], 0.5475)

    def test_parallel_paths_are_not_summed(self):
        q = question()
        root = q['steps'][0]
        root['dimensions'] = {key: 2 for key in 'KRAVPI'}
        other = copy.deepcopy(root)
        other['id'] = 'other'
        q['steps'] = [root, other]
        self.assertEqual(score_question(q)['E'], 1)

    def test_equal_loads_pick_lexicographic_path(self):
        q = question()
        first = q['steps'][0]
        second = copy.deepcopy(first)
        second['id'] = 'A'
        first['id'] = 'B'
        q['steps'] = [first, second]
        self.assertEqual([step['id'] for step in score_question(q)['path']], ['A'])

    def test_dependency_depth_cap(self):
        q = question()
        template = q['steps'][0]
        q['steps'] = []
        for i in range(5):
            step = copy.deepcopy(template)
            step.update(id=str(i), dependencies=[str(i - 1)] if i else [],
                        dimensions={key: 2 for key in 'KRAVPI'})
            q['steps'].append(step)
        scored = score_question(q)
        self.assertEqual([step['d'] for step in scored['path']], [1, 1.1, 1.2, 1.3, 1.3])
        self.assertEqual(scored['E'], 5.9)

    def test_repetition_needs_evidence_and_is_path_local(self):
        q = question()
        q['steps'][0]['repeat_group'] = 'same'
        with self.assertRaises(ValidationError):
            score_question(q)
        template = question()['steps'][0]
        q['steps'] = []
        for i in range(4):
            step = copy.deepcopy(template)
            step.update(id=str(i), dependencies=[str(i - 1)] if i else [],
                        dimensions={key: 2 for key in 'KRAVPI'}, repeat_group='mechanical',
                        repeat_evidence='测试用重复同一代入动作；非推理步骤')
            q['steps'].append(step)
        self.assertEqual([step['r'] for step in score_question(q)['path']], [1, 0.7, 0.4, 0.4])

    def test_pending_is_not_zero_and_marks_are_not_fabricated(self):
        pending = {'id': 'p', 'pending': True, 'issue': '题干版本冲突', 'score': 5}
        paper = score_paper([pending])
        self.assertIsNone(paper['statistics']['mean'])
        self.assertEqual(paper['statistics']['valid'], 0)
        self.assertIsNone(paper['questions'][0]['D'])
        q = question()
        q['score'] = None
        missing = score_paper([q])
        self.assertIsNone(missing['statistics']['whole_paper_weighted_mean'])
        self.assertEqual(missing['statistics']['known_points'], 0)

    def test_weighted_full_subset_and_studio_scope_wording(self):
        q = question()
        q['score'] = 4
        full = score_paper([q])
        self.assertEqual(full['engine'], '0.1.2')
        self.assertEqual(full['statistics']['whole_paper_weighted_mean'], full['questions'][0]['D'])
        self.assertEqual(full['statistics']['weighted_scope'], '输入范围内分值已知且全部定分（未独立核验原卷清单）')
        partial = score_paper([q, {'id': 'pending', 'pending': True, 'issue': '缺图', 'score': 6}])
        self.assertEqual(partial['statistics']['known_points_coverage'], 0.4)
        self.assertIsNone(partial['statistics']['whole_paper_weighted_mean'])

    def test_invalid_evidence_is_rejected(self):
        q = question()
        q['steps'][0]['dependencies'] = [q['steps'][0]['id']]
        with self.assertRaises(ValidationError):
            score_question(q)
        q = question()
        q['steps'][0]['dependencies'] = ['missing']
        with self.assertRaises(ValidationError):
            score_question(q)
        q = question()
        q['t'][0] = None
        with self.assertRaises(ValidationError):
            score_question(q)
        q = question()
        q['steps'][0]['dimension_evidence']['R'] = ''
        with self.assertRaises(ValidationError):
            score_question(q)
        q = question()
        q['steps'][0]['dimensions']['K'] = True
        with self.assertRaises(ValidationError):
            score_question(q)

    def test_b_does_not_change_d_and_stale_scores_are_ignored(self):
        before = score_question(question())
        changed = question()
        changed['B'] = 3
        self.assertEqual(before['D'], score_question(changed)['D'])
        stale = question()
        stale.update(H=100, C=100, T=100, D=100)
        stale['steps'][0]['s'] = 1
        self.assertEqual(before, score_question(stale))

    def test_duplicate_ids_rejected_inside_one_analysis_unit(self):
        q = question()
        other = copy.deepcopy(q)
        q['year'] = 2023
        other['year'] = 2024
        with self.assertRaises(ValidationError):
            score_paper([q, other])

    def test_review_flag_covers_low_d_high_b_and_many_branches(self):
        low = evidence([(0, 0, 0, 0, 0, 0)])
        low['B'] = 2
        self.assertTrue(score_question(low)['review_flag'])
        branched = question()
        branched['branches'] = 3
        self.assertTrue(score_question(branched)['review_flag'])
        self.assertFalse(score_question(question())['review_flag'])

    def test_path_limit(self):
        q = question()
        other = copy.deepcopy(q['steps'][0])
        other['id'] = 'other'
        q['steps'] = [q['steps'][0], other]
        with self.assertRaises(ValidationError):
            score_question(q, max_paths=1)

    def test_cli_scores_one_question_and_refuses_to_overwrite_evidence(self):
        lone = question()
        self.assertEqual(SCORE.score_input(lone)['question'], score_question(lone))
        self.assertNotIn('statistics', SCORE.score_input(lone))
        wrapped = {'questions': [lone]}
        self.assertEqual(SCORE.score_input(wrapped)['engine'], '0.1.2')
        with self.assertRaises(ValidationError):
            SCORE.score_input({**lone, 'questions': [lone]})
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'source.json'
            source.write_text(json.dumps(wrapped), encoding='utf-8')
            before = source.read_bytes()
            dest = Path(folder) / 'result.json'
            run = subprocess.run([sys.executable, str(ROOT / 'scripts/score-evidence.py'), str(source), '--output', str(dest)],
                                 capture_output=True, text=True)
            self.assertEqual(run.returncode, 0, run.stderr)
            self.assertEqual(json.loads(dest.read_text(encoding='utf-8'))['questions'][0]['id'], 'example-1')
            overwrite = subprocess.run([sys.executable, str(ROOT / 'scripts/score-evidence.py'), str(source), '--output', str(source)],
                                       capture_output=True, text=True)
            self.assertEqual(overwrite.returncode, 2)
            self.assertEqual(source.read_bytes(), before)


if __name__ == '__main__':
    unittest.main()

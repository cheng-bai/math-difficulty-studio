"""Original-demo package contract: scoring, safe generation and exact math."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('midterms_demo', ROOT/'scripts/setup-midterms-demo.py')
demo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(demo)


class MidtermsDemoTests(unittest.TestCase):
    def test_generation_and_recompute(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp)/'source'
            self.assertTrue(demo.generate(target))
            inventory = json.loads((target/'inventory.json').read_text())
            self.assertTrue(inventory['demo'])
            self.assertEqual(len(inventory['papers']), 9)
            self.assertEqual(inventory['missing'][0]['school_key'], 'xiangming')
            self.assertEqual(sum(p['school_key']=='jianping' for p in inventory['papers']), 3)
            self.assertEqual(sum(p['school_key']=='gezhi' for p in inventory['papers']), 3)
            signatures, valid, pending, missing_points = set(), 0, 0, 0
            for paper in inventory['papers']:
                directory = target/'papers'/paper['id']
                analysis = json.loads((directory/'analysis-input.json').read_text())
                delivered = json.loads((directory/'delivery/评分明细.json').read_text())
                metadata = json.loads((directory/'paper.json').read_text())
                signatures.add(json.dumps({k:analysis[k] for k in ('algorithm','parameter_version','parameters','dictionary_version','step_types')}, sort_keys=True))
                self.assertEqual(analysis['expected_question_ids'], ['Q1', 'Q2', 'Q3'])
                self.assertIn('原创', (directory/'转录.md').read_text())
                self.assertIn('**答案**', (directory/'教师报告.md').read_text())
                self.assertNotIn('**答案**', (directory/'转录.md').read_text())
                self.assertTrue((directory/'figures/triangle.svg').is_file())
                self.assertNotIn('<script', (directory/'figures/triangle.svg').read_text())
                for unit, evidence, record in zip(metadata['units'], analysis['questions'], delivered['questions']):
                    self.assertEqual(record['computed'], demo.score_question(evidence))
                    missing_points += unit['points'] is None
                    if record['computed']['pending']:
                        pending += 1
                        self.assertIsNone(record['computed']['D'])
                        self.assertIn('刻意', evidence['issue'])
                    else:
                        valid += 1
                        self.assertEqual(len(evidence['T_evidence']), 5)
                        self.assertEqual(set(evidence['steps'][0]['dimensions']), set('KRAVPI'))
            self.assertEqual(len(signatures), 1)
            self.assertEqual((valid, pending, missing_points), (26, 1, 1))

    def test_identical_reentry_preserves_mtime_and_change_is_refused(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp)/'source'
            demo.generate(target)
            path = target/'inventory.json'
            before = path.stat().st_mtime_ns
            self.assertFalse(demo.generate(target))
            self.assertEqual(path.stat().st_mtime_ns, before)
            path.write_text('user data')
            with self.assertRaises(FileExistsError):
                demo.generate(target)
            self.assertEqual(path.read_text(), 'user data')

    def test_extra_file_and_missing_file_refused(self):
        for alteration in ('extra', 'missing'):
            with self.subTest(alteration=alteration), tempfile.TemporaryDirectory() as temp:
                target = Path(temp)/'source'
                demo.generate(target)
                if alteration == 'extra':
                    (target/'user-input.md').write_text('keep')
                else:
                    (target/'inventory.json').unlink()
                with self.assertRaises(FileExistsError):
                    demo.generate(target)

    def test_refuse_empty_existing_directory(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(FileExistsError):
                demo.generate(Path(temp))

    def test_symlink_target_refused(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp)/'link'
            target.symlink_to(Path(temp)/'missing', target_is_directory=True)
            with self.assertRaises(FileExistsError):
                demo.generate(target)
            self.assertTrue(target.is_symlink())

    def test_cli_help(self):
        result = subprocess.run([sys.executable, str(ROOT/'scripts/setup-midterms-demo.py'), '--help'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0)
        self.assertIn('--output', result.stdout)

    def test_exact_answer_and_domain_boundary(self):
        # Independent arithmetic and geometry checks for the first original set.
        units, evidence, coords = demo.questions(0)
        self.assertEqual(sum((2, 4, 6, 8, 10)), 30)
        self.assertEqual(units[0]['answer'], '$S_{5}=30$。')
        self.assertEqual(coords, (4, 3))
        self.assertEqual(units[1]['answer'], '$6$。')
        self.assertEqual(units[2]['answer'], '$a\\le 1$。')
        # Negative a must survive the restricted-domain problem, although the
        # unrestricted discriminant test would incorrectly exclude a=-2.
        for a in (-2, 0, 1):
            for x in (0, .5, 1, 2, 10):
                self.assertGreaterEqual(x*x-2*a*x+1, 0)
        self.assertEqual(1*1-2*1*1+1, 0)
        for a in (1.01, 2, 10):
            self.assertLess(a*a-2*a*a+1, 0)
        self.assertEqual(evidence[2]['branches'], 2)
        self.assertEqual(evidence[2]['steps'][-1]['dependencies'], ['s2','s3'])


if __name__ == '__main__':
    unittest.main()

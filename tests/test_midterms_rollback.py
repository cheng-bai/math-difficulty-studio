import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('rollback_midterms', ROOT/'scripts/rollback-midterms.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RollbackTests(unittest.TestCase):
    def fixture(self, root):
        old, new = 'a'*64, 'b'*64
        (root/'current.json').write_text(json.dumps({'releaseId': new}))
        release = root/'releases'/old
        release.mkdir(parents=True)
        items = []
        for name, content in [('index.html', b'<h1>Original fixture</h1>'), ('data.json', b'{}')]:
            (release/name).write_bytes(content)
            items.append(dict(path=name,bytes=len(content),sha256=hashlib.sha256(content).hexdigest()))
        (release/'manifest.json').write_text(json.dumps(dict(releaseId=old,artifacts=items)))
        return old,new,release

    def test_verified_switch_and_releases_are_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);old,new,release=self.fixture(root)
            before=(release/'index.html').read_bytes()
            result=module.rollback(old,root,expected=new)
            self.assertEqual(json.loads((root/'current.json').read_text())['releaseId'],old)
            self.assertEqual(result['previousReleaseId'],new)
            self.assertEqual((release/'index.html').read_bytes(),before)

    def test_tampering_does_not_switch_pointer(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);old,new,release=self.fixture(root)
            original=(root/'current.json').read_bytes()
            (release/'data.json').write_text('tampered')
            with self.assertRaisesRegex(ValueError,'integrity'):
                module.rollback(old,root)
            self.assertEqual((root/'current.json').read_bytes(),original)

    def test_stale_expected_release_and_path_traversal_are_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);old,new,release=self.fixture(root)
            with self.assertRaisesRegex(ValueError,'changed'):
                module.rollback(old,root,expected=old)
            manifest=json.loads((release/'manifest.json').read_text())
            manifest['artifacts'][0]['path']='../outside.html'
            (release/'manifest.json').write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError,'artifact path'):
                module.rollback(old,root)
            self.assertEqual(json.loads((root/'current.json').read_text())['releaseId'],new)

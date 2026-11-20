"""Reference step dictionary: stable ids and real inclusion boundaries."""
import json
import unittest
from pathlib import Path

PATH = Path(__file__).resolve().parents[1] / 'content/reference/step-types.json'


class StepTypes(unittest.TestCase):
    def test_reference_dictionary_has_distinct_boundaries(self):
        data = json.loads(PATH.read_text(encoding='utf-8'))
        self.assertEqual(data['version'], 'EDA-1.0')
        self.assertEqual(data['role'], 'reference')
        ids = [item['id'] for item in data['types']]
        self.assertEqual(ids, [f'T{i:02d}' for i in range(1, 25)])
        for item in data['types']:
            for key in ('name', 'definition', 'include', 'exclude'):
                self.assertTrue(str(item[key]).strip(), item['id'])
            self.assertNotEqual(item['include'], item['exclude'])
        blob = PATH.read_text(encoding='utf-8')
        self.assertNotIn('上海', blob)
        self.assertNotIn('高考', blob)


if __name__ == '__main__':
    unittest.main()

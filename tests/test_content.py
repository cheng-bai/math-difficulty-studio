import copy,json,sys,tempfile,unittest
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from modules.studio.repository import Repository
from modules.studio.domain import load,digest
from modules.studio.rendering import markdown

class ContentTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.repo=Repository(ROOT,Path(self.temp.name)/'store');self.initial=self.repo.init()
 def tearDown(self):self.temp.cleanup()
 def change(self,uid='2',request='demo-test'):
  _,units=self.repo.sources();u=copy.deepcopy(units[uid]);u['revision']+=1
  return dict(schema_version='studio-change-v1',requestId=request,expectedReleaseId=self.repo.pointer()['releaseId'],paperId='demo',reason='isolated test',units=[dict(expectedRevision=u['revision']-1,value=u)])
 def artifact(self,name,rid=None):return load(self.repo.release(rid or self.repo.pointer()['releaseId'])/'artifacts'/name)
 def test_demo_math_pending_and_denominators(self):
  d=self.artifact('national/demo/分析数据.json');self.assertEqual(d['stats']['total'],3);self.assertEqual(d['stats']['valid'],2);self.assertEqual(d['stats']['pending'],1)
  self.assertEqual(d['items'][0]['D'],0);self.assertIn('[1,3]',d['items'][1]['answer']);self.assertIsNone(d['items'][2]['D'])
  self.assertEqual(d['stats']['mean'],sum(q['D'] for q in d['items'] if q['D'] is not None)/2)
 def test_change_propagates_and_other_units_stay_equal(self):
  before=self.artifact('national/demo/分析数据.json');c=self.change();c['units'][0]['value']['analysis_input']['risks'][0]['value']=2
  rid=self.repo.apply(c);after=self.artifact('national/demo/分析数据.json');q=after['items'][1];self.assertNotEqual(q['D'],before['items'][1]['D'])
  self.assertEqual([q for q in before['items'] if q['id']!='2'],[q for q in after['items'] if q['id']!='2'])
  catalog=self.artifact('catalog.json')[0];self.assertEqual(catalog['stats'],after['stats']);self.assertEqual(next(r for r in self.artifact('search.json')['records'] if r['unit']=='2')['D'],q['D'])
  text=(self.repo.release(rid)/'artifacts/national/demo/试卷难度分析.html').read_text();self.assertIn(f'{after["stats"]["mean"]:.2f}',text);self.assertNotIn('@@',text)
 def test_preview_idempotence_conflicts_and_rollback(self):
  c=self.change();stale=self.change('1','stale');self.repo.preview(c);self.assertEqual(self.repo.pointer()['releaseId'],self.initial)
  rid=self.repo.apply(c);self.assertEqual(self.repo.apply(c),rid)
  bad=copy.deepcopy(c);bad['reason']='different payload'
  with self.assertRaisesRegex(ValueError,'requestId'):self.repo.apply(bad)
  with self.assertRaisesRegex(ValueError,'发布版本'):self.repo.apply(stale)
  c=self.change(request='wrong-paper');c['paperId']='other'
  with self.assertRaisesRegex(ValueError,'试卷ID'):self.repo.apply(c)
  self.repo.rollback(self.initial,rid);self.assertEqual(self.repo.pointer()['releaseId'],self.initial)
  self.assertEqual(self.repo.apply({**bad,'reason':'isolated test'}),rid);self.assertEqual(self.repo.pointer()['releaseId'],self.initial)
 def test_atomic_failure(self):
  c=self.change();before=(self.repo.store/'current.json').read_bytes()
  with self.assertRaises(RuntimeError):self.repo.apply(c,fail=True)
  self.assertEqual((self.repo.store/'current.json').read_bytes(),before);self.repo.check()
 def test_schema_math_html_and_assets(self):
  c=self.change();c['units'][0]['value']['D']=99
  with self.assertRaises(Exception):self.repo.apply(c)
  c=self.change();c['units'][0]['value']['content']['solution']='$\\notARealMacro$'
  with self.assertRaisesRegex(ValueError,'KaTeX'):self.repo.apply(c)
  self.assertNotIn('<script>',markdown('<script>alert(1)</script>\n\n$x^2$'))
  with self.assertRaises(ValueError):markdown('![image][remote]\n\n[remote]: https://example.test/image.png')
 def test_concurrent_changes_and_integrity(self):
  def apply(c):
   try:return self.repo.apply(c)
   except ValueError:return 'conflict'
  changes=[self.change('1','a'),self.change('2','b')]
  with ThreadPoolExecutor(2) as executor:results=list(executor.map(apply,changes))
  self.assertEqual(results.count('conflict'),1)
  p=self.repo.release(self.repo.pointer()['releaseId'])/'artifacts/collection.json';p.write_text('{}')
  with self.assertRaisesRegex(ValueError,'完整性'):self.repo.check()

if __name__=='__main__':unittest.main()

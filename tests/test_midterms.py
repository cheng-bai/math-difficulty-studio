import csv
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SITE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('midterms_import',SITE/'scripts/import-midterms.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class MidtermsTests(unittest.TestCase):
    def test_curriculum_frequency_separates_years_questions_pending_and_missing(self):
        def paper(year, units, conflict=False):
            return dict(id='jianping-'+year,school_key='jianping',school_year=year,
                        url='/reader/'+year,year_conflict=conflict,exam_scope='数列',units=units)
        def unit(ident, scored):
            return dict(id=ident,module='数列',topics=['等差数列','等差数列'],
                        computed={'D':20} if scored else None,url='/reader/#'+ident)
        result=module.curriculum_statistics([
            paper('2023-2024',[unit('q1',True),unit('q2',True)]),
            paper('2024-2025',[unit('q3',False)]),
            paper('2025-2026',[unit('q4',True)],conflict=True)])
        self.assertEqual(len(result['targets']),10)
        self.assertEqual(sum(t['available'] for t in result['targets']),2)
        row=next(r for r in result['frequency'] if r['kind']=='原考点标签')
        self.assertEqual(row['label'],'等差数列')
        self.assertEqual((row['observed_years'],row['available_years'],row['expected_years']),(1,2,3))
        self.assertEqual([y['count'] for y in row['years']],[2,0,None])
        self.assertEqual([y['pending'] for y in row['years']],[0,1,None])
        self.assertEqual([q['id'] for q in row['years'][0]['questions']],['q1','q2'])
        self.assertIsNone(result['progress'][2]['classroom_schedule'])
        self.assertIsNone(result['progress'][2]['total'])

    def fixture(self, root, points=(5,10,None), pending=False):
        paper = {'id':'jianping-2025-2026','school':'建平中学','school_key':'jianping',
                 'school_year':'2025-2026','title':'期中试卷','grade':'高二','term':'上学期','exam':'期中',
                 'total_points':30,'pdfs':[{'name':'试题.pdf','path':'/'+ 'Users' + '/private/file.pdf'}, {'name':'答案.pdf'}],
                 'units':[{'id':f'q{i+1}','points':p,'module':'数列' if i<2 else '圆锥曲线',
                           'methods':['递推','递推'],'question':'已知 $x=1$，求 $x+1$。',
                           'answer':'$2$','solution':'由 $1+1=2$ 得到。','verification_status':'已核验',
                           'pending':pending if i==0 else i==2} for i,p in enumerate(points)]}
        (root/'inventory.json').write_text(json.dumps({'papers':[paper,paper]}))
        directory=root/'papers'/paper['id']
        directory.mkdir(parents=True)
        (directory/'paper.json').write_text(json.dumps(paper))
        (directory/'转录.md').write_text('# 完整转录\n\n原题 $x+1$。\n\n<script>alert(1)</script>\n\n来源 /'+'Users'+'/private/secret.pdf')
        delivery=directory/'delivery'
        delivery.mkdir()
        result={'algorithm':'HCT-rules-v1.1','paper_id':paper['id'],'questions':[]}
        for i in range(3):
            result['questions'].append({'evidence':{'id':f'q{i+1}','verification_status':'已核验',
                                                  'pending':i==2,'score':points[i]},
                                        'computed':{'id':f'q{i+1}','H':20+i*10,'C':20,'T':10,'D':20+i*20,
                                                    'B':i,'pending':i==2,'branches':0,'review_flag':False}})
        (delivery/'评分明细.json').write_text(json.dumps(result))
        return paper,directory,result

    def test_denominators_pending_and_deduplicated_tags(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);paper,directory,_=self.fixture(root)
            normalized=module.normalize_paper(paper,directory,[])
            self.assertEqual(normalized['units'][0]['methods'],['递推'])
            stat=normalized['statistics']
            self.assertEqual(stat['valid'],2)
            self.assertEqual(stat['total'],3)
            self.assertEqual(stat['mean_D'],30)
            self.assertEqual(stat['question_coverage'],2/3)
            self.assertEqual(stat['point_coverage'],.5)
            self.assertIsNone(stat['weighted_D'])
            self.assertIsNone(normalized['units'][2]['computed'])

    def test_reader_overview_keeps_pending_out_of_difficulty_and_empty_values(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);paper,directory,_=self.fixture(root)
            normalized=module.normalize_paper(paper,directory,[])
            visuals,outline=module.reader_visuals(normalized)
            self.assertIn('分母 2 个有效小问；待核 / 未评分 1 问',visuals)
            self.assertIn('待核，尚未定分',visuals)
            self.assertEqual(visuals.count('<rect '),2)
            self.assertIn('data-outline-query="q3',outline)
            self.assertIn('href="#unit-3"',outline)
            normalized['units']=[]
            normalized['statistics'].update(mean_D=None,bands=[0,0,0])
            visuals,_=module.reader_visuals(normalized)
            self.assertIn('小问内容待整理',visuals)
            self.assertNotIn('nan',visuals.lower())

    def test_partial_weighted_index_requires_complete_subquestion_marks(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);paper,directory,_=self.fixture(root,(5,10,15))
            normalized=module.normalize_paper(paper,directory,[])
            self.assertAlmostEqual(normalized['statistics']['weighted_D'],100/3)
            self.assertEqual(normalized['statistics']['point_coverage'],.5)

    def test_pending_paper_status_cannot_inherit_score(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);paper,directory,_=self.fixture(root,pending=True)
            normalized=module.normalize_paper(paper,directory,[])
            self.assertIsNone(normalized['units'][0]['computed'])
            self.assertEqual(normalized['statistics']['valid'],1)

    def test_repeatable_release_preview_csv_and_source_integrity(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)/'source';root.mkdir()
            _,directory,_=self.fixture(root)
            target=Path(temp)/'published'
            originals={str(p.relative_to(root)):p.read_bytes() for p in root.rglob('*') if p.is_file()}
            preview=module.build(root,target,False)
            self.assertFalse(target.exists())
            first=module.build(root,target,True)
            again=module.build(root,target,True)
            self.assertEqual(first['releaseId'],again['releaseId'])
            self.assertEqual(first['releaseId'],preview['releaseId'])
            self.assertEqual(first['papers'],1)
            self.assertEqual(first['valid'],2)
            self.assertEqual(first['formulas']['errors'],0)
            release=target/'releases'/first['releaseId']
            reader=(release/'papers/jianping-2025-2026/index.html').read_text()
            self.assertIn('class="katex"',reader)
            self.assertNotIn('/Users/',reader)
            self.assertNotIn('<script>alert(1)</script>',reader)
            self.assertNotIn('<b>False</b>',reader)
            for section in ['paper-overview','paper-burden','paper-knowledge','paper-questions','reader-outline']:
                self.assertIn('id="'+section+'"',reader)
            self.assertIn('assets/reader.js',reader)
            summary=json.loads((release/'data.json').read_text())
            self.assertIsNone(summary['papers'][0]['units'][2]['computed'])
            self.assertEqual(len(summary['curriculum']['targets']),10)
            for name in ['targets.csv','progress.csv','frequency.csv']:
                self.assertTrue((release/name).exists())
                self.assertIn(name,(release/'index.html').read_text())
            with (release/'papers/jianping-2025-2026/units.csv').open(encoding='utf-8-sig') as f:
                rows=list(csv.DictReader(f))
            self.assertEqual(rows[2]['D'],'')
            self.assertEqual(rows[0]['D'],'20')
            self.assertEqual(originals,{str(p.relative_to(root)):p.read_bytes() for p in root.rglob('*') if p.is_file()})

    def test_narrative_changes_create_new_immutable_release(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)/'source';root.mkdir()
            self.fixture(root)
            target=Path(temp)/'published'
            first=module.build(root,target,True)
            (root/'四章叙事.md').write_text('# 示例导引\n\n前导声明不占章位。\n\n## 材料处理\n\n新的阅读导引。\n\n## 单卷观察\n\n第二章内容。\n\n## 对齐\n\n第三章内容。\n\n## 趋势\n\n最后一章内容。')
            second=module.build(root,target,True)
            self.assertNotEqual(first['releaseId'],second['releaseId'])
            again=module.build(root,target,True)
            self.assertEqual(second['releaseId'],again['releaseId'])
            html=(target/'releases'/second['releaseId']/'index.html').read_text()
            self.assertIn('新的阅读导引',html.split('id="act-0"')[1].split('id="act-1"')[0])
            self.assertIn('最后一章内容',html.split('id="act-3"')[1])
            self.assertNotIn('前导声明不占章位',html)
            self.assertTrue((target/'releases'/first['releaseId']/'index.html').exists())

    def test_custom_school_labels_are_escaped_in_reader_products(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)/'source';root.mkdir()
            self.fixture(root)
            inventory=json.loads((root/'inventory.json').read_text())
            inventory.update(demo=True,school_labels={'jianping':'<img src=x onerror=alert(1)>'})
            (root/'inventory.json').write_text(json.dumps(inventory))
            target=Path(temp)/'published'
            result=module.build(root,target,True)
            html=(target/'releases'/result['releaseId']/'index.html').read_text()
            self.assertNotIn('<img src=x onerror=alert(1)>',html)
            self.assertIn('&lt;img src=x onerror=alert(1)&gt;',html)

    def test_figure_only_revision_changes_release_and_preserves_old_snapshot(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)/'source';root.mkdir()
            paper,directory,_=self.fixture(root)
            figure=directory/'figures'/'triangle.svg'
            figure.parent.mkdir()
            figure.write_text('<svg xmlns="http://www.w3.org/2000/svg"><text>old</text></svg>')
            paper['units'][0]['figure_paths']=['figures/triangle.svg']
            (directory/'paper.json').write_text(json.dumps(paper))
            target=Path(temp)/'published'
            first=module.build(root,target,True)
            figure.write_text('<svg xmlns="http://www.w3.org/2000/svg"><text>corrected</text></svg>')
            second=module.build(root,target,True)
            self.assertNotEqual(first['releaseId'],second['releaseId'])
            for result,expected in [(first,'old'),(second,'corrected')]:
                images=list((target/'releases'/result['releaseId']/'assets'/'figures').glob('*.svg'))
                self.assertEqual(len(images),1)
                self.assertIn('>'+expected+'<',images[0].read_text())
            narrative_figure=root/'notes'/'.overview.svg'
            narrative_figure.parent.mkdir()
            narrative_figure.write_text('<svg/>')
            before=module.input_digest(root)
            narrative_figure.write_text('<svg><title>revised</title></svg>')
            self.assertNotEqual(before,module.input_digest(root))

    def test_conflicting_duplicates_and_duplicated_points_fail(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);paper,directory,result=self.fixture(root,(20,20,10))
            with self.assertRaisesRegex(ValueError,'exceed'):
                module.normalize_paper(paper,directory,[])
            paper['units'].append({**paper['units'][0],'question':'冲突'})
            with self.assertRaisesRegex(ValueError,'conflicting duplicate'):
                module.normalize_paper(paper,directory,[])

    def test_empty_paper_has_no_fabricated_coverage(self):
        value=module.stats([],None)
        self.assertIsNone(value['question_coverage'])
        self.assertIsNone(value['mean_D'])
        self.assertIsNone(value['weighted_D'])

    def test_risk_formulas_duration_and_summary_exports(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)/'source';root.mkdir()
            paper,directory,result=self.fixture(root,(5,10,15))
            paper['duration_minutes']=120
            paper['exam_scope']='椭圆与空间几何'
            (directory/'paper.json').write_text(json.dumps(paper))
            result['questions'][0]['evidence']['T_evidence']=[
                {'item':1,'value':0,'evidence':r'角为 $90^\circ$，不用搜索。'}]
            (directory/'delivery/评分明细.json').write_text(json.dumps(result))
            release=module.build(root,Path(temp)/'published',True)
            self.assertEqual(release['formulas']['errors'],0)
            folder=Path(temp)/'published/releases'/release['releaseId']
            data=json.loads((folder/'data.json').read_text())
            self.assertEqual(data['papers'][0]['duration'],120)
            self.assertEqual(data['papers'][0]['exam_scope'],'椭圆与空间几何')
            with (folder/'summary.csv').open(encoding='utf-8-sig') as f:
                rows=list(csv.DictReader(f))
            self.assertEqual(rows[0]['valid'],'2')
            self.assertEqual(rows[0]['duration_minutes'],'120')
            with (folder/'units.csv').open(encoding='utf-8-sig') as f:
                units=list(csv.DictReader(f))
            self.assertEqual(units[2]['D'],'')


if __name__=='__main__':
    unittest.main()

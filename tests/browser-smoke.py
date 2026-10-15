"""Private-reader smoke test with an isolated synthetic account."""
import hashlib,json,os,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
base=sys.argv[1];root=Path(__file__).resolve().parents[1];out=root/'test-results';out.mkdir(exist_ok=True);checks=[]
def check(name,ok):
 if not ok:raise AssertionError(name)
 checks.append(name)
with sync_playwright() as p:
 options={'headless':True}
 if os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE'):options['executable_path']=os.environ['PLAYWRIGHT_CHROMIUM_EXECUTABLE']
 browser=p.chromium.launch(**options);context=browser.new_context(viewport={'width':1280,'height':900});page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 check('anonymous requires login',context.request.get(base+'/',max_redirects=0).status in [303,307])
 r=context.request.post(base+'/api/login',data={'username':'fixture','password':'browser-fixture-password'},headers={'Origin':base});check('fixture login',r.status==200)
 page.goto(base+'/');page.locator('[data-content-release]').wait_for();rid=page.locator('[data-content-release]').get_attribute('data-content-release');check('demo totals','3 个分析单元 · 2 个已定分 · 1 个待核' in page.inner_text('main'))
 page.goto(base+'/national/试卷总览.html');check('one original collection',page.locator('.card').count()==1)
 r=page.goto(base+'/national/demo/试卷难度分析.html#q=2');page.wait_for_function("()=>window.dashboard&&dashboard.state.current==='2'");check('same content release',r.headers.get('x-content-release')==rid)
 check('correct original answer','[1,3]' in page.evaluate('dashboard.data.items[1].answer'))
 for uid in ['1','2','3']:
  page.evaluate('(uid)=>dashboard.choose(uid)',uid);check('stable unit '+uid,page.locator('#panel').get_attribute('data-unit-id')==uid)
  for tab in ['dimensions','risk','solution']:
   page.locator('#tab-'+tab).click();check('tab '+uid+'/'+tab,page.locator('#tab-'+tab).get_attribute('aria-selected')=='true')
 check('all math renders',page.evaluate('window.__mathErrors.length')==0)
 page.evaluate("()=>dashboard.choose('2')");page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(out/'demo-mobile.png'),full_page=True);check('mobile width',page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
 auth={'Cookie':'; '.join(c['name']+'='+c['value'] for c in context.cookies())}
 data=context.request.get(base+'/national/demo/分析数据.json',headers=auth);check('download same snapshot',data.status==200 and data.headers.get('x-content-release')==rid and data.json()==page.evaluate('dashboard.data'))
 for url in ['/national/manifest.json','/national/source/demo/1.json','/private/studio/current.json','/.env.local']:
  check('private file blocked '+url,context.request.get(base+url,headers=auth).status==404)
 check('OCR closed outside local mode',context.request.get(base+'/api/ocr/tasks',headers=auth).status==403)
 check('third-party runtime asset',context.request.get(base+'/vendor/katex/katex.min.js').status==200)
 page.goto(base+'/search');check('search same release',page.locator('[data-content-release]').get_attribute('data-content-release')==rid);check('search rows',page.locator('[data-record-id]').count()==3)
 page.goto(base+'/workbench');check('workbench',page.locator('h1').count()==1);check('no private report links',page.locator('[href*="workbench/results"]').count()==0)
 # Midterms use only the generated original demo in this public checkout.
 page.set_viewport_size({'width':1440,'height':1050})
 page.goto(base+'/midterms');page.locator('#paper-cards .paper-card').first.wait_for()
 demo=page.locator('#midterms-data').evaluate('(e)=>JSON.parse(e.textContent)')
 check('midterms synthetic disclosure',demo['demo'] is True and '原创演示数据' in page.inner_text('main'))
 check('midterms demo totals',len(demo['papers'])==9 and sum(len(p['units']) for p in demo['papers'])==27 and sum(bool(q['computed']) for p in demo['papers'] for q in p['units'])==26)
 check('virtual school labels',all('演示' in row['name'] for row in demo['schools']))
 check('target missing slot retained',sum(t['available'] for t in demo['curriculum']['targets'])==9)
 check('midterms has no formula errors',page.locator('.math-error,.katex-error').count()==0)
 images=root/'docs/images';images.mkdir(parents=True,exist_ok=True)
 page.screenshot(path=str(images/'midterms-overview.png'))
 page.locator('[data-view="gezhi-horizontal"]').click();check('partial horizontal coverage','2/3' in page.locator('#selection-note').inner_text())
 for name in ['summary.csv','units.csv','targets.csv','progress.csv','frequency.csv']:
  response=context.request.get(base+'/midterms/'+name,headers=auth);check('midterms download '+name+' status='+str(response.status)+' disposition='+response.headers.get('content-disposition','missing'),response.status==200 and 'filename="midterms-'+name+'"' in response.headers.get('content-disposition',''))
 for paper in demo['papers']:
  page.goto(base+'/midterms/papers/'+paper['id']+'/index.html')
  check('reader unit count '+paper['id'],page.locator('.question-block').count()==len(paper['units']))
  check('reader formulas '+paper['id'],page.locator('.math-error,.katex-error').count()==0 and page.locator('.katex').count()>0)
  page.evaluate("()=>document.querySelectorAll('img').forEach(i=>i.loading='eager')")
  page.wait_for_function('()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0)')
  check('reader links '+paper['id'],page.locator('#reader-outline a').evaluate_all('(as)=>as.every(a=>document.getElementById(a.hash.slice(1)))'))
 page.goto(base+'/midterms/papers/jianping-2025-2026/index.html');page.locator('#paper-overview').scroll_into_view_if_needed()
 page.screenshot(path=str(images/'midterms-reader.png'))
 page.locator('#reader-compare-toggle').click();page.select_option('#reader-diagnosis-pick',index=0)
 check('two evidence cards',page.locator('#reader-pair-cards article').count()==2 and page.locator('#reader-pair').is_visible())
 page.locator('#reader-explore-reset').click();check('comparison reset',page.locator('#reader-pair').is_hidden())
 page.locator('#reader-outline-search').fill('never-a-matching-topic');check('outline no result',page.locator('#reader-outline-empty').is_visible());page.locator('#reader-outline-search').fill('')
 page.goto(base+'/midterms/papers/huaer-2025-2026/index.html');page.select_option('#reader-explore-band','pending')
 check('pending only hides SVG dots',page.locator('.reader-risk-point:visible').count()==0 and page.locator('#reader-diagnosis-pick option').count()==1)
 page.locator('#reader-explore-reset').click();check('reset restores SVG dots',page.locator('.reader-risk-point:visible').count()==2)
 page.select_option('#reader-explore-band','2');check('empty filter disables evidence selection',page.locator('#reader-explore-empty').is_visible() and page.locator('#reader-diagnosis-pick').is_disabled())
 page.locator('#reader-explore-reset').click()
 anon=browser.new_context()
 for url in ['/midterms','/midterms/data.json','/midterms/units.csv','/midterms/assets/reader.js',demo['papers'][0]['url']]:
  response=anon.request.get(base+url,max_redirects=0);check('midterms anonymous blocked '+url,response.status in [303,307] and '/login?next=' in response.headers.get('location',''))
 deep='/midterms/papers/jianping-2025-2026/index.html';page2=anon.new_page();page2.goto(base+deep)
 check('login return path retained','next=' in page2.url and 'jianping-2025-2026' in page2.url)
 page2.get_by_label('账号',exact=True).fill('fixture');page2.get_by_label('密码',exact=True).fill('browser-fixture-password');page2.get_by_role('button',name='进入研究室').click();page2.wait_for_url('**/papers/jianping-2025-2026/index.html')
 check('real login returns to midterm',page2.locator('#reader-outline').count()==1);anon.close()
 page.set_viewport_size({'width':390,'height':844});page.goto(base+'/midterms/papers/jianping-2025-2026/index.html')
 check('mobile reader fits',page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
 check('mobile outline collapsed',page.locator('#reader-outline').get_attribute('open') is None)
 page.screenshot(path=str(images/'midterms-mobile.png'))
 page.locator('#reader-outline>summary').click();page.locator('.reader-outline-questions a').nth(1).click()
 check('mobile outline jumps and closes',page.url.endswith('#unit-2') and page.locator('#reader-outline').get_attribute('open') is None)
 page.goto(base+'/midterms');check('mobile midterms fits',page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
 provenance={'source':'Original synthetic data generated by scripts/setup-midterms-demo.py','releaseId':json.loads((root/'private/midterms/current.json').read_text())['releaseId'],'images':[{'path':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(images.glob('*.png'))]}
 (images/'screenshots.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+'\n')
 check('no browser errors',not errors);browser.close()
(out/'browser-smoke.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'errors':errors},ensure_ascii=False,indent=2));print(json.dumps({'passed':len(checks)}))

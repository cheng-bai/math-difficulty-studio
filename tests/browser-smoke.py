"""Private-reader smoke test with an isolated synthetic account."""
import json,os,sys
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
 check('no browser errors',not errors);browser.close()
(out/'browser-smoke.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'errors':errors},ensure_ascii=False,indent=2));print(json.dumps({'passed':len(checks)}))

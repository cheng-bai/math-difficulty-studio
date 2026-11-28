"""Exercise the invited-user topic flow and inspect the raw student responses."""

import json
from pathlib import Path


def topic_smoke(base, browser, context, check, output):
    path = '/topics/quadratic-closed-interval'
    practice = f'{path}/practice'
    reveal = f'/api{path}/upper-bound/reveal'
    confirm = {'Origin': base, 'X-Studio-Attempt': 'confirmed'}
    topic = json.loads((Path(__file__).resolve().parents[1] / 'content/topics/quadratic-closed-interval/topic.json').read_text())
    anonymous = browser.new_context()
    try:
        for url in [path, practice]:
            response = anonymous.request.get(base + url, max_redirects=0)
            check(f'topic requires login {url}', response.status in (303, 307) and '/login?next=' in response.headers.get('location', ''))
        check('topic reveal requires login', anonymous.request.post(base + reveal, headers=confirm).status == 401)
    finally:
        anonymous.close()

    auth = {'Cookie': '; '.join(cookie['name'] + '=' + cookie['value'] for cookie in context.cookies())}
    teacher = context.request.get(base + path, headers=auth, max_redirects=0)
    check(f'teacher page responds with status 200 (got {teacher.status})', teacher.ok)
    check('teacher page contains solutions and annotations', all(item['content']['teaching'] in teacher.text() for item in topic['items']) and '【关键题素】' in teacher.text() and '本支无解' in teacher.text())
    for mode, url, headers in [('HTML', practice, {}), ('RSC', f'{practice}?_rsc', {'RSC': '1'})]:
        response = context.request.get(base + url, headers={**auth, **headers}, max_redirects=0)
        check(f'student {mode} response (got {response.status})', response.ok and response.headers['content-type'].startswith('text/html' if mode == 'HTML' else 'text/x-component'))
        raw = response.text()
        forbidden = ['"answer"', '"solution"', '"teaching"', '"commentary"', '1/4', 't≤1', '36/25', '本支无解', '【关键题素】', '【教学追问】']
        for item in topic['items']:
            forbidden += [item['content']['answer'], item['content']['teaching'], *item['content']['solution'], *(note['commentary'] for note in item['analysis_input']['steps'])]
        check(f'student {mode} contains both problems', all(item['title'] in raw for item in topic['items']))
        check(f'student {mode} contains no answers or notes', not any(text in raw or json.dumps(text, ensure_ascii=False)[1:-1] in raw for text in forbidden))
        check(f'student {mode} is private and noindex', 'no-store' in response.headers['cache-control'] and 'noindex' in response.headers['x-robots-tag'])

    check('reveal cannot be fetched by navigation', context.request.get(base + reveal, headers=auth).status == 405)
    check('reveal requires explicit confirmation', context.request.post(base + reveal, headers={**auth, 'Origin': base}).status == 400)
    check('reveal rejects another origin', context.request.post(base + reveal, headers={**auth, **confirm, 'Origin': 'https://other.invalid'}).status == 403)
    check('reveal rejects unknown item', context.request.post(base + f'/api{path}/missing/reveal', headers={**auth, **confirm}).status == 404)

    page = context.new_page()
    errors = []
    requests = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: requests.append(request) if request.url.endswith('/reveal') else None)
    page.goto(base + '/')
    check('home links to teacher topic', page.locator(f'a[href="{path}"]').count() == 1)
    page.goto(base + '/modules')
    check('modules links to teacher topic', page.locator(f'a[href="{path}"]').count() == 1)
    page.locator(f'a[href="{path}"]').click()
    page.locator('#upper-bound .topic-teaching').wait_for()
    page.locator('.topic-links a[href^="#"]').first.wait_for()
    check('teacher loop links resolve', page.locator('.topic-links a[href^="#"]').evaluate_all('(links) => links.every(link => document.getElementById(link.hash.slice(1)))'))
    page.screenshot(path=str(output / 'quadratic-teacher.png'), full_page=True)
    page.get_by_role('link', name='打开学生练习').click()
    page.wait_for_url(base + practice)
    page.locator('#upper-bound textarea').fill('只在本页写下的草稿')
    check('teacher preview is student-safe and attempt-first', page.locator('.topic-teaching, .topic-solution').count() == 0 and not requests)
    check('student contrast links resolve', page.locator('.topic-links a[href^="#"]').evaluate_all('(links) => links.length === 2 && links.every(link => document.getElementById(link.hash.slice(1)))'))
    check('KaTeX renders the prompt', page.locator('#upper-bound .katex').count() > 0 and page.locator('#upper-bound .katex-error').count() == 0 and 'KaTeX_Main' in page.locator('#upper-bound .katex').first.evaluate('(el) => getComputedStyle(el).fontFamily'))
    for item, other in [(topic['items'][0], topic['items'][1]), (topic['items'][1], topic['items'][0])]:
        selector = f"#{item['id']}"
        with page.expect_response(base + f"/api{path}/{item['id']}/reveal") as call:
            page.locator(selector).get_by_role('button', name='我已尝试，查看本题解析').click()
        response = call.value
        result = response.json()
        raw = response.text()
        check(f"item-scoped reveal {item['id']}", response.ok and set(result) == {'id', 'answer', 'solution'} and result['id'] == item['id'] and 'no-store' in response.headers['cache-control'] and 'noindex' in response.headers['x-robots-tag'])
        check(f"no teacher notes or other answer {item['id']}", 'teaching' not in raw and 'commentary' not in raw and all(note['commentary'] not in raw for note in item['analysis_input']['steps']) and json.dumps(other['content']['answer'][1:-2], ensure_ascii=False)[1:-1] not in raw)
        check(f"draft stays in browser {item['id']}", response.request.post_data is None)
        page.locator(f'{selector} .topic-solution .katex').first.wait_for()
        if item['id'] == 'upper-bound':
            check('first reveal leaves contrast unrevealed', page.locator('#lower-bound .topic-solution').count() == 0)
            page.get_by_role('link', name='去做对照变式').click()
            check('contrast jump reaches the other problem', page.url.endswith('#lower-bound'))
    page.set_viewport_size({'width': 390, 'height': 844})
    check('mobile student practice fits after revealing', page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))
    page.screenshot(path=str(output / 'quadratic-practice-mobile.png'), full_page=True)
    check('topic has no browser errors', not errors)
    page.close()

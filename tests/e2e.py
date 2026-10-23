"""Browser run-through of the demo mode at phone size.
Run: python3 tests/e2e.py   (serves the app itself on port 8765; screenshots go to tests/screens/)
"""
import os, random, subprocess, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tests', 'screens'); os.makedirs(OUT, exist_ok=True)
server = subprocess.Popen([sys.executable, '-m', 'http.server', '8765'], cwd=ROOT,
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
errors = []
shot_n = [0]

def shot(page, name):
    shot_n[0] += 1
    page.screenshot(path=os.path.join(OUT, f'{shot_n[0]:02d}-{name}.png'), full_page=True)

def run_session(page, label, answer_well=True):
    """Click through a lesson or review until the finish screen."""
    took = set()
    for _ in range(80):
        page.wait_for_timeout(120)
        if page.locator('h1.display:has-text("complete"), h1.display:has-text("Review done")').count() and not page.locator('[data-next]').count():
            break
        kicker = page.locator('.stage .kicker').first.inner_text() if page.locator('.stage .kicker').count() else ''
        if page.locator('.foot.fb').count():
            if 'feedback' not in took: shot(page, f'{label}-feedback'); took.add('feedback')
            page.click('.foot [data-next]'); continue
        if page.locator('.match').count():
            if 'match' not in took: shot(page, f'{label}-match'); took.add('match')
            ids = page.eval_on_selector_all('[data-ml]', 'els => els.map(e => e.dataset.ml)')
            for mid in ids:
                page.click(f'[data-ml="{mid}"]'); page.click(f'[data-mr="{mid}"]')
            continue
        if page.locator('[name=answer]').count():
            if 'type' not in took: shot(page, f'{label}-type'); took.add('type')
            page.fill('[name=answer]', 'zzz'); page.click('[data-check]'); continue
        if page.locator('[data-opt]').count():
            key = 'opt-' + kicker[:12]
            if key not in took: shot(page, f'{label}-question'); took.add(key)
            page.locator('[data-opt]').nth(random.randrange(page.locator('[data-opt]').count())).click(); continue
        if page.locator('[data-next]').count():
            if page.locator('.big-word').count() and 'card' not in took: shot(page, f'{label}-card'); took.add('card')
            if 'intro' not in took and page.locator('h1.display').count(): shot(page, f'{label}-intro'); took.add('intro')
            page.click('[data-next]'); continue
    page.wait_for_selector('#save-status:has-text("saved"), #save-status:has-text("Preview")', timeout=5000)
    shot(page, f'{label}-finish')

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'])
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                              permissions=['microphone'])
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'fonts.g' not in m.text and errors.append(m.text))
    page.on('dialog', lambda d: d.accept())
    page.goto('http://localhost:8765/')
    page.wait_for_selector('text=Write today')
    shot(page, 'teacher-today')

    # Teacher writes Day 1, filling 4 of the suggested rows and recording the first.
    page.click('text=Write today')
    words = ['namaskaar', 'kasso hai', 'saaru hai', 'aav']
    for i, w in enumerate(words):
        page.fill(f'[data-i="{i}"] input[name=word]', w)
    page.click('[data-i="0"] [data-record]')
    page.wait_for_timeout(1500)
    shot(page, 'editor-recording')
    page.click('[data-stop]')
    page.wait_for_selector('[data-i="0"] [data-local]')
    page.click('[data-i="1"] summary'); page.click('[data-i="2"] summary')
    page.fill('[data-i="1"] input[name=sounds_like]', 'kasso rhymes with lasso')
    page.fill('[data-i="2"] input[name=alternatives]', 'saru hai')
    shot(page, 'editor-filled')
    page.click('button:has-text("Save lesson")')
    page.wait_for_selector('text=Today\'s lesson is in')
    shot(page, 'teacher-today-done')

    # Day 2 (ahead of schedule) so the path has a locked lesson.
    page.click('text=Add Day 2')
    for i, w in enumerate(['amma', 'baba', 'dada', 'akka']):
        page.fill(f'[data-i="{i}"] input[name=word]', w)
    page.click('button:has-text("Save lesson")')
    page.wait_for_selector('text=Today\'s lesson is in')
    page.goto('http://localhost:8765/#/lessons'); page.wait_for_selector('.lesson-admin')
    shot(page, 'teacher-lessons')

    # Student
    page.click('.seg [data-role=student]')
    page.wait_for_selector('text=Start lesson')
    shot(page, 'student-home')
    page.click('text=Start lesson')
    run_session(page, 'lesson1')
    page.click('.foot a')
    page.wait_for_selector('.goal')
    shot(page, 'student-home-after')
    page.click('#tabs a:has-text("Progress")'); page.wait_for_selector('.words')
    shot(page, 'student-progress')
    page.click('#tabs a:has-text("Review")'); page.wait_for_selector('.panel h1:has-text("Review")')
    shot(page, 'student-review')
    page.click('.panel .btn'); run_session(page, 'review')
    page.click('.foot a')

    # Teacher sees the report
    page.click('.seg [data-role=teacher]'); page.wait_for_selector('text=Your student')
    shot(page, 'teacher-today-report')
    page.click('#tabs a:has-text("Student")'); page.wait_for_selector('.words')
    shot(page, 'teacher-student-report')

    # Dark mode glance
    page.emulate_media(color_scheme='dark'); page.goto('http://localhost:8765/#/'); page.wait_for_selector('text=Your student')
    shot(page, 'dark-teacher')
    browser.close()

server.terminate()
print('screens:', shot_n[0])
print('errors:', errors or 'none')

import { createStore } from './store/index.js';
import { APP_NAME } from './config.js';
import { $, esc, toast } from './util.js';
import { playUrl } from './recorder.js';
import { renderSignIn } from './views/auth.js';
import { renderTeacherHome, renderLessonList, renderEditor, renderStudentReport } from './views/teacher.js';
import { renderStudentHome, renderProgress } from './views/student.js';
import { runSession } from './views/session.js';

const ctx = { store: null, user: null, go: (h) => (location.hash = h) };

const TABS = {
  teacher: [
    ['#/', 'Today'],
    ['#/lessons', 'Lessons'],
    ['#/progress', 'Student'],
  ],
  student: [
    ['#/', 'Learn'],
    ['#/review', 'Review'],
    ['#/progress', 'Progress'],
  ],
};

function renderHeader() {
  const u = ctx.user;
  const demo = ctx.store.mode === 'demo';
  $('#top').innerHTML = `
    <div class="bar">
      <a class="brand" href="#/"><span class="brand-mark" aria-hidden="true">ஸௌ</span>${esc(APP_NAME)}</a>
      ${u && !demo ? `<button class="link" data-act="signout">Sign out</button>` : ''}
    </div>
    ${demo ? `
      <div class="demo">
        <span>Demo · saved in this browser only</span>
        <div class="seg" role="group" aria-label="View as">
          <button data-role="teacher" aria-pressed="${u.role === 'teacher'}">Teacher</button>
          <button data-role="student" aria-pressed="${u.role === 'student'}">Student</button>
        </div>
      </div>` : ''}
    <div class="zari" aria-hidden="true"></div>`;
}

function renderTabs(route) {
  const nav = $('#tabs');
  if (!ctx.user || route.startsWith('#/lesson/') || route.startsWith('#/preview/') || route === '#/review/go') {
    nav.innerHTML = '';
    nav.hidden = true;
    return;
  }
  nav.hidden = false;
  const current = '#/' + (route.split('/')[1] || '');
  nav.innerHTML = TABS[ctx.user.role]
    .map(([href, label]) => `<a href="${href}" ${href === current ? 'aria-current="page"' : ''}>${label}</a>`)
    .join('');
}

let lastHash = location.hash || '#/';
let ignoreNextHash = false;

async function route() {
  const hash = location.hash || '#/';
  // A screen with unsaved work (the lesson editor) can ask before we leave it.
  if (ignoreNextHash) { ignoreNextHash = false; return; }
  if (ctx.leaveGuard && hash !== lastHash && !ctx.leaveGuard()) {
    ignoreNextHash = true;
    location.hash = lastHash;
    return;
  }
  ctx.leaveGuard = null;
  window.onbeforeunload = null;
  lastHash = hash;

  const [, page = '', arg] = hash.split('/');
  // Fresh container per screen, so listeners from the previous screen go away.
  const old = $('#view');
  const view = old.cloneNode(false);
  old.replaceWith(view);
  window.scrollTo(0, 0);
  renderHeader();
  renderTabs(hash);

  try {
    if (!ctx.user) return renderSignIn(ctx, view, onSignedIn);

    if (ctx.user.role === 'teacher') {
      if (page === 'lessons') return await renderLessonList(ctx, view);
      if (page === 'edit') return await renderEditor(ctx, view, arg);
      if (page === 'new') return await renderEditor(ctx, view, null);
      if (page === 'progress') return await renderStudentReport(ctx, view);
      if (page === 'preview') return await runSession(ctx, view, { kind: 'lesson', lessonId: arg, preview: true });
      return await renderTeacherHome(ctx, view);
    }

    if (page === 'lesson') return await runSession(ctx, view, { kind: 'lesson', lessonId: arg });
    if (page === 'review') {
      return await runSession(ctx, view, { kind: 'review', start: arg === 'go' });
    }
    if (page === 'progress') return await renderProgress(ctx, view);
    return await renderStudentHome(ctx, view);
  } catch (e) {
    console.error(e);
    view.innerHTML = `<section class="panel"><h1>Something went wrong</h1><p>${esc(e.message)}</p>
      <p><button class="btn" onclick="location.reload()">Reload</button></p></section>`;
  }
}

function onSignedIn(user) {
  ctx.user = user;
  goHome();
}

// ---------- Global handlers ----------

document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-audio],[data-role],[data-act="signout"]');
  if (!t) return;
  if (t.dataset.audio) {
    e.preventDefault();
    t.classList.add('playing');
    try {
      await playUrl(await ctx.store.audioUrl(t.dataset.audio));
    } catch {
      toast('Could not play this recording.', 'error');
    } finally {
      setTimeout(() => t.classList.remove('playing'), 700);
    }
  } else if (t.dataset.role) {
    if (ctx.leaveGuard && !ctx.leaveGuard()) return;
    ctx.leaveGuard = null;
    ctx.store.setRole(t.dataset.role);
    ctx.user = ctx.store.user;
    goHome();
  } else {
    await ctx.store.signOut();
    ctx.user = null;
    goHome();
  }
});

function goHome() {
  lastHash = '';
  if ((location.hash || '#/') === '#/') route();
  else location.hash = '#/';
}

window.addEventListener('hashchange', route);

(async () => {
  try {
    ctx.store = await createStore();
    ctx.user = await ctx.store.init();
  } catch (e) {
    $('#view').innerHTML = `<section class="panel"><h1>Can't connect</h1><p>${esc(e.message)}</p></section>`;
    return;
  }
  route();
})();

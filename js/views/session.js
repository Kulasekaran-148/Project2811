import { esc, shuffle, localDay, toast } from '../util.js';
import { loadStudentData } from '../stats.js';
import { lessonQuiz, reviewQuiz, checkTyped } from '../quiz.js';
import { newRecord, grade, isDue } from '../srs.js';
import { playUrl } from '../recorder.js';

const XP_PER_CORRECT = 10;
const XP_LESSON_BONUS = 20;
const MAX_REVIEW = 15;

const PROMPTS = {
  meaning: 'What does this mean?',
  word: 'Which is the Sourashtra word?',
  listen: 'Listen. What does it mean?',
  type: 'Write this in Sourashtra',
  match: 'Match the pairs',
};

/**
 * opts.kind = 'lesson' (with lessonId, optional preview) or 'review' (with start).
 * Preview runs the lesson for the teacher without saving anything.
 */
export async function runSession(ctx, view, opts) {
  const { store } = ctx;
  const preview = !!opts.preview;
  const studentId = preview ? null : await store.getStudentId();
  const d = await loadStudentData(store, studentId);
  const byItem = d.byItem || new Map();
  const home = preview ? `#/edit/${opts.lessonId}` : '#/';

  // ----- Build the steps -----
  let lesson = null;
  let items;
  let pool;
  let questions;

  if (opts.kind === 'lesson') {
    lesson = d.lessons.find((l) => l.id === opts.lessonId);
    if (!lesson || !lesson.items.length) {
      view.innerHTML = `<section class="panel"><h1>Lesson not found</h1><a href="#/">Go home</a></section>`;
      return;
    }
    items = lesson.items;
    pool = d.lessons.filter((l) => l.day_number <= lesson.day_number).flatMap((l) => l.items);
    questions = lessonQuiz(items, pool);
  } else {
    const now = new Date();
    const seen = d.lessons.flatMap((l) => l.items).filter((i) => byItem.has(i.id));
    const due = seen
      .filter((i) => isDue(byItem.get(i.id), now))
      .sort((a, b) => new Date(byItem.get(a.id).due_at) - new Date(byItem.get(b.id).due_at));
    if (!opts.start) return renderReviewIntro(view, due.length, seen.length, byItem, seen);
    items = due.length ? due.slice(0, MAX_REVIEW) : weakest(seen, byItem, 10);
    if (!items.length) { ctx.go('#/review'); return; }
    pool = seen;
    questions = reviewQuiz(items, pool);
  }

  const steps = [];
  if (lesson) {
    steps.push({ type: 'intro' });
    for (const it of items) steps.push({ type: 'card', item: it });
  }
  for (const q of questions) steps.push({ type: 'q', q });

  // ----- Session state -----
  let pos = 0;
  const firstTry = new Map(); // item id -> all first answers right?
  let firstCorrect = 0;
  let firstTotal = 0;
  let xp = 0;
  let answered = false;

  const audioOf = (it) => it?.audio_path;
  const play = async (it) => {
    if (!audioOf(it)) return;
    try { await playUrl(await store.audioUrl(it.audio_path)); } catch { /* autoplay can be blocked; the button still works */ }
  };

  function frame(inner, footer = '') {
    const pct = Math.round((100 * pos) / steps.length);
    view.innerHTML = `
      <div class="session">
        <div class="session-top">
          <button class="close" data-quit aria-label="Quit">✕</button>
          <div class="meter thin" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
          ${preview ? '<span class="tag">Preview</span>' : ''}
        </div>
        <div class="stage">${inner}</div>
        <div class="foot">${footer}</div>
      </div>`;
  }

  function show() {
    answered = false;
    const step = steps[pos];
    if (!step) return finish();
    if (step.type === 'intro') return showIntro();
    if (step.type === 'card') return showCard(step.item);
    return showQuestion(step.q, step.retry);
  }

  function showIntro() {
    frame(`
      <p class="kicker">Day ${lesson.day_number}</p>
      <h1 class="display">${esc(lesson.title)}</h1>
      ${lesson.intro ? `<blockquote class="note">${esc(lesson.intro)}</blockquote>` : ''}
      <p class="muted">${items.length} new words. First you'll meet each one, then practise them.</p>`,
      `<button class="btn primary big" data-next>Start</button>`);
  }

  function showCard(it) {
    frame(`
      <p class="kicker">New word</p>
      <div class="card-word">
        ${audioOf(it) ? `<button class="play lg" data-audio="${esc(it.audio_path)}" aria-label="Play"></button>` : ''}
        <div>
          <p class="big-word">${esc(it.word)}</p>
          ${it.tamil ? `<p class="ta">${esc(it.tamil)}</p>` : ''}
        </div>
      </div>
      <p class="meaning">${esc(it.meaning)}</p>
      ${it.sounds_like ? `<p class="hint"><b>Sounds like:</b> ${esc(it.sounds_like)}</p>` : ''}
      ${it.example ? `<div class="example"><p>${esc(it.example)}</p>${it.example_meaning ? `<p class="muted">${esc(it.example_meaning)}</p>` : ''}</div>` : ''}
      ${it.note ? `<p class="note">${esc(it.note)}</p>` : ''}
      ${!audioOf(it) ? `<p class="muted small">No recording for this word yet.</p>` : ''}`,
      `<button class="btn primary big" data-next>Got it</button>`);
    play(it);
  }

  function showQuestion(q, retry) {
    const head = `<p class="kicker">${retry ? 'Try this one again' : esc(PROMPTS[q.kind])}</p>`;
    if (q.kind === 'match') return showMatch(q, head);
    const it = q.item;
    let body = '';
    if (q.kind === 'meaning') {
      body = `<div class="card-word">${audioOf(it) ? `<button class="play lg" data-audio="${esc(it.audio_path)}" aria-label="Play"></button>` : ''}<p class="big-word">${esc(it.word)}</p></div>`;
    } else if (q.kind === 'listen') {
      body = `<div class="listen"><button class="play xl" data-audio="${esc(it.audio_path)}" aria-label="Play again"></button><p class="muted small">Tap to hear it again</p></div>`;
    } else {
      body = `<p class="big-meaning">${esc(it.meaning)}</p>`;
    }

    if (q.kind === 'type') {
      frame(`${head}${body}
        <form data-typed class="typed">
          <input name="answer" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type in English letters" aria-label="Your answer">
        </form>
        ${it.sounds_like ? `<p class="hint">${esc(it.sounds_like)}</p>` : ''}
        ${audioOf(it) ? `<button class="btn sm ghost" data-audio="${esc(it.audio_path)}">Hear it</button>` : ''}`,
        `<button class="btn ghost" data-giveup>Show me</button><button class="btn primary" data-check>Check</button>`);
      view.querySelector('[name=answer]').focus();
      return;
    }

    const field = q.kind === 'word' ? 'word' : 'meaning';
    frame(`${head}${body}
      <div class="options">${q.options.map((o, i) => `<button class="opt" data-opt="${esc(o.id)}"><kbd>${i + 1}</kbd>${esc(o[field])}</button>`).join('')}</div>`);
    if (q.kind === 'meaning' || q.kind === 'listen') play(it);
  }

  function showMatch(q, head) {
    const left = shuffle(q.items);
    const right = shuffle(q.items);
    frame(`${head}
      <div class="match">
        <div>${left.map((i) => `<button class="opt" data-ml="${esc(i.id)}">${esc(i.word)}</button>`).join('')}</div>
        <div>${right.map((i) => `<button class="opt" data-mr="${esc(i.id)}">${esc(i.meaning)}</button>`).join('')}</div>
      </div>`);
    let picked = null;
    let mistakes = 0;
    let done = 0;
    view.querySelector('.match').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      if (b.dataset.ml) {
        view.querySelectorAll('[data-ml]').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
        picked = b.dataset.ml;
        play(q.items.find((i) => i.id === picked));
        return;
      }
      if (!picked) return;
      const l = view.querySelector(`[data-ml="${picked}"]`);
      if (b.dataset.mr === picked) {
        [l, b].forEach((x) => { x.classList.remove('sel'); x.classList.add('right'); x.disabled = true; });
        picked = null;
        if (++done === q.items.length) {
          if (mistakes === 0) xp += XP_PER_CORRECT;
          feedback(true, mistakes ? `Matched, with ${mistakes} slip${mistakes > 1 ? 's' : ''}.` : 'All matched.');
        }
      } else {
        mistakes++;
        b.classList.add('wrong');
        setTimeout(() => b.classList.remove('wrong'), 500);
      }
    });
  }

  function answer(q, correct, extra = '') {
    if (answered) return;
    answered = true;
    const step = steps[pos];
    if (!step.retry) {
      firstTotal++;
      if (correct) { firstCorrect++; xp += XP_PER_CORRECT; }
      firstTry.set(q.item.id, (firstTry.get(q.item.id) ?? true) && correct);
    }
    if (!correct && !step.retry) {
      // Missed words come back once at the end of the session.
      const again = q.kind === 'type' ? q : { ...q, options: q.options && shuffle(q.options) };
      steps.push({ type: 'q', q: again, retry: true });
    }
    const it = q.item;
    const reveal = `<p class="reveal">${audioOf(it) ? `<button class="play sm" data-audio="${esc(it.audio_path)}" aria-label="Play"></button>` : ''}<b>${esc(it.word)}</b> means <b>${esc(it.meaning)}</b></p>`;
    feedback(correct, extra + reveal);
    if (q.kind !== 'listen') play(it);
  }

  function feedback(correct, html) {
    const foot = view.querySelector('.foot');
    foot.className = `foot fb ${correct ? 'good' : 'bad'}`;
    foot.innerHTML = `
      <div class="fb-msg"><p class="fb-title">${correct ? 'Correct' : 'Not quite'}</p>${html}</div>
      <button class="btn ${correct ? 'primary' : 'danger'}" data-next>Continue</button>`;
    foot.querySelector('[data-next]').focus();
  }

  // ----- Finish -----
  async function finish() {
    const score = firstTotal ? Math.round((100 * firstCorrect) / firstTotal) : 100;
    if (lesson) xp += XP_LESSON_BONUS;
    view.innerHTML = `
      <div class="session done">
        <div class="stage center">
          <div class="zari wide" aria-hidden="true"></div>
          <h1 class="display">${lesson ? 'Lesson complete' : 'Review done'}</h1>
          <div class="stats">
            <div><b>${xp}</b><span>XP earned</span></div>
            <div><b>${score}%</b><span>right first time</span></div>
            <div><b>${firstTry.size}</b><span>words practised</span></div>
          </div>
          <p class="muted" id="save-status">${preview ? 'Preview only, nothing was saved.' : 'Saving…'}</p>
        </div>
        <div class="foot"><a class="btn primary big" href="${home}">${preview ? 'Back to editor' : 'Continue'}</a></div>
      </div>`;
    if (preview) return;

    const save = async () => {
      const status = view.querySelector('#save-status');
      try {
        const now = new Date();
        const records = [...firstTry].map(([id, ok]) => grade(byItem.get(id) || newRecord(id, studentId), ok, now));
        await store.saveProgress(records);
        if (lesson) await store.completeLesson({ student_id: studentId, lesson_id: lesson.id, score });
        await store.addActivity({ student_id: studentId, day: localDay(), xp, kind: lesson ? 'lesson' : 'review', lesson_id: lesson?.id ?? null });
        status.textContent = 'Progress saved.';
      } catch (e) {
        status.innerHTML = `Couldn't save: ${esc(e.message)} <button class="btn sm" data-retry>Try again</button>`;
        status.querySelector('[data-retry]').onclick = save;
      }
    };
    save();
  }

  // ----- Events -----
  view.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const step = steps[pos];
    if ('quit' in b.dataset) {
      if (confirm('Quit? Progress in this session will be lost.')) ctx.go(home);
    } else if ('next' in b.dataset) {
      pos++;
      show();
    } else if (b.dataset.opt && !answered) {
      const q = step.q;
      const ok = b.dataset.opt === q.item.id;
      b.classList.add(ok ? 'right' : 'wrong');
      if (!ok) view.querySelector(`[data-opt="${CSS.escape(q.item.id)}"]`)?.classList.add('right');
      view.querySelectorAll('.opt').forEach((o) => (o.disabled = true));
      answer(q, ok);
    } else if ('check' in b.dataset) {
      checkTypedAnswer(step.q);
    } else if ('giveup' in b.dataset) {
      view.querySelector('[name=answer]').disabled = true;
      answer(step.q, false);
    }
  });

  view.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!answered) checkTypedAnswer(steps[pos].q);
  });

  function checkTypedAnswer(q) {
    if (answered) return;
    const input = view.querySelector('[name=answer]');
    if (!input.value.trim()) return input.focus();
    const res = checkTyped(input.value, q.item);
    input.disabled = true;
    input.classList.add(res === 'wrong' ? 'wrong' : 'right');
    const extra = res === 'close' ? `<p class="small">Close enough. Spelled <b>${esc(q.item.word)}</b>.</p>`
      : res === 'wrong' ? `<p class="small">You wrote "${esc(input.value)}".</p>` : '';
    answer(q, res !== 'wrong', extra);
  }

  // Keyboard: 1–4 to pick, Enter to continue.
  const onKey = (e) => {
    if (!document.body.contains(view)) return document.removeEventListener('keydown', onKey);
    if (e.target.matches('input, textarea')) return;
    if (e.key === 'Enter' && e.target.matches('button, a')) return; // native Enter already clicks it
    const n = Number(e.key);
    if (n >= 1 && n <= 4) view.querySelectorAll('[data-opt]')[n - 1]?.click();
    else if (e.key === 'Enter') view.querySelector('[data-next]')?.click();
  };
  document.addEventListener('keydown', onKey);

  show();
}

function weakest(seen, byItem, n) {
  return [...seen]
    .sort((a, b) => {
      const pa = byItem.get(a.id), pb = byItem.get(b.id);
      return pa.interval_days - pb.interval_days || pb.wrong - pa.wrong;
    })
    .slice(0, n);
}

function renderReviewIntro(view, dueCount, seenCount, byItem, seen) {
  const next = seen.map((i) => byItem.get(i.id).due_at).sort()[0];
  const when = next ? new Date(next).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : null;
  view.innerHTML = `
    <section class="panel">
      <h1>Review</h1>
      ${dueCount ? `
        <p>${dueCount} word${dueCount > 1 ? 's are' : ' is'} due. Each review spaces the next one further out.</p>
        <a class="btn primary big" href="#/review/go">Start review</a>`
      : seenCount ? `
        <p>Nothing due right now.${when ? ` Next words are due ${esc(when)}.` : ''}</p>
        <a class="btn big" href="#/review/go">Practise weakest words anyway</a>`
      : `<p class="muted">Finish your first lesson, and its words will come back here for review.</p>
         <a class="btn" href="#/">Go to lessons</a>`}
    </section>`;
}

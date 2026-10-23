import { esc, localDay } from '../util.js';
import { DAILY_XP_GOAL } from '../config.js';
import { loadStudentData } from '../stats.js';
import { strength } from '../srs.js';

export async function renderStudentHome(ctx, view) {
  const d = await loadStudentData(ctx.store, await ctx.store.getStudentId());
  const goalPct = Math.min(100, Math.round((100 * d.xpToday) / DAILY_XP_GOAL));
  const next = d.nextLesson;
  const nextIdx = next ? d.lessons.indexOf(next) : d.lessons.length;

  view.innerHTML = `
    <section class="panel goal">
      <div class="goal-top">
        <div><b class="streak">${d.streak}</b> day streak</div>
        <div class="muted">${d.xpToday} / ${DAILY_XP_GOAL} XP today</div>
      </div>
      <div class="meter" role="progressbar" aria-label="Daily goal" aria-valuenow="${goalPct}" aria-valuemin="0" aria-valuemax="100">
        <span style="width:${goalPct}%"></span>
      </div>
      ${goalPct >= 100 ? `<p class="ok small">Daily goal reached.</p>` : ''}
    </section>

    ${d.due.length ? `
      <section class="panel callout">
        <div>
          <h2>${d.due.length} word${d.due.length > 1 ? 's' : ''} to review</h2>
          <p class="muted small">Reviewing at the right time is what makes words stick.</p>
        </div>
        <a class="btn primary" href="#/review/go">Review now</a>
      </section>` : ''}

    <section class="panel">
      ${next ? `
        <p class="kicker">Next lesson</p>
        <h1>Day ${next.day_number}: ${esc(next.title)}</h1>
        <p class="muted">${next.items.length} new words</p>
        <a class="btn primary big" href="#/lesson/${next.id}">Start lesson</a>`
      : d.lessons.length ? `
        <h1>All caught up</h1>
        <p class="muted">You've finished every lesson. The next one appears here as soon as it's added. Meanwhile, reviews keep your words fresh.</p>`
      : `
        <h1>No lessons yet</h1>
        <p class="muted">Your first lesson will appear here once it's added.</p>`}
    </section>

    ${d.lessons.length ? `
      <section class="panel">
        <h2>Your path</h2>
        <ol class="path">${d.lessons.map((l, i) => {
          const done = d.completedIds.has(l.id);
          const state = done ? 'done' : i === nextIdx ? 'current' : 'locked';
          const label = `<span class="day">Day ${l.day_number}</span> ${esc(l.title)}`;
          return `<li class="${state}">${state === 'locked' ? `<span>${label}</span>`
            : `<a href="#/lesson/${l.id}">${label}</a>${done ? '<span class="small muted">Practise again</span>' : ''}`}</li>`;
        }).join('')}</ol>
      </section>` : ''}`;
}

export async function renderProgress(ctx, view) {
  const d = await loadStudentData(ctx.store, await ctx.store.getStudentId());
  view.innerHTML = progressSections(d, { title: 'Your progress' });
}

/** Shared by the student's progress page and the teacher's report. */
export function progressSections(d, { title }) {
  const days = [];
  const t = new Date();
  for (let i = 27; i >= 0; i--) {
    const x = new Date(t);
    x.setDate(t.getDate() - i);
    days.push(localDay(x));
  }

  const lessonsWithSeen = d.lessons
    .map((l) => ({ l, items: l.items.filter((i) => d.byItem.has(i.id)) }))
    .filter((x) => x.items.length);

  return `
    <section class="panel">
      <h1>${esc(title)}</h1>
      <div class="stats">
        <div><b>${d.streak}</b><span>day streak</span></div>
        <div><b>${d.learned.length}</b><span>words learned</span></div>
        <div><b>${d.xpTotal}</b><span>total XP</span></div>
        <div><b>${d.accuracy ?? '–'}${d.accuracy == null ? '' : '%'}</b><span>accuracy</span></div>
      </div>
      <h3>Last 4 weeks</h3>
      <div class="cal" aria-label="Days practised in the last 4 weeks">
        ${days.map((day) => `<span class="${d.activeDays.has(day) ? 'on' : ''}${day === localDay() ? ' today' : ''}" title="${day}"></span>`).join('')}
      </div>
      <p class="muted small">${d.completedIds.size} of ${d.lessons.length} lessons done · ${d.seen.length} words met · ${d.due.length} due for review</p>
    </section>

    <section class="panel">
      <h2>Words</h2>
      <p class="muted small">The bars fill up as each word gets stronger. Strong words come up for review less often.</p>
      ${lessonsWithSeen.length ? lessonsWithSeen.map(({ l, items }) => `
        <h3 class="lesson-h">Day ${l.day_number}: ${esc(l.title)}</h3>
        <ul class="words">${items.map((i) => {
          const p = d.byItem.get(i.id);
          const s = strength(p);
          return `<li>
            ${i.audio_path ? `<button class="play sm" data-audio="${esc(i.audio_path)}" aria-label="Play ${esc(i.word)}"></button>` : '<span class="play-gap"></span>'}
            <span class="w">${esc(i.word)}</span>
            <span class="m">${esc(i.meaning)}</span>
            <span class="str s${s}" title="Strength ${s} of 4 · ${p.correct} right, ${p.wrong} wrong"><i></i><i></i><i></i><i></i></span>
          </li>`;
        }).join('')}</ul>`).join('') : `<p class="muted">Words show up here after the first lesson.</p>`}
    </section>`;
}

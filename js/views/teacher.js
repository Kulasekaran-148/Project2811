import { esc, uid, localDay, toast } from '../util.js';
import { topicForDay } from '../curriculum.js';
import { loadStudentData } from '../stats.js';
import { canRecord, startRecording, playUrl } from '../recorder.js';
import { progressSections } from './student.js';

const ITEM_FIELDS = ['id', 'word', 'meaning', 'tamil', 'alternatives', 'sounds_like', 'example', 'example_meaning', 'note', 'audio_path'];

function timeAgo(iso) {
  if (!iso) return 'not yet';
  const mins = Math.round((Date.now() - new Date(iso)) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

// ---------- Today ----------

export async function renderTeacherHome(ctx, view) {
  const studentId = await ctx.store.getStudentId();
  const d = await loadStudentData(ctx.store, studentId);
  const today = localDay();
  const todays = d.lessons.find((l) => localDay(new Date(l.created_at)) === today);
  const nextDay = (d.lessons.at(-1)?.day_number || 0) + 1;
  const topic = topicForDay(nextDay);

  const struggling = d.noStudent ? [] : d.seen
    .map((i) => ({ i, p: d.byItem.get(i.id) }))
    .filter(({ p }) => p.wrong > 0)
    .sort((a, b) => b.p.wrong - b.p.correct - (a.p.wrong - a.p.correct))
    .slice(0, 5);

  view.innerHTML = `
    ${todays ? `
      <section class="panel today done">
        <p class="kicker">Today's lesson is in</p>
        <h1>Day ${todays.day_number}: ${esc(todays.title)}</h1>
        <p class="muted">${todays.items.length} words · ${todays.items.filter((i) => i.audio_path).length} recorded</p>
        <div class="row">
          <a class="btn" href="#/edit/${todays.id}">Edit</a>
          <a class="btn ghost" href="#/preview/${todays.id}">Preview as student</a>
        </div>
        <p class="muted small">Want to get ahead? <a href="#/new">Add Day ${nextDay}</a></p>
      </section>` : `
      <section class="panel today">
        <p class="kicker">Day ${nextDay} is waiting</p>
        <h1>${esc(topic.title)}</h1>
        <p>Today's suggestion: how your family says</p>
        <ul class="prompt-list">${topic.prompts.slice(0, 5).map((p) => `<li>${esc(p)}</li>`).join('')}${topic.prompts.length > 5 ? `<li class="muted">and ${topic.prompts.length - 5} more</li>` : ''}</ul>
        <a class="btn primary big" href="#/new">Write today's lesson</a>
        <p class="muted small">You can change the topic and every word on the next screen.</p>
      </section>`}

    <section class="panel">
      <h2>Your student</h2>
      ${d.noStudent ? `<p class="muted">No student account yet. See README step 4.</p>` : `
        <div class="stats">
          <div><b>${d.streak}</b><span>day streak</span></div>
          <div><b>${d.learned.length}</b><span>words learned</span></div>
          <div><b>${d.due.length}</b><span>due for review</span></div>
          <div><b>${d.accuracy ?? '–'}${d.accuracy == null ? '' : '%'}</b><span>accuracy</span></div>
        </div>
        <p class="muted small">Last practised ${timeAgo(d.lastActive)} · ${d.completedIds.size} of ${d.lessons.length} lessons done</p>
        ${struggling.length ? `
          <h3>Needs more practice</h3>
          <ul class="words compact">${struggling.map(({ i, p }) => `
            <li>${i.audio_path ? `<button class="play sm" data-audio="${esc(i.audio_path)}" aria-label="Play ${esc(i.word)}"></button>` : ''}
              <span class="w">${esc(i.word)}</span><span class="m">${esc(i.meaning)}</span>
              <span class="score">${p.correct}✓ ${p.wrong}✗</span></li>`).join('')}
          </ul>` : ''}
        <a href="#/progress">Full report</a>`}
    </section>`;
}

// ---------- Lesson list ----------

export async function renderLessonList(ctx, view) {
  const studentId = await ctx.store.getStudentId();
  const d = await loadStudentData(ctx.store, studentId);
  view.innerHTML = `
    <section class="panel">
      <div class="head-row"><h1>Lessons</h1><a class="btn primary" href="#/new">New lesson</a></div>
      ${d.lessons.length ? `<ol class="lesson-admin">${d.lessons.map((l) => `
        <li>
          <div>
            <span class="day">Day ${l.day_number}</span>
            <b>${esc(l.title)}</b>
            <span class="muted small">${l.items.length} words · ${l.items.filter((i) => i.audio_path).length} recorded${d.completedIds?.has(l.id) ? ' · <span class="ok">done by student</span>' : ''}</span>
          </div>
          <div class="row">
            <a class="btn sm" href="#/edit/${l.id}">Edit</a>
            <a class="btn sm ghost" href="#/preview/${l.id}">Preview</a>
          </div>
        </li>`).join('')}</ol>` : `<p>No lessons yet. <a href="#/new">Write the first one</a>.</p>`}
    </section>`;
}

// ---------- Student report ----------

export async function renderStudentReport(ctx, view) {
  const studentId = await ctx.store.getStudentId();
  if (!studentId) {
    view.innerHTML = `<section class="panel"><h1>Student</h1><p>No student account yet. See README step 4.</p></section>`;
    return;
  }
  const d = await loadStudentData(ctx.store, studentId);
  view.innerHTML = progressSections(d, { title: "Your student's progress" });
}

// ---------- Lesson editor ----------

const blankItem = (meaning = '') => ({ id: uid(), word: '', meaning, tamil: '', alternatives: '', sounds_like: '', example: '', example_meaning: '', note: '', audio_path: null });

export async function renderEditor(ctx, view, lessonId) {
  const lessons = await ctx.store.listLessons();
  let lesson, items;
  if (lessonId) {
    const found = lessons.find((l) => l.id === lessonId);
    if (!found) { view.innerHTML = `<section class="panel"><h1>Lesson not found</h1><a href="#/lessons">Back to lessons</a></section>`; return; }
    lesson = { id: found.id, day_number: found.day_number, title: found.title, intro: found.intro || '' };
    items = found.items.map((i) => ({ ...blankItem(), ...Object.fromEntries(ITEM_FIELDS.map((f) => [f, i[f] ?? ''])), audio_path: i.audio_path || null }));
  } else {
    const day = (lessons.at(-1)?.day_number || 0) + 1;
    const topic = topicForDay(day);
    lesson = { id: uid(), day_number: day, title: topic.title, intro: '' };
    items = topic.prompts.map((p) => blankItem(p));
  }

  let recording = null; // { index, rec, timer }
  let dirty = false;
  const markDirty = () => { dirty = true; };
  window.onbeforeunload = () => (dirty ? true : undefined);
  ctx.leaveGuard = () => !dirty || confirm('Leave without saving this lesson?');

  function itemHTML(it, i) {
    const hasAudio = it._blob || it.audio_path;
    const isRec = recording?.index === i;
    const filled = it.tamil || it.alternatives || it.sounds_like || it.example || it.note;
    return `
      <li class="item ${it.word ? '' : 'empty'}" data-i="${i}">
        <div class="item-head">
          <span class="num">${i + 1}</span>
          <button class="link danger" data-rm="${i}" aria-label="Remove word ${i + 1}">Remove</button>
        </div>
        <label>Meaning in English <input name="meaning" value="${esc(it.meaning)}" placeholder="e.g. Elder sister"></label>
        <label>In Sourashtra <input name="word" value="${esc(it.word)}" placeholder="Spell it your way" autocapitalize="off" autocomplete="off" spellcheck="false"></label>
        <div class="rec">
          ${isRec ? `<button class="btn rec-on" data-stop="${i}">Stop <span class="t">0:00</span></button>`
            : hasAudio ? `
              <button class="play" data-local="${i}" aria-label="Play recording"></button>
              <span class="ok small">Recorded</span>
              <button class="btn sm ghost" data-record="${i}">Record again</button>
              <button class="link danger small" data-noaudio="${i}">Delete</button>`
            : `
              <button class="btn rec-btn" data-record="${i}" ${canRecord() ? '' : 'disabled'}>Record</button>
              <label class="btn sm ghost file">Upload audio<input type="file" accept="audio/*" data-upload="${i}" hidden></label>`}
        </div>
        <details ${filled ? 'open' : ''}>
          <summary>Spelling help, example and notes</summary>
          <label>Tamil spelling <input name="tamil" class="ta" value="${esc(it.tamil)}" placeholder="Optional"></label>
          <label>Also accept these spellings <input name="alternatives" value="${esc(it.alternatives)}" placeholder="Comma-separated, e.g. akka, aka" autocapitalize="off"></label>
          <label>Sounds like <input name="sounds_like" value="${esc(it.sounds_like)}" placeholder="e.g. 'kh' as in 'Khan'"></label>
          <label>Example sentence <input name="example" value="${esc(it.example)}" autocapitalize="off"></label>
          <label>Example meaning <input name="example_meaning" value="${esc(it.example_meaning)}"></label>
          <label>Usage note <textarea name="note" rows="2" placeholder="e.g. Only said to elders">${esc(it.note)}</textarea></label>
        </details>
      </li>`;
  }

  function render() {
    view.innerHTML = `
      <form class="panel editor" id="ed" novalidate>
        <div class="head-row">
          <h1>${lessonId ? 'Edit' : 'New'} lesson · Day <input name="day_number" class="day-in" type="number" min="1" value="${lesson.day_number}" aria-label="Day number"></h1>
        </div>
        <label>Title <input name="title" value="${esc(lesson.title)}" required></label>
        <label>Note to your friend <textarea name="intro" rows="2" placeholder="Optional. Shown before the lesson starts.">${esc(lesson.intro)}</textarea></label>
        ${lessonId ? '' : `<p class="muted small">Suggested words are filled in below. Fill in the ones you want, remove the rest, or add your own. Rows without a Sourashtra word are skipped.</p>`}
        <ol class="items">${items.map(itemHTML).join('')}</ol>
        <button type="button" class="btn ghost wide" data-add>Add a word</button>
        <div class="save-bar">
          ${lessonId ? `<button type="button" class="link danger" data-del>Delete lesson</button>` : '<span></span>'}
          <div class="row">
            <a class="btn ghost" href="#/lessons">Cancel</a>
            <button class="btn primary" type="submit">Save lesson</button>
          </div>
        </div>
      </form>`;
  }

  render();
  const form = () => view.querySelector('#ed');

  view.addEventListener('input', (e) => {
    const el = e.target;
    if (!el.name) return;
    markDirty();
    const li = el.closest('[data-i]');
    if (li) {
      items[+li.dataset.i][el.name] = el.value;
      if (el.name === 'word') li.classList.toggle('empty', !el.value);
    } else if (el.name in lesson) {
      lesson[el.name] = el.name === 'day_number' ? +el.value : el.value;
    }
  });

  view.addEventListener('change', (e) => {
    const i = e.target.dataset.upload;
    if (i === undefined || !e.target.files[0]) return;
    const f = e.target.files[0];
    if (f.size > 5 * 1024 * 1024) return toast('That file is over 5 MB. Keep clips short.', 'error');
    setBlob(+i, f);
    markDirty();
    render();
  });

  function setBlob(i, blob) {
    if (items[i]._url) URL.revokeObjectURL(items[i]._url);
    items[i]._blob = blob;
    items[i]._url = URL.createObjectURL(blob);
  }

  view.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const ds = b.dataset;

    if ('add' in ds) {
      items.push(blankItem());
      render();
      view.querySelector(`[data-i="${items.length - 1}"] input[name=meaning]`)?.focus();
    } else if (ds.rm !== undefined) {
      const it = items[+ds.rm];
      if ((it.word || it._blob || it.audio_path) && !confirm(`Remove "${it.word || it.meaning}"?`)) return;
      items.splice(+ds.rm, 1);
      markDirty();
      render();
    } else if (ds.record !== undefined) {
      if (recording) return;
      try {
        const rec = await startRecording();
        recording = { index: +ds.record, rec };
        render();
        recording.timer = setInterval(() => {
          const s = Math.floor((Date.now() - rec.startedAt) / 1000);
          const t = view.querySelector('.rec-on .t');
          if (t) t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
          if (s >= 30) view.querySelector('.rec-on')?.click(); // keep clips short
        }, 250);
      } catch {
        toast('Microphone not available. Allow microphone access for this site and try again.', 'error');
      }
    } else if (ds.stop !== undefined) {
      const { index, rec, timer } = recording;
      clearInterval(timer);
      recording = null;
      const blob = await rec.stop();
      if (blob.size > 0) { setBlob(index, blob); markDirty(); }
      render();
    } else if (ds.local !== undefined) {
      const it = items[+ds.local];
      try {
        if (it._url) await playUrl(it._url);
        else if (it.audio_path) await playUrl(await ctx.store.audioUrl(it.audio_path));
      } catch { toast('Could not play this recording.', 'error'); }
    } else if (ds.noaudio !== undefined) {
      const it = items[+ds.noaudio];
      it._blob = null; it._url = null; it.audio_path = null;
      markDirty();
      render();
    } else if ('del' in ds) {
      if (!confirm(`Delete Day ${lesson.day_number}: ${lesson.title}? Your friend's progress on these words is deleted too.`)) return;
      await ctx.store.deleteLesson(lesson.id);
      dirty = false;
      window.onbeforeunload = null;
      toast('Lesson deleted');
      ctx.go('#/lessons');
    }
  });

  view.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (recording) return toast('Stop the recording first.', 'error');
    if (!lesson.title.trim()) return toast('Give the lesson a title.', 'error');
    const keep = items.filter((it) => it.word.trim());
    const missingMeaning = keep.find((it) => !it.meaning.trim());
    if (!keep.length) return toast('Fill in at least one Sourashtra word.', 'error');
    if (missingMeaning) return toast(`Add the English meaning for "${missingMeaning.word}".`, 'error');

    const btn = form().querySelector('[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      for (const it of keep) {
        if (it._blob) {
          it.audio_path = await ctx.store.uploadAudio(it._blob);
          it._blob = null;
        }
      }
      const clean = keep.map((it) => {
        const row = Object.fromEntries(ITEM_FIELDS.map((f) => [f, typeof it[f] === 'string' ? it[f].trim() : it[f]]));
        for (const f of ITEM_FIELDS) if (row[f] === '') row[f] = null;
        return row;
      });
      await ctx.store.saveLesson({ ...lesson, title: lesson.title.trim(), intro: lesson.intro.trim() || null }, clean);
      dirty = false;
      window.onbeforeunload = null;
      const skipped = items.length - keep.length;
      toast(`Lesson saved${skipped ? ` · ${skipped} empty row${skipped > 1 ? 's' : ''} skipped` : ''}`, 'ok');
      ctx.go('#/');
    } catch (ex) {
      toast(ex.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Save lesson';
    }
  });
}

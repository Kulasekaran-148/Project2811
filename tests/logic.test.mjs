import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, loosen, checkTyped, lessonQuiz, reviewQuiz, possibleKinds } from '../js/quiz.js';
import { newRecord, grade, strength, isLearned, isDue } from '../js/srs.js';
import { streakFrom } from '../js/util.js';

const item = (id, word, meaning, extra = {}) => ({ id, word, meaning, ...extra });
const pool = [
  item('a', 'akka', 'elder sister', { audio_path: 'x.mp4' }),
  item('b', 'khaana', 'food'),
  item('c', 'paani', 'water', { alternatives: 'pani, paanee' }),
  item('d', 'dudh', 'milk'),
  item('e', 'ghar', 'house'),
];

test('normalize ignores case, punctuation and accents', () => {
  assert.equal(normalize('  Ākka!! '), 'akka');
});

test('loose matching treats kh≈k and aa≈a', () => {
  assert.equal(loosen('khaana'), loosen('kana'));
});

test('typed answers: exact, close, alternative, wrong', () => {
  assert.equal(checkTyped('Akka', pool[0]), 'exact');
  assert.equal(checkTyped('aka', pool[0]), 'close');
  assert.equal(checkTyped('kaana', pool[1]), 'close');
  assert.equal(checkTyped('pani', pool[2]), 'exact');
  assert.equal(checkTyped('water', pool[2]), 'wrong');
  assert.equal(checkTyped('   ', pool[2]), 'wrong');
});

test('lesson quiz asks every item at least twice and includes a match round', () => {
  const qs = lessonQuiz(pool, pool);
  for (const it of pool) {
    const n = qs.filter((q) => q.item?.id === it.id).length;
    assert.ok(n >= 2, `${it.word} asked ${n} times`);
  }
  assert.ok(qs.some((q) => q.kind === 'match'));
  for (const q of qs.filter((q) => q.options)) {
    assert.ok(q.options.some((o) => o.id === q.item.id), 'correct answer is among options');
    assert.equal(new Set(q.options.map((o) => o.id)).size, q.options.length, 'no duplicate options');
  }
});

test('single-item lesson falls back to typing', () => {
  const one = [pool[1]];
  assert.deepEqual(possibleKinds(one[0], one), ['type']);
  const qs = lessonQuiz(one, one);
  assert.ok(qs.every((q) => q.kind === 'type'));
});

test('listen questions only for items with audio', () => {
  for (let i = 0; i < 30; i++) {
    for (const q of reviewQuiz(pool, pool)) if (q.kind === 'listen') assert.ok(q.item.audio_path);
  }
});

test('SRS: right answers space out, a miss resets', () => {
  const t0 = new Date('2026-01-01T10:00:00Z');
  let r = newRecord('a', 's');
  r = grade(r, true, t0); assert.equal(r.interval_days, 1);
  r = grade(r, true, t0); assert.equal(r.interval_days, 3); assert.ok(isLearned(r));
  r = grade(r, true, t0); assert.ok(r.interval_days >= 7);
  assert.ok(strength(r) >= 3);
  r = grade(r, false, t0);
  assert.equal(r.reps, 0); assert.equal(r.lapses, 1); assert.ok(r.ease < 2.65);
  assert.ok(!isDue(r, t0)); assert.ok(isDue(r, new Date(t0.getTime() + 11 * 60000)));
});

test('streak counts consecutive days, allowing today to be pending', () => {
  assert.equal(streakFrom(['2026-10-21', '2026-10-22', '2026-10-23'], '2026-10-23'), 3);
  assert.equal(streakFrom(['2026-10-21', '2026-10-22'], '2026-10-23'), 2);
  assert.equal(streakFrom(['2026-10-20'], '2026-10-23'), 0);
});

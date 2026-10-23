import { shuffle } from './util.js';

// ---------- Answer checking ----------
// Spelling Sourashtra in English letters is never fully standard, so typed
// answers are checked leniently:
//   exact   – matches after ignoring case, spaces and punctuation
//   close   – matches once breathy "h", doubled letters and long vowels are
//             ignored (kha ≈ ka, aa ≈ a). Counted correct, with the spelling shown.

export function normalize(s) {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '') // strip accents/diacritics
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function loosen(s) {
  return normalize(s)
    .replace(/([bcdgjkptsz])h/g, '$1') // kh→k, th→t, bh→b, sh→s …
    .replace(/(.)\1+/g, '$1') // aa→a, ll→l
    .replace(/\s/g, '');
}

/** Every spelling the teacher accepts for an item. */
export function acceptedSpellings(item) {
  const alts = String(item.alternatives || '')
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return [item.word, ...alts];
}

export function checkTyped(input, item) {
  const n = normalize(input);
  if (!n) return 'wrong';
  const all = acceptedSpellings(item);
  if (all.some((a) => normalize(a) === n)) return 'exact';
  if (all.some((a) => loosen(a) === loosen(n))) return 'close';
  return 'wrong';
}

// ---------- Question generation ----------
// Question kinds:
//   meaning  – hear/see the word, pick its meaning
//   word     – see the meaning, pick the word
//   listen   – hear the word only, pick its meaning (needs audio)
//   type     – see the meaning, type the word
//   match    – match up to 4 words with their meanings (lesson practice only)

function options(target, pool, field, n = 4, rand) {
  const seen = new Set([target[field].trim().toLowerCase()]);
  const others = [];
  for (const it of shuffle(pool, rand)) {
    const v = it[field].trim().toLowerCase();
    if (it.id !== target.id && !seen.has(v)) { seen.add(v); others.push(it); }
    if (others.length >= n - 1) break;
  }
  return shuffle([target, ...others], rand);
}

function questionFor(item, kind, pool, rand) {
  if (kind === 'type') return { kind, item };
  const field = kind === 'word' ? 'word' : 'meaning';
  return { kind, item, options: options(item, pool, field, 4, rand) };
}

/** Kinds that can be asked about `item`, given what else is in the pool. */
export function possibleKinds(item, pool) {
  const kinds = ['type'];
  const distinctMeanings = new Set(pool.map((p) => p.meaning.trim().toLowerCase())).size;
  const distinctWords = new Set(pool.map((p) => p.word.trim().toLowerCase())).size;
  if (distinctMeanings >= 2) kinds.push('meaning');
  if (distinctWords >= 2) kinds.push('word');
  if (item.audio_path && distinctMeanings >= 2) kinds.push('listen');
  return kinds;
}

/**
 * Practice right after a lesson: every new item is asked twice in two
 * different ways (an easy recognition question first, then a harder one),
 * plus one matching round.
 * `pool` = every item the student could see as a distractor.
 */
export function lessonQuiz(items, pool, rand = Math.random) {
  const qs = [];
  const recog = [];
  const recall = [];
  for (const it of items) {
    const kinds = possibleKinds(it, pool);
    const easy = kinds.includes('meaning') ? 'meaning' : kinds[0];
    const hardChoices = kinds.filter((k) => k !== easy && k !== 'meaning');
    const hard = hardChoices.length ? hardChoices[Math.floor(rand() * hardChoices.length)] : 'type';
    recog.push(questionFor(it, easy, pool, rand));
    recall.push(questionFor(it, hard, pool, rand));
  }
  qs.push(...shuffle(recog, rand));
  const matchable = uniqueBy(items, (i) => i.meaning.trim().toLowerCase());
  if (matchable.length >= 3) qs.push({ kind: 'match', items: shuffle(matchable, rand).slice(0, 4) });
  qs.push(...shuffle(recall, rand));
  return qs;
}

/** Review session: one question per due item, mixed kinds, weighted to harder ones. */
export function reviewQuiz(items, pool, rand = Math.random) {
  return shuffle(items, rand).map((it) => {
    const kinds = possibleKinds(it, pool);
    const weighted = kinds.flatMap((k) => (k === 'type' || k === 'listen' ? [k, k] : [k]));
    return questionFor(it, weighted[Math.floor(rand() * weighted.length)], pool, rand);
  });
}

function uniqueBy(arr, key) {
  const seen = new Set();
  return arr.filter((x) => (seen.has(key(x)) ? false : (seen.add(key(x)), true)));
}

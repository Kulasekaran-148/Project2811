// Spaced repetition (a simplified SM-2).
// Every word the student has met has a progress record. Answering it right
// pushes the next review further out; answering it wrong brings it back soon.

const DAY = 24 * 60 * 60 * 1000;
const RETRY_AFTER_MISS = 10 * 60 * 1000; // a missed word comes back in 10 minutes

export function newRecord(itemId, studentId) {
  return {
    student_id: studentId,
    item_id: itemId,
    ease: 2.5,
    interval_days: 0,
    reps: 0,
    lapses: 0,
    correct: 0,
    wrong: 0,
    skipped: 0,
    due_at: new Date().toISOString(),
    last_seen: null,
  };
}

/** Return an updated copy of a progress record after one graded answer. */
export function grade(rec, correct, now = new Date()) {
  const r = { ...rec, last_seen: now.toISOString() };
  if (correct) {
    r.correct += 1;
    r.reps += 1;
    if (r.reps === 1) r.interval_days = 1;
    else if (r.reps === 2) r.interval_days = 3;
    else r.interval_days = Math.round(r.interval_days * r.ease);
    r.ease = Math.min(3.0, r.ease + 0.05);
    r.due_at = new Date(now.getTime() + r.interval_days * DAY).toISOString();
  } else {
    r.wrong += 1;
    r.lapses += r.reps > 0 ? 1 : 0;
    r.reps = 0;
    r.interval_days = 0;
    r.ease = Math.max(1.3, r.ease - 0.2);
    r.due_at = new Date(now.getTime() + RETRY_AFTER_MISS).toISOString();
  }
  return r;
}

export const isDue = (rec, now = new Date()) => new Date(rec.due_at) <= now;

/** 0–4 strength buckets, for the progress bars. */
export function strength(rec) {
  if (!rec || rec.reps === 0) return 0;
  if (rec.interval_days < 3) return 1;
  if (rec.interval_days < 7) return 2;
  if (rec.interval_days < 21) return 3;
  return 4;
}

/** A word counts as learned once it has been recalled correctly twice in a row. */
export const isLearned = (rec) => !!rec && rec.reps >= 2;

export function accuracy(records) {
  let c = 0, w = 0;
  for (const r of records) { c += r.correct; w += r.wrong; }
  return c + w === 0 ? null : Math.round((100 * c) / (c + w));
}

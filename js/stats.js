import { localDay, streakFrom } from './util.js';
import { isDue, isLearned, accuracy } from './srs.js';

/** Everything the home and progress screens need about the student, in one load. */
export async function loadStudentData(store, studentId) {
  const lessons = await store.listLessons();
  if (!studentId) return { lessons, noStudent: true };

  const [progress, activity, completions] = await Promise.all([
    store.getProgress(studentId),
    store.listActivity(studentId),
    store.listCompletions(studentId),
  ]);

  const byItem = new Map(progress.map((p) => [p.item_id, p]));
  const allItems = lessons.flatMap((l) => l.items.map((i) => ({ ...i, lesson_title: l.title, day_number: l.day_number })));
  const completedIds = new Set(completions.map((c) => c.lesson_id));
  const nextLesson = lessons.find((l) => !completedIds.has(l.id) && l.items.length) || null;
  const today = localDay();
  const now = new Date();

  return {
    lessons,
    allItems,
    byItem,
    completedIds,
    completions,
    nextLesson,
    due: allItems.filter((i) => byItem.has(i.id) && isDue(byItem.get(i.id), now)),
    seen: allItems.filter((i) => byItem.has(i.id)),
    learned: allItems.filter((i) => isLearned(byItem.get(i.id))),
    accuracy: accuracy(progress),
    skips: progress.reduce((s, p) => s + (p.skipped || 0), 0),
    streak: streakFrom(activity.map((a) => a.day), today),
    xpToday: activity.filter((a) => a.day === today).reduce((s, a) => s + a.xp, 0),
    xpTotal: activity.reduce((s, a) => s + a.xp, 0),
    activeDays: new Set(activity.map((a) => a.day)),
    lastActive: activity.map((a) => a.created_at).sort().at(-1) || null,
  };
}

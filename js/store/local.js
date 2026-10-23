// Demo backend: everything lives in this browser's localStorage.
// Lets you try the app (as teacher and as student) before setting up Supabase.

const KEY = 'sourashtra-demo-v1';
const STUDENT_ID = 'demo-student';
const TEACHER_ID = 'demo-teacher';

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through to a fresh state */ }
  return { role: 'teacher', lessons: [], items: [], progress: [], activity: [], completions: [] };
}

let db = load();
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch (e) {
    throw new Error('This browser is out of space for demo data (recordings take room). Set up Supabase to store more.');
  }
}

const userFor = (role) => ({
  id: role === 'teacher' ? TEACHER_ID : STUDENT_ID,
  role,
  name: role === 'teacher' ? 'Teacher' : 'Student',
});

export const localStore = {
  mode: 'demo',
  user: null,

  async init() {
    this.user = userFor(db.role);
    return this.user;
  },
  async signIn() { return this.user; },
  async signOut() {},

  setRole(role) {
    db.role = role;
    persist();
    this.user = userFor(role);
  },

  async resetDemo() {
    localStorage.removeItem(KEY);
    db = load();
    this.user = userFor(db.role);
  },

  async listLessons() {
    return db.lessons
      .map((l) => ({
        ...l,
        items: db.items.filter((i) => i.lesson_id === l.id).sort((a, b) => a.position - b.position),
      }))
      .sort((a, b) => a.day_number - b.day_number);
  },

  async saveLesson(lesson, items) {
    const now = new Date().toISOString();
    const existing = db.lessons.find((l) => l.id === lesson.id);
    if (existing) Object.assign(existing, lesson, { updated_at: now });
    else db.lessons.push({ ...lesson, created_at: now, updated_at: now });
    db.items = db.items.filter((i) => i.lesson_id !== lesson.id);
    items.forEach((it, idx) => db.items.push({ ...it, lesson_id: lesson.id, position: idx }));
    persist();
  },

  async deleteLesson(id) {
    const itemIds = new Set(db.items.filter((i) => i.lesson_id === id).map((i) => i.id));
    db.lessons = db.lessons.filter((l) => l.id !== id);
    db.items = db.items.filter((i) => i.lesson_id !== id);
    db.progress = db.progress.filter((p) => !itemIds.has(p.item_id));
    db.completions = db.completions.filter((c) => c.lesson_id !== id);
    persist();
  },

  async uploadAudio(blob) {
    return await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(blob);
    });
  },
  async audioUrl(path) { return path; },

  async getStudentId() { return STUDENT_ID; },

  async getProgress(studentId) { return db.progress.filter((p) => p.student_id === studentId); },
  async saveProgress(records) {
    for (const r of records) {
      const i = db.progress.findIndex((p) => p.student_id === r.student_id && p.item_id === r.item_id);
      if (i >= 0) db.progress[i] = r; else db.progress.push(r);
    }
    persist();
  },

  async addActivity(a) {
    db.activity.push({ ...a, created_at: new Date().toISOString() });
    persist();
  },
  async listActivity(studentId) { return db.activity.filter((a) => a.student_id === studentId); },

  async completeLesson(c) {
    db.completions.push({ ...c, completed_at: new Date().toISOString() });
    persist();
  },
  async listCompletions(studentId) { return db.completions.filter((c) => c.student_id === studentId); },
};

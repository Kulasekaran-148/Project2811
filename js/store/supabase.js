// Supabase backend: shared between the teacher's and student's devices.
// Table and policy definitions are in supabase/schema.sql.

const BUCKET = 'audio';

export async function createSupabaseStore(url, anonKey) {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const sb = createClient(url, anonKey);
  const urlCache = new Map();

  const check = ({ data, error }) => {
    if (error) throw new Error(error.message);
    return data;
  };

  return {
    mode: 'supabase',
    user: null,

    async init() {
      const { data } = await sb.auth.getSession();
      if (!data.session) return (this.user = null);
      return (this.user = await this._loadProfile(data.session.user));
    },

    async _loadProfile(authUser) {
      const p = check(await sb.from('profiles').select('*').eq('id', authUser.id).maybeSingle());
      if (!p) throw new Error('Your account has no profile yet. Run the setup SQL in README step 4.');
      return { id: authUser.id, role: p.role, name: p.display_name || authUser.email, email: authUser.email };
    },

    async signIn(email, password) {
      const data = check(await sb.auth.signInWithPassword({ email, password }));
      return (this.user = await this._loadProfile(data.user));
    },

    async signOut() {
      await sb.auth.signOut();
      this.user = null;
    },

    async listLessons() {
      const lessons = check(await sb.from('lessons').select('*, items(*)').order('day_number'));
      for (const l of lessons) l.items.sort((a, b) => a.position - b.position);
      return lessons;
    },

    async saveLesson(lesson, items) {
      const { items: _drop, ...row } = lesson;
      check(await sb.from('lessons').upsert({ ...row, updated_at: new Date().toISOString() }));
      const old = check(await sb.from('items').select('id, audio_path').eq('lesson_id', lesson.id));
      const keep = new Set(items.map((i) => i.id));
      const keepAudio = new Set(items.map((i) => i.audio_path).filter(Boolean));
      const removed = old.filter((o) => !keep.has(o.id)).map((o) => o.id);
      if (removed.length) check(await sb.from('items').delete().in('id', removed));
      if (items.length) {
        check(await sb.from('items').upsert(items.map((it, idx) => ({ ...it, lesson_id: lesson.id, position: idx }))));
      }
      const orphanAudio = old.map((o) => o.audio_path).filter((p) => p && !keepAudio.has(p));
      if (orphanAudio.length) await sb.storage.from(BUCKET).remove(orphanAudio);
    },

    async deleteLesson(id) {
      const old = check(await sb.from('items').select('audio_path').eq('lesson_id', id));
      check(await sb.from('lessons').delete().eq('id', id)); // items, progress cascade
      const paths = old.map((o) => o.audio_path).filter(Boolean);
      if (paths.length) await sb.storage.from(BUCKET).remove(paths);
    },

    async uploadAudio(blob) {
      const ext = (blob.type.split('/')[1] || 'webm').split(';')[0];
      const path = `${crypto.randomUUID()}.${ext}`;
      check(await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'audio/webm' }));
      return path;
    },

    async audioUrl(path) {
      const hit = urlCache.get(path);
      if (hit && hit.exp > Date.now()) return hit.url;
      const data = check(await sb.storage.from(BUCKET).createSignedUrl(path, 3600));
      urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 50 * 60 * 1000 });
      return data.signedUrl;
    },

    async getStudentId() {
      if (this.user.role === 'student') return this.user.id;
      const s = check(await sb.from('profiles').select('id').eq('role', 'student').limit(1).maybeSingle());
      return s?.id ?? null;
    },

    async getProgress(studentId) {
      return check(await sb.from('progress').select('*').eq('student_id', studentId));
    },
    async saveProgress(records) {
      if (records.length) check(await sb.from('progress').upsert(records));
    },

    async addActivity(a) { check(await sb.from('activity').insert(a)); },
    async listActivity(studentId) {
      return check(await sb.from('activity').select('*').eq('student_id', studentId));
    },

    async completeLesson(c) { check(await sb.from('completions').insert(c)); },
    async listCompletions(studentId) {
      return check(await sb.from('completions').select('*').eq('student_id', studentId));
    },
  };
}

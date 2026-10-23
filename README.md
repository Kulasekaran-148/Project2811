# Sourashtra with family

A two-person language app: the **teacher** adds a short lesson each day (words, their own recordings, notes), and the **student** learns it Duolingo-style, with flashcards, quizzes, spaced-repetition reviews, streaks and XP.

- Plain HTML/CSS/JavaScript, with no build step. GitHub Pages serves it as is.
- [Supabase](https://supabase.com) (free tier) stores the lessons, the recordings and the student's progress, so both of you see the same data on any device.
- Until Supabase is set up, the app runs in **demo mode**: data stays in your browser, and a switch at the top lets you try both the teacher and student views.

## Try it locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Put it online (about 20 minutes, all free)

### 1. GitHub Pages
1. Create a new repository on GitHub (public, or private with a paid plan) and push this folder to it:
   ```sh
   git remote add origin https://github.com/<you>/sourashtra-app.git
   git push -u origin main
   ```
2. In the repo, open **Settings → Pages**, choose **Deploy from a branch**, then **main** and **/ (root)**, and save.
3. After a minute the app is live at `https://<you>.github.io/sourashtra-app/`. It is still in demo mode at this point.

### 2. Create the Supabase project
1. Sign up at supabase.com and create a new project. Pick the region closest to you, for example Mumbai.
2. Open **SQL Editor → New query**, paste the whole of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. This creates the tables, the access rules and the private `audio` storage bucket.

### 3. Create the two accounts
1. Go to **Authentication → Users → Add user → Create new user**. Add yourself and your friend, each with an email and password, and tick **Auto Confirm User**.
2. Turn off public sign-ups so nobody else can join: **Authentication → Sign In / Providers**, then switch off **Allow new users to sign up**.

### 4. Make yourself the teacher
Everyone starts as a student. In the **SQL Editor**, run this with your email:

```sql
update profiles set role = 'teacher', display_name = 'Your name' where email = 'you@example.com';
update profiles set display_name = 'Friend''s name' where email = 'friend@example.com';
```

### 5. Connect the app
1. In Supabase, open **Project Settings → API Keys** and copy the **Project URL** and the **anon / publishable** key.
2. Paste them into [`js/config.js`](js/config.js):
   ```js
   export const SUPABASE_URL = 'https://xxxx.supabase.co';
   export const SUPABASE_ANON_KEY = 'eyJ…';   // or sb_publishable_…
   ```
3. Commit and push. Both of you can now sign in at the GitHub Pages address.

The anon/publishable key is meant to be public. The rules in `schema.sql` decide what each account can do: only the teacher can change lessons, and the student can only write their own progress. **Never** put the `service_role` / secret key in this repo.

> Supabase pauses free projects after a stretch with no activity (about a week). Daily use keeps it awake. If it does pause, press **Restore** in the Supabase dashboard; no data is lost.

## How it works

**Teacher (Today tab).** Each day the app suggests a topic and a list of English meanings (`js/curriculum.js`). You fill in how your family says each one, record it, and optionally add a Tamil spelling, other accepted spellings, a "sounds like" hint, an example sentence and a usage note. Rows you leave empty are skipped. *Preview as student* runs the lesson without saving anything. The Student tab shows streak, accuracy, the words they struggle with, and the strength of every word.

**Student.**
- **Lesson:** meet each new word on a card with your recording, then practise. The practice mixes *pick the meaning*, *pick the word*, *listen and pick* (for recorded words), *match the pairs* and *type it*. Missed questions come back at the end.
- **Review:** spaced repetition (a simplified SM-2, `js/srs.js`). A word answered right comes back after 1 day, then 3, then increasingly longer gaps. A miss brings it back within minutes.
- **Spelling:** typed answers ignore case and punctuation, and count near-misses such as `kh`≈`k` or `aa`≈`a` as correct while showing your spelling (`js/quiz.js`). Add other accepted spellings per word in the editor.
- 10 XP per correct first answer, plus 20 for finishing a lesson; daily goal 50 XP (`js/config.js`).

**Recordings** are saved as MP4/AAC where the browser supports it, so they play on iPhones and Android alike. Clips stop automatically at 30 seconds. You can also upload an audio file.

## Project layout

```
index.html            app shell
css/style.css         all styling (light + dark)
js/app.js             routing and header/tabs
js/views/             teacher.js, student.js, session.js (lessons and reviews), auth.js
js/store/             local.js (demo) and supabase.js, same interface
js/quiz.js, srs.js    question generation, answer checking, spaced repetition
js/curriculum.js      daily topic suggestions; edit freely
supabase/schema.sql   database, access rules, audio bucket
tests/                unit tests (npm test) and a browser run-through (python3 tests/e2e.py)
```

## Ideas for later
- A pronunciation chart lesson (the sounds English and Tamil letters can't show).
- Sentence-building questions from example sentences.
- A daily reminder for the teacher.

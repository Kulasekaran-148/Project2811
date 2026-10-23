export function renderSignIn(ctx, view, onSignedIn) {
  view.innerHTML = `
    <section class="panel narrow">
      <h1>Sign in</h1>
      <p class="muted">Use the email and password set up for you.</p>
      <form id="signin" class="stack">
        <label>Email <input name="email" type="email" autocomplete="username" required></label>
        <label>Password <input name="password" type="password" autocomplete="current-password" required></label>
        <p class="error" id="err" hidden></p>
        <button class="btn primary" type="submit">Sign in</button>
      </form>
    </section>`;

  view.querySelector('#signin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const btn = e.target.querySelector('button');
    const err = view.querySelector('#err');
    btn.disabled = true;
    err.hidden = true;
    try {
      onSignedIn(await ctx.store.signIn(f.get('email').trim(), f.get('password')));
    } catch (ex) {
      err.textContent = /invalid/i.test(ex.message) ? 'Email or password is wrong.' : ex.message;
      err.hidden = false;
      btn.disabled = false;
    }
  });
}
